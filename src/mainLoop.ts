import { createShaderProgram, IProgram } from "./utils/shader";
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

    let residualInput     = createBufferTex(gl, C, B * T, 1);
    let qkvWeight         = createBufferTex(gl, C, nHeads * A, 3);
    let qkvBias           = createBufferTex(gl, 1, nHeads * A, 3);
    let qkvOutput         = createBufferTex(gl, A, B * nHeads * T, 4); // 4 channels required for color-renderable
    let attnMatrix        = createBufferTex(gl, T, B * nHeads * T, 1);
    let attnMatrixAgg     = createBufferTex(gl, 1, B * nHeads * T, 2);
    let attnMatrixSoftmax = createBufferTex(gl, T, B * nHeads * T, 1);
    let scaledVectors     = createBufferTex(gl, C, B * T, 1);
    let projWeight        = createBufferTex(gl, C, C, 1);
    let projBias          = createBufferTex(gl, 1, C, 1);
    let projOutput        = createBufferTex(gl, C, B * T, 1);

    writeToBufferTex(gl, qkvWeight, tAttnWeight.toFloat32Array());
    writeToBufferTex(gl, qkvBias, tAttnBias.toFloat32Array());
    writeToBufferTex(gl, projWeight, tProjWeight.toFloat32Array());
    writeToBufferTex(gl, projBias, tProjBias.toFloat32Array());

    let qkvProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D residualInput;
        uniform sampler2D qkvWeight;
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
                vec3 qkvVal = texelFetch(qkvWeight,     ivec2(i, headIdx * ${A} + pos.x), 0).rgb;
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
        out float attnMatrix;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // qkvOutput pos is (B, nHeads, T) (A)
            // attnMatrix    is (B, nHeads, T) (T)

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

            attnMatrix = a / sqrt(float(${A}));
        }
    `);

    let attnMatrixAggProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D attnMatrix;
        out vec2 attnMatrixAgg;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // attnMatrix is    (B, nHeads, T) (T)
            // attnMatrixAgg is (B, nHeads, T) (1) [2]

            int tIdxY = pos.y % ${T};

            // Pass 1 finds the max
            float m = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float p = texelFetch(attnMatrix, ivec2(i, pos.y), 0).r;
                m = max(m, p);
            }

            // Pass 2 finds the sum (shifted by max)
            float a = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float p = texelFetch(attnMatrix, ivec2(i, pos.y), 0).r;
                a += exp(p - m);
            }

            // Store sufficient information to compute/apply the softmax
            attnMatrixAgg = vec2(1.0 / a, m);
        }
    `);

    let attnMatrixSoftmaxProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D attnMatrix;
        uniform sampler2D attnMatrixAgg;
        out float attnMatrixSoftmax;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // attnMatrix        is (B, nHeads, T) (T)
            // attnMatrixAgg     is (B, nHeads, T) (1) [2]
            // attnMatrixSoftmax is (B, nHeads, T) (T)

            int tIdxX = pos.x;
            int tIdxY = pos.y % ${T};

            if (tIdxX > tIdxY) { // # forward attention only
                attnMatrixSoftmax = 0.0;
                discard;
            }

            vec2 agg = texelFetch(attnMatrixAgg, ivec2(0, pos.y), 0).rg;
            float expSumInv = agg.r;
            float maxVal = agg.g;

            float p = texelFetch(attnMatrix, pos, 0).r;
            attnMatrixSoftmax = exp(p - maxVal) * expSumInv;
        }
    `);

    let scaledVectorsProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D qkvOutput;
        // uniform sampler2D attnMatrix;
        // uniform sampler2D attnMatrixAgg;
        uniform sampler2D attnMatrixSoftmax;
        out float scaledVectors;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // qkvOutput         is (B, nHeads, T) (A)
            // attnMatrix        is (B, nHeads, T) (T)
            // attnMatrixAgg     is (B, nHeads, T) (1) [2]
            // attnMatrixSoftmax is (B, nHeads, T) (T)
            // scaledVectors     is (B, T)         (A * nHeads)

            int aIdx = pos.x % ${A};
            int headIdx = pos.x / ${A};

            int tIdxY = pos.y % ${T};

            float res = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float sm = texelFetch(attnMatrixSoftmax, ivec2(i, headIdx * ${T} + tIdxY), 0).r;
                float v = texelFetch(qkvOutput, ivec2(aIdx, headIdx * ${T} + i), 0).b;
                res += sm * v;
            }

            scaledVectors = res;
        }
    `);

    let projProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; layout(location = 0) in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D scaledVectors;
        uniform sampler2D projWeight;
        uniform sampler2D projBias;
        out float projOutput;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // scaledVector is (B, T) (C)
            // projWeight   is (C)    (C)
            // projBias     is (C)    (1)

            float res = texelFetch(projBias, ivec2(0, pos.x), 0).r;
            for (int i = 0; i < ${C}; i++) {
                float w = texelFetch(projWeight, ivec2(i, pos.x), 0).r;
                float a = texelFetch(scaledVectors, ivec2(i, pos.y), 0).r;
                res += w * a;
            }

            projOutput = res;
        }
    `);

    if (!qkvProg || !selfAttendProg || !attnMatrixAggProg || !attnMatrixSoftmaxProg || !scaledVectorsProg || !projProg) {
        throw new Error("Failed to create shader program");
    }

    setProgramTexUniforms(gl, qkvProg, ["residualInput", "qkvWeight", "qkvBias"]);
    let qkvPhase = createRenderPhase(gl, qkvProg, [residualInput, qkvWeight, qkvBias], [qkvOutput]);

    setProgramTexUniforms(gl, selfAttendProg, ["qkvOutput"]);
    let selfAttendPhase = createRenderPhase(gl, selfAttendProg, [qkvOutput], [attnMatrix]);

    setProgramTexUniforms(gl, attnMatrixAggProg, ["attnMatrix"]);
    let attnMatrixAggPhase = createRenderPhase(gl, attnMatrixAggProg, [attnMatrix], [attnMatrixAgg]);

    /* Could potentially skip this phase, but will duplicate a bunch of sub, exp, mul's (overall relative cost unknown) */
    setProgramTexUniforms(gl, attnMatrixSoftmaxProg, ["attnMatrix", "attnMatrixAgg"]);
    let attnMatrixSoftmaxPhase = createRenderPhase(gl, attnMatrixSoftmaxProg, [attnMatrix, attnMatrixAgg], [attnMatrixSoftmax]);

    setProgramTexUniforms(gl, scaledVectorsProg, ["qkvOutput", "attnMatrixSoftmax"]);
    let scaledVectorsPhase = createRenderPhase(gl, scaledVectorsProg, [qkvOutput, attnMatrixSoftmax], [scaledVectors]);

    setProgramTexUniforms(gl, projProg, ["scaledVectors", "projWeight", "projBias"]);
    let projPhase = createRenderPhase(gl, projProg, [scaledVectors, projWeight, projBias], [projOutput]);

    return {
        residualInput,
        qkvPhase,
        selfAttendPhase,
        attnMatrixAggPhase,
        attnMatrixSoftmaxPhase,
        scaledVectorsPhase,
        projPhase,
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
    let tAttnSm = dataAndModel.data.attSm; // (B, nHeads, T, T)
    let tY = dataAndModel.data.y; // (B, T, C)
    let tYProj = dataAndModel.data.yProj; // (B, T, C)

    writeToBufferTex(gl, residualInput, tX.buffer);
    runRenderPhase(gl, quadVao, qkvPhase);

    /*
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
    */

    runRenderPhase(gl, quadVao, selfAttendPhase);

    // logArr('attnExpected0', tAttn.buffer.subarray(11 * 0), 11);
    // logArr('attnExpected0', tAttn.buffer.subarray(11 * 1), 11);
    // logArr('attnExpected1', tAttn.buffer.subarray(11 * 2), 11);

    /*
    let q0 = tQ.toFloat32Array().subarray(0, A);
    let k0 = tK.toFloat32Array().subarray(0, A);

    logArr('q0', q0, A);
    logArr('k0', k0, A);

    let dotProd = q0.reduce((a, b, i) => a + b * k0[i], 0) / Math.sqrt(A);
    console.log('dotProd', dotProd);
    */

    /*
    let attnActual = new Float32Array(B * nHeads * T * T);
    readFromRenderPhase(gl, selfAttendPhase, 0, attnActual);

    for (let i of [0, 1, 2, 10, 11, 12, 13]) {
        logArr('attnExpected' + i.toString().padStart(2), tAttn.buffer.subarray(11 * i), 11);
        logArr('attnActual  ' + i.toString().padStart(2), attnActual.subarray(11 * i), 11);
    }
    logArr('attnActual0', attnActual.subarray(11 * 1), 11);
    logArr('attnActual1', attnActual.subarray(11 * 2), 11);
    */

    runRenderPhase(gl, quadVao, attnMatrixAggPhase);
    runRenderPhase(gl, quadVao, attnMatrixSoftmaxPhase);

    let attnMatrixSoftmax = new Float32Array(B * nHeads * T * T);
    readFromRenderPhase(gl, attnMatrixSoftmaxPhase, 0, attnMatrixSoftmax);

    // logArr('agg:', attnMatrixAgg.subarray(0, 11), 11);
    // logArr('sm :', attnMatrixSoftmax.subarray(0, 22), 22);

    // for (let i of [0, 1, 2, 10, 11, 12, 13]) {
    //     logArr('smExpected' + i.toString().padStart(2), tAttnSm.buffer.subarray(11 * i), 11);
    //     logArr('smActual  ' + i.toString().padStart(2), attnMatrixSoftmax.subarray(11 * i), 11);
    // }

    console.log('smEqual', arraysEqual(attnMatrixSoftmax, tAttnSm.toFloat32Array()));

    runRenderPhase(gl, quadVao, scaledVectorsPhase);

    let scaledVectors = new Float32Array(B * T * C);
    readFromRenderPhase(gl, scaledVectorsPhase, 0, scaledVectors);

    console.log('tequal', arraysEqual(scaledVectors, tY.toFloat32Array()));

    // for (let i = 0; i < T; i++) {
        // logArr('scaledVectors' + i.toString().padStart(2), scaledVectors.subarray(C * i), C);
        // logArr('tY           ' + i.toString().padStart(2), tY.toFloat32Array().subarray(C * i), C);
        // logArr('delta        ' + i.toString().padStart(2), delta, C);
    // }
    // logArr('scaledVectors', scaledVectors.subarray(0, C), C);
    // logArr('tY', tY.toFloat32Array().subarray(0, C), C);

    runRenderPhase(gl, quadVao, projPhase);

    let proj = new Float32Array(B * T * C);
    readFromRenderPhase(gl, projPhase, 0, proj);

    console.log('projEqual', arraysEqual(proj, tYProj.toFloat32Array()));

    // for (let i = 0; i < 3; i++) {
    //     logArr('proj  ' + i.toString().padStart(2), proj.subarray(C * i), C);
    //     logArr('tYProj' + i.toString().padStart(2), tYProj.toFloat32Array().subarray(C * i), C);
    // }
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
        if (!loc) {
            console.log('uniform not found:', names[i], '(may just be unused)');
            continue;
        }
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
    if (data.length !== buffer.width * buffer.height * buffer.channels) {
        throw new Error('Data length does not match buffer size');
    }
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
    let [format] = channelsToFormat(gl, buffer.channels);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, buffer.width, buffer.height, format, gl.FLOAT, data);
}

function readFromRenderPhase(gl: WebGL2RenderingContext, phase: IRenderPhase, index: number, out: Float32Array) {
    let buffer = phase.destBuffers[index];
    if (out.length !== buffer.width * buffer.height * buffer.channels) {
        throw new Error('Data length does not match output size');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
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
