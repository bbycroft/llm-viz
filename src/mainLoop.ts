import { write } from "fs";
import { createShaderProgram, IProgram } from "./utils/shader";
import { ITensorSet, TensorF32 } from "./utils/tensor";

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

export function createGptLayer(gl: WebGL2RenderingContext, dataAndModel: IDataAndModel) {
    let model = dataAndModel.model;
    let head0Prefix = "transformer.h.0.attn.";

    let config = model.config;

    let B = 1;
    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    // move the 1st dim to the end, i.e. the QKV split will be packed into RGB tex channels
    let tAttnWeight = model[head0Prefix + 'c_attn.weight'].view([3, nHeads, A, C]).permute(1, 2, 3, 0);
    let tAttnBias = model[head0Prefix + 'c_attn.bias'].view([3, nHeads, A]).permute(1, 2, 0);
    let tProjWeight = model[head0Prefix + 'c_proj.weight'];
    let tProjBias = model[head0Prefix + 'c_proj.bias'];

    console.log('tAttnWeight', tAttnWeight.shape);
    console.log('tAttnBias', tAttnBias.shape);

    let residualInput = createBufferTex(gl, C, B * T, 1);
    let qkvWeights = createBufferTex(gl, C, nHeads * A, 3);
    let qkvBias = createBufferTex(gl, 1, nHeads * A, 3);
    let qkvOutput = createBufferTex(gl, A, B * nHeads * T, 4); // 4 channels required for color-renderable
    let attnMatrixExp = createBufferTex(gl, T, B * nHeads * T, 1);
    let attnMatrixExpSumInv = createBufferTex(gl, T, B * nHeads, 1);
    let scaledVectors = createBufferTex(gl, A * nHeads, B * T, 1); // the x dim == C, since A = C / nHeads

    writeToBufferTex(gl, qkvWeights, tAttnWeight.toFloat32Array());
    writeToBufferTex(gl, qkvBias, tAttnBias.toFloat32Array());

    let qkvProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D residualInput;
        uniform sampler2D qkvWeights;
        uniform sampler2D qkvBias;
        out vec4 qkvOutput;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // input      is (B, T)      (C)
            // qkvWeights is (nHeads, A) (C) [3]
            // qkvBias    is (nHeads, A) (1) [3]

            // qkvOutput [pos] is (B, nHeads, T) (A)

            int headIdx = pos.y / ${T};
            int tIdx = pos.y % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            vec3 a = texelFetch(qkvBias, ivec2(0, headIdx * ${A} + pos.x), 0).rgb;
            for (int i = 0; i < ${C}; i++) {
                float inVal = texelFetch(residualInput, ivec2(i, tIdx                  ), 0).r;
                vec3 qkvVal = texelFetch(qkvWeights,    ivec2(i, headIdx * ${A} + pos.x), 0).rgb;
                a += inVal * qkvVal;
            }

            qkvOutput = vec4(a, 1);
        }
    `);

    let selfAttendProg = createShaderProgram(gl, /* glsl */`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /* glsl */`#version 300 es
        precision highp float;
        uniform sampler2D qkvOutput;
        out float attnMatrixExp;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // qkvOutput pos is (B, nHeads, T) (A)
            // attnMatrixExp is (B, nHeads, T) (T)

            int headIdx = pos.y / ${T};
            int tIdxQ = pos.y % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            int tIdxK = pos.x;

            if (tIdxK > tIdxQ) { // # forward attention only
                discard;
            }

            float a = 0.0;
            for (int i = 0; i < ${A}; i++) {
                float q = texelFetch(qkvOutput, ivec2(i, headIdx * ${T} + tIdxQ), 0).r;
                float k = texelFetch(qkvOutput, ivec2(i, headIdx * ${T} + tIdxK), 0).g;
                a += q * k;
            }

            attnMatrixExp = a / sqrt(float(${A}));
        }
    `);

    /*
    let attnMatrixSumProg = createShaderProgram(gl, `#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, `#version 300 es
        precision highp float;
        uniform sampler2D attnMatrixExp;
        out float attnMatrixExpSumInv;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // attnMatrixExp is (B, nHeads, T) (T)
            // attnMatrixExpSumInv is (B, nHeads) (T)

            int headIdx = pos.x / ${T};
            int tIdx = pos.x % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            int qIdx = headIdx * ${T} + tIdx;
            int kIdx = headIdx * ${T} + pos.y;

            if (kIdx > qIdx) {
                discard;
            }

            // @TODO

            float a = 0.0;
            for (int i = 0; i < ${A}; i++) {
                float q = texelFetch(qkvOutput, ivec2(qIdx, i), 0).r;
                float k = texelFetch(qkvOutput, ivec2(kIdx, i), 0).g;
                a += q * k;
            }

            attnMatrixExp = exp(a);
        }
    `);
    */

    if (!qkvProg || !selfAttendProg) {
        throw new Error("Failed to create shader program");
    }

    setProgramTexUniforms(gl, qkvProg, ["residualInput", "qkvWeights", "qkvBias"]);
    let qkvPhase = createRenderPhase(gl, qkvProg, [residualInput, qkvWeights, qkvBias], [qkvOutput]);

    setProgramTexUniforms(gl, selfAttendProg, ["qkvOutput"]);
    let selfAttendPhase = createRenderPhase(gl, selfAttendProg, [qkvOutput], [attnMatrixExp]);

    // let attnMatrixExpSumInvPhase = createRenderPhase(gl, attnMatrixSumProg, [attnMatrixExp], [attnMatrixExpSumInv]);

    return {
        residualInput,
        attnMatrixExp,
        qkvPhase,
        selfAttendPhase,
    };
}

