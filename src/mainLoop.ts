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
            blocks,
            output,
        },
        quadVao,
        dataAndModel,
    } = state;

    console.log('---- running model ----');

    let config = dataAndModel.model.config;
    let B = dataAndModel.data.config.B!;
    let C = config.n_embd;
    let T = config.block_size;

    let tX = dataAndModel.data.x; // (B, T, C)

    gl.bindVertexArray(quadVao);

    writeToBufferTex(gl, input, tX.buffer);

    for (let blockId = 0; blockId < blocks.length; blockId++) {
        let { ln_1, attn, ln_2, mlp } = blocks[blockId];

        runRenderPhase(gl, ln_1.normAggPhase);
        runRenderPhase(gl, ln_1.normApplyPhase);
        runRenderPhase(gl, attn.qkvPhase);
        runRenderPhase(gl, attn.selfAttendPhase);
        runRenderPhase(gl, attn.attnMatrixAggPhase);
        runRenderPhase(gl, attn.attnMatrixSoftmaxPhase);
        runRenderPhase(gl, attn.scaledVectorsPhase);
        runRenderPhase(gl, attn.proj.linearPhase);
        runRenderPhase(gl, ln_2.normAggPhase);
        runRenderPhase(gl, ln_2.normApplyPhase);
        runRenderPhase(gl, mlp.fcLayer.linearPhase);
        runRenderPhase(gl, mlp.geluPhase);
        runRenderPhase(gl, mlp.projLayer.linearPhase);

        let tBlockRes = dataAndModel.data[`block${blockId}`];
        let blockOutput = new Float32Array(B * T * C);
        readFromRenderPhase(gl, mlp.projLayer.linearPhase, 0, blockOutput);
        console.log(`block${blockId}Equal`, arraysEqual(blockOutput, tBlockRes.toFloat32Array()));
    }
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
