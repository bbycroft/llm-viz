import { createGptLayer } from "./SelfAttentionLayer";
import { arraysEqual, readFromRenderPhase, runRenderPhase, writeToBufferTex } from "./utils/renderPhases";
import { createShaderProgram } from "./utils/shader";
import { ITensorSet } from "./utils/tensor";

export interface IDataAndModel {
    data: ITensorSet;
    model: ITensorSet;
}

export type IProgramState = ReturnType<typeof initialize>;

export function initialize(canvasEl: HTMLCanvasElement, dataAndModel: IDataAndModel) {

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
            residualInput,
            qkvPhase,
            selfAttendPhase,
            attnMatrixAggPhase,
            attnMatrixSoftmaxPhase,
            scaledVectorsPhase,
            projPhase,
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
    let tQ = dataAndModel.data.q; // (B, nHeads, T, A)
    let tK = dataAndModel.data.k; // (B, nHeads, T, A)
    let tV = dataAndModel.data.v; // (B, nHeads, T, A)
    let tAttn = dataAndModel.data.att; // (B, nHeads, T, T)
    let tAttnSm = dataAndModel.data.attSm; // (B, nHeads, T, T)
    let tY = dataAndModel.data.y; // (B, T, C)
    let tYProj = dataAndModel.data.yProj; // (B, T, C)

    gl.bindVertexArray(quadVao);

    writeToBufferTex(gl, residualInput, tX.buffer);
    runRenderPhase(gl, qkvPhase);

    let array = new Float32Array(B * nHeads * T * A * 4);
    let qActual = new Float32Array(B * nHeads * T * A);
    let kActual = new Float32Array(B * nHeads * T * A);
    let vActual = new Float32Array(B * nHeads * T * A);

    readFromRenderPhase(gl, qkvPhase, 0, array);

    for (let i = 0; i < B * nHeads * T * A; i++) {
        qActual[i] = array[i * 4 + 0];
        kActual[i] = array[i * 4 + 1];
        vActual[i] = array[i * 4 + 2];
    }
    console.log('qEqual', arraysEqual(qActual, tQ.toFloat32Array()));
    console.log('kEqual', arraysEqual(kActual, tK.toFloat32Array()));
    console.log('vEqual', arraysEqual(vActual, tV.toFloat32Array()));

    runRenderPhase(gl, selfAttendPhase);
    runRenderPhase(gl, attnMatrixAggPhase);
    runRenderPhase(gl, attnMatrixSoftmaxPhase);

    let attnMatrixSoftmax = new Float32Array(B * nHeads * T * T);
    readFromRenderPhase(gl, attnMatrixSoftmaxPhase, 0, attnMatrixSoftmax);
    console.log('smEqual', arraysEqual(attnMatrixSoftmax, tAttnSm.toFloat32Array()));

    runRenderPhase(gl, scaledVectorsPhase);
    let scaledVectors = new Float32Array(B * T * C);
    readFromRenderPhase(gl, scaledVectorsPhase, 0, scaledVectors);
    console.log('tequal', arraysEqual(scaledVectors, tY.toFloat32Array()));

    runRenderPhase(gl, projPhase);
    let proj = new Float32Array(B * T * C);
    readFromRenderPhase(gl, projPhase, 0, proj);

    console.log('projEqual', arraysEqual(proj, tYProj.toFloat32Array()));
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