function runModel(state: IProgramState) {
    let {
        gl,
        llmLayer: { qkvPhase, selfAttendPhase, residualInput, },
        quadVao,
        dataAndModel,
    } = state;

    let config = dataAndModel.model.config;
    let B = 1;
    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    let tX = dataAndModel.data.x; // (B, T, C)
    let tQ = dataAndModel.data.q; // (B, nHeads, T, A)
    let tK = dataAndModel.data.k; // (B, nHeads, T, A)
    let tV = dataAndModel.data.v; // (B, nHeads, T, A)
    let tAttn = dataAndModel.data.att; // (B, nHeads, T, T)

    console.log('tX', tX.shape);
    writeToBufferTex(gl, residualInput, tX.buffer);

    runRenderPhase(gl, quadVao, qkvPhase);

    console.log('written bytes to residualInput', tX.buffer.length);

    let array = new Float32Array(B * nHeads * T * A * 4);

    let qActual = new Float32Array(B * nHeads * T * A);
    let kActual = new Float32Array(B * nHeads * T * A);
    let vActual = new Float32Array(B * nHeads * T * A);

    readFromRenderPhase(gl, qkvPhase, qkvPhase.destBuffers[0], array);

    for (let i = 0; i < B * nHeads * T * A; i++) {
        qActual[i] = array[i * 4 + 0];
        kActual[i] = array[i * 4 + 1];
        vActual[i] = array[i * 4 + 2];
    }
    console.log('qEqual', arraysEqual(qActual, tQ.toFloat32Array()));
    console.log('kEqual', arraysEqual(kActual, tK.toFloat32Array()));
    console.log('vEqual', arraysEqual(vActual, tV.toFloat32Array()));

    runRenderPhase(gl, quadVao, selfAttendPhase);

    // logArr('attnExpected0', tAttn.buffer.subarray(11 * 0), 11);
    // logArr('attnExpected0', tAttn.buffer.subarray(11 * 1), 11);
    // logArr('attnExpected1', tAttn.buffer.subarray(11 * 2), 11);

    let q0 = tQ.toFloat32Array().subarray(0, A);
    let k0 = tK.toFloat32Array().subarray(0, A);

    logArr('q0', q0, A);
    logArr('k0', k0, A);

    let dotProd = q0.reduce((a, b, i) => a + b * k0[i], 0) / Math.sqrt(A);
    console.log('dotProd', dotProd);

    let attnActual = new Float32Array(B * nHeads * T * T);
    readFromRenderPhase(gl, selfAttendPhase, selfAttendPhase.destBuffers[0], attnActual);

    for (let i of [0, 1, 2, 10, 11, 12, 13]) {
        logArr('attnExpected' + i.toString().padStart(2), tAttn.buffer.subarray(11 * i), 11);
        logArr('attnActual  ' + i.toString().padStart(2), attnActual.subarray(11 * i), 11);
    }
    // logArr('attnActual0', attnActual.subarray(11 * 1), 11);
    // logArr('attnActual1', attnActual.subarray(11 * 2), 11);
}

