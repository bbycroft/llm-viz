import { createShaderProgram, IProgram } from "./utils/shader";

export type IProgramState = ReturnType<typeof initialize>;

export function initialize(canvasEl: HTMLCanvasElement) {

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

    let quadVao = gl.createVertexArray();
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
        llmLayer: createGptLayer(gl),
    };
}

export function createGptLayer(gl: WebGL2RenderingContext) {
    let B = 1;
    let nHeads = 4;
    let T = 64;
    let C = 32;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    // weights are packed into rgb channels. Probably should specify number of channels here
    let residualInput = createBufferTex(gl, B * T, C);
    let qkvWeights = createBufferTex(gl, nHeads * A, C);
    let qkvOutput = createBufferTex(gl, B * nHeads * T, A);
    let attnMatrixExp = createBufferTex(gl, B * nHeads * T, T);
    let attnMatrixExpSumInv = createBufferTex(gl, B * nHeads, T);
    let scaledVectors = createBufferTex(gl, B * T, A * nHeads); // the y dim == C, since A = C / nHeads

    let qkvProg = createShaderProgram(gl, /*glsl*/`#version 300 es
        precision highp float; in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D residualInput;
        uniform sampler2D qkvWeights;
        out vec4 qkvOutput;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // input pos is (B, T) (C)
            // Q is (nHeads, A) (C)

            // qkvOutput [pos] is (B, nHeads, T) (A)

            int headIdx = pos.x / ${T};
            int tIdx = pos.x % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            vec3 a = vec3(0.0);
            for (int i = 0; i < ${C}; i++) {
                float inVal = texelFetch(residualInput, ivec2(pos.x, i), 0).r;
                vec3 qVal = texelFetch(qkvWeights, ivec2(headIdx * ${A} + pos.y, i), 0).rgb;
                a += inVal * qVal;
            }

            qkvOutput = vec4(a, 1);
        }
    `);

    let selfAttendProg = createShaderProgram(gl, /* glsl */`#version 300 es
        precision highp float; in vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
    `, /* glsl */`#version 300 es
        precision highp float;
        uniform sampler2D qkvOutput;
        out float attnMatrixExp;

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            // qkvOutput pos is (B, nHeads, T) (A)
            // attnMatrixExp is (B, nHeads, T) (T)

            int headIdx = pos.x / ${T};
            int tIdx = pos.x % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            int qIdx = headIdx * ${T} + tIdx;
            int kIdx = headIdx * ${T} + pos.y;

            if (tIdx > pos.y) { // # forward attention only (not sure if this is correct)
                discard;
            }

            float a = 0.0;
            for (int i = 0; i < ${A}; i++) {
                float q = texelFetch(qkvOutput, ivec2(qIdx, i), 0).r;
                float k = texelFetch(qkvOutput, ivec2(kIdx, i), 0).g;
                a += q * k;
            }

            attnMatrixExp = exp(a);
        }
    `);

    /*
    let attnMatrixSumProg = createShaderProgram(gl, `#version 300 es
        precision highp float; in vec2 a_position;
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

    gl.useProgram(qkvProg.program);
    gl.bindAttribLocation(qkvProg.program, 0, "a_position");
    gl.uniform1i(gl.getUniformLocation(qkvProg.program, "residualInput"), 0);
    gl.uniform1i(gl.getUniformLocation(qkvProg.program, "qkvWeights"), 1);

    let qkvPhase = createRenderPhase(gl, qkvProg, [residualInput, qkvWeights], [qkvOutput]);

    let selfAttendPhase = createRenderPhase(gl, selfAttendProg, [qkvOutput], [attnMatrixExp]);

    // let attnMatrixExpSumInvPhase = createRenderPhase(gl, attnMatrixSumProg, [attnMatrixExp], [attnMatrixExpSumInv]);

    return {
        qkvPhase,
        selfAttendPhase,
    };
}

export interface IBufferTex {
    width: number;
    height: number;
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

function createBufferTex(gl: WebGL2RenderingContext, width: number, height: number): IBufferTex {
    let texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
        width,
        height,
        texture,
    };
}

function writeToBufferTex(gl: WebGL2RenderingContext, buffer: IBufferTex, data: Float32Array) {
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, buffer.width, buffer.height, gl.RGBA, gl.FLOAT, data);
}

function readFromRenderPhase(gl: WebGL2RenderingContext, phase: IRenderPhase, buffer: IBufferTex, out: Float32Array) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + phase.destBuffers.indexOf(buffer));
    gl.readPixels(0, 0, buffer.width, buffer.height, gl.RGBA, gl.FLOAT, out);
}

export function mainLoop(state: IProgramState, time: DOMHighResTimeStamp, dt: number) {

    let { canvasEl, gl } = state;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clearColor(0, 0, 0.4, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(state.prog0.program);
    gl.bindVertexArray(state.quadVao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}
