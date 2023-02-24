import { createGptLayer } from "./SelfAttentionLayer";
import { arraysEqual, readFromRenderPhase, runRenderPhase, writeToBufferTex } from "./utils/renderPhases";
import { createShaderProgram } from "./utils/shader";
import { ITensorSet } from "./utils/tensor";

export interface IDataAndModel {
    data: ITensorSet;
    model: ITensorSet;
}

export type IProgramState = ReturnType<typeof initialize>;

/* TODO: think about how to handle working computation buffers.

For each layer, we're typically abe to re-use the working memory buffers (provided they're the same dims, or smaller).
But the layers each have different weights.
However, for debugging etc, we also want to keep all the working buffers around.
We also want to re-use programs and shader objects where possible. Can just do a string compare on the shader source.
Baking in the constants remains a good idea I think, since the div/mod's can be flattened since they're often powers of 2 (& constant).

Also have the issue of passing input/output buffers between stages, where we can often re-use those buffers
(not always, e.g. layerNorm). However, the (B, T, C) buffers can sometimes allow for a ping-pong process.

We might as well build the nested structure of the real model, with each chunk having create + execute methods.
*/

export function initialize(canvasEl: HTMLCanvasElement, dataAndModel: IDataAndModel) {

    console.clear();
    let gl = canvasEl.getContext("webgl2")!;

    let ext = {
        extColorBufferFloat: gl.getExtension("EXT_color_buffer_float"),
    };

    let prog0 = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float;
        in vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0, 1);
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        // uniform sampler2D u_texture;

        out vec4 outColor;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            if (pos.x < 100 || pos.x > 200) {
                discard;
            }

            outColor = vec4(1, 0, 0, 1) * 0.6;
        }
    `);

    if (!prog0) {
        throw new Error("Failed to create shader program");
    }

    gl.bindAttribLocation(prog0.program, 0, "a_position");

    let quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        1, 1,
        -1, 1,
    ]), gl.STATIC_DRAW);

    let quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    return {
        canvasEl,
        gl,
        prog0,
        quadVao,
        quadVbo,
        ext,
        llmLayer: createGptLayer(gl, dataAndModel),
        dataAndModel,
    };
}

function runModel(state: IProgramState) {
    let {
        gl,
        llmLayer: {
            input,
            ln_1,
            attn,
            ln_2,
            mlp,
        },
        quadVao,
        dataAndModel,
    } = state;

    console.log('---- running model ----');

    let config = dataAndModel.model.config;
    let B = dataAndModel.data.config.B!;
    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    let tX = dataAndModel.data.x; // (B, T, C)
    let tLn1 = dataAndModel.data.ln1; // (B, T, C)
    let tQ = dataAndModel.data.q; // (B, nHeads, T, A)
    let tK = dataAndModel.data.k; // (B, nHeads, T, A)
    let tV = dataAndModel.data.v; // (B, nHeads, T, A)
    let tAttnSm = dataAndModel.data.attSm; // (B, nHeads, T, T)
    let tY = dataAndModel.data.y; // (B, T, C)
    let tAttnResid = dataAndModel.data.attnResid; // (B, T, C)
    // let tYProj = dataAndModel.data.yProj; // (B, T, C)
    let tLn2 = dataAndModel.data.ln2; // (B, T, C)
    let tFc = dataAndModel.data.fc; // (B, T, C * 4)
    let tGelu = dataAndModel.data.gelu; // (B, T, C * 4)
    let tMlpProj = dataAndModel.data.mlp; // (B, T, C)
    let tMlpResid = dataAndModel.data.mlpResid; // (B, T, C)

    gl.bindVertexArray(quadVao);

    writeToBufferTex(gl, input, tX.buffer);

    runRenderPhase(gl, ln_1.normAggPhase);
    runRenderPhase(gl, ln_1.normApplyPhase);

    let ln1 = new Float32Array(B * T * C);
    readFromRenderPhase(gl, ln_1.normApplyPhase, 0, ln1);
    console.log('ln1Equal', arraysEqual(ln1, tLn1.toFloat32Array()));

    runRenderPhase(gl, attn.qkvPhase);

    let array = new Float32Array(B * nHeads * T * A * 4);
    let qActual = new Float32Array(B * nHeads * T * A);
    let kActual = new Float32Array(B * nHeads * T * A);
    let vActual = new Float32Array(B * nHeads * T * A);

    readFromRenderPhase(gl, attn.qkvPhase, 0, array);

    for (let i = 0; i < B * nHeads * T * A; i++) {
        qActual[i] = array[i * 4 + 0];
        kActual[i] = array[i * 4 + 1];
        vActual[i] = array[i * 4 + 2];
    }
    console.log('qEqual', arraysEqual(qActual, tQ.toFloat32Array()));
    console.log('kEqual', arraysEqual(kActual, tK.toFloat32Array()));
    console.log('vEqual', arraysEqual(vActual, tV.toFloat32Array()));

    runRenderPhase(gl, attn.selfAttendPhase);
    runRenderPhase(gl, attn.attnMatrixAggPhase);
    runRenderPhase(gl, attn.attnMatrixSoftmaxPhase);

    let attnMatrixSoftmax = new Float32Array(B * nHeads * T * T);
    readFromRenderPhase(gl, attn.attnMatrixSoftmaxPhase, 0, attnMatrixSoftmax);
    console.log('smEqual', arraysEqual(attnMatrixSoftmax, tAttnSm.toFloat32Array()));

    runRenderPhase(gl, attn.scaledVectorsPhase);
    let scaledVectors = new Float32Array(B * T * C);
    readFromRenderPhase(gl, attn.scaledVectorsPhase, 0, scaledVectors);
    console.log('tequal', arraysEqual(scaledVectors, tY.toFloat32Array()));

    runRenderPhase(gl, attn.proj.linearPhase);
    let attnResid = new Float32Array(B * T * C);
    readFromRenderPhase(gl, attn.proj.linearPhase, 0, attnResid);
    console.log('attnResidEqual', arraysEqual(attnResid, tAttnResid.toFloat32Array()));

    runRenderPhase(gl, ln_2.normAggPhase);
    runRenderPhase(gl, ln_2.normApplyPhase);

    let ln2 = new Float32Array(B * T * C);
    readFromRenderPhase(gl, ln_2.normApplyPhase, 0, ln2);
    console.log('ln2Equal', arraysEqual(ln2, tLn2.toFloat32Array()));

    runRenderPhase(gl, mlp.fcLayer.linearPhase);
    let fc = new Float32Array(B * T * C * 4);
    readFromRenderPhase(gl, mlp.fcLayer.linearPhase, 0, fc);
    console.log('fcEqual', arraysEqual(fc, tFc.toFloat32Array()));

    runRenderPhase(gl, mlp.geluPhase);
    let gelu = new Float32Array(B * T * C * 4);
    readFromRenderPhase(gl, mlp.geluPhase, 0, gelu);
    console.log('geluEqual', arraysEqual(gelu, tGelu.toFloat32Array()));

    runRenderPhase(gl, mlp.projLayer.linearPhase);
    let mlpResid = new Float32Array(B * T * C);
    readFromRenderPhase(gl, mlp.projLayer.linearPhase, 0, mlpResid);
    console.log('mlpResidEqual', arraysEqual(mlpResid, tMlpResid.toFloat32Array()));
}

export function mainLoop(state: IProgramState, time: DOMHighResTimeStamp, dt: number) {

    let { gl } = state;

    runModel(state);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clearColor(0, 0, 0.4, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(state.prog0.program);
    gl.bindVertexArray(state.quadVao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function computeMeanStdDev(data: Float32Array) {

    // Use the Welford algorithm to compute the mean and variance

    let mean = 0;
    let M2 = 0;
    for (let i = 0; i < data.length; i++) {
        let x = data[i];
        let delta = x - mean;
        mean += delta / (i + 1);
        M2 += delta * (x - mean);
    }

    return {
        mean,
        stdDev: Math.sqrt(M2 / data.length + 1e-5),
    };
}