function logArr(name: string, arr: Float32Array, n = 15) {
    console.log(name, [...arr.subarray(0, n)].map(a => parseFloat(a.toFixed(3))));
}

function arraysEqual(a: Float32Array, b: Float32Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > 1e-4) return false;
    }
    return true;
}

export function setProgramTexUniforms(gl: WebGL2RenderingContext, program: IProgram, names: string[]) {
    gl.useProgram(program.program);
    for (let i = 0; i < names.length; i++) {
        let loc = gl.getUniformLocation(program.program, names[i]);
        if (!loc) throw new Error("Failed to get uniform location: " + names[i]);
        gl.uniform1i(loc, i);
    }
}

export interface IBufferTex {
    width: number;
    height: number;
    channels: number;
    texture: WebGLTexture;
}

// we transform from 1 set of textures to another set within a shader
// each buffer is a standard layer of the ML model
// note that the dest buffers must all be the same size, but the src buffers can be different sizes
export interface IRenderPhase {
    destBuffers: IBufferTex[];
    srcBuffers: IBufferTex[];
    fbo: WebGLFramebuffer;
    program: IProgram;
}

function createRenderPhase(gl: WebGL2RenderingContext, program: IProgram, src: IBufferTex[], dest: IBufferTex[]): IRenderPhase {
    let fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    for (let i = 0; i < dest.length; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, dest[i].texture, 0);
    }

    gl.drawBuffers(dest.map((_, i) => gl.COLOR_ATTACHMENT0 + i));

    return {
        destBuffers: dest,
        srcBuffers: src,
        fbo,
        program,
    };
}

function runRenderPhase(gl: WebGL2RenderingContext, quadVao: WebGLVertexArrayObject, phase: IRenderPhase) {
    gl.useProgram(phase.program.program);
    for (let i = 0; i < phase.srcBuffers.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, phase.srcBuffers[i].texture);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function createBufferTex(gl: WebGL2RenderingContext, width: number, height: number, channels: number): IBufferTex {
    let texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let [format, iformat] = channelsToFormat(gl, channels);
    gl.texImage2D(gl.TEXTURE_2D, 0, iformat, width, height, 0, format, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
        width,
        height,
        texture,
        channels,
    };
}

function writeToBufferTex(gl: WebGL2RenderingContext, buffer: IBufferTex, data: Float32Array) {
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
    let [format] = channelsToFormat(gl, buffer.channels);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, buffer.width, buffer.height, format, gl.FLOAT, data);
}

function readFromRenderPhase(gl: WebGL2RenderingContext, phase: IRenderPhase, buffer: IBufferTex, out: Float32Array) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + phase.destBuffers.indexOf(buffer));
    let [format] = channelsToFormat(gl, buffer.channels);
    gl.readPixels(0, 0, buffer.width, buffer.height, format, gl.FLOAT, out);
}

function channelsToFormat(gl: WebGL2RenderingContext, channels: number): [GLenum, GLenum] {
    switch (channels) {
        case 1: return [gl.RED, gl.R32F];
        case 2: return [gl.RG, gl.RG32F];
        case 3: return [gl.RGB, gl.RGB32F];
        case 4: return [gl.RGBA, gl.RGBA32F];
        default: throw new Error(`Invalid number of channels: ${channels}. Must be 1, 2, 3, or 4.`);
    }
}

export function mainLoop(state: IProgramState, time: DOMHighResTimeStamp, dt: number) {

    let { canvasEl, gl } = state;

    runModel(state)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clearColor(0, 0, 0.4, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(state.prog0.program);
    gl.bindVertexArray(state.quadVao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}
