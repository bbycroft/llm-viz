import { createShaderProgram, IGLContext } from "@/src/utils/shader";
import { Dim, Vec3 } from "@/src/utils/vector";
import { UboBindings } from "./sharedRender";

export type IBlurRender = ReturnType<typeof initBlurRender>;

export function initBlurRender(ctx: IGLContext, quadVao: WebGLVertexArrayObject) {
    let gl = ctx.gl;

    // have a pair of framebuffers to ping-pong between
    // we'll render to a half-size buffer to save memory/compute

    // will need a few different shaders to draw our buffers, since most things (like text or blocks)
    // have unusual drawing behaviour (wait text is OK)

    // Draw all our targets to a buffer.
    // Blur it to another buffer.
    // Blur it in the other dir to yet another buffer.
    // Ping-pong between 2 & 3 as desired
    // Draw the final result to the screen, subtracting the original from the blurred result, since
    // we're after the outline of the original objects.
    // Composite that directly onto the output buffer.
    // We want our blurred colors to participate in the depth test


    // For respecting the depth buffer:
    //  - Render the object to our buffer, with a depth test (no write)
    //  - Render an expanded version of the object to our buffer, with a depth test (no write)
    //    - Write to the stencil buffer
    //  - Now do the blur, applying the stencil test
    let w = Math.max(gl.canvas.width, 1);
    let h = Math.max(gl.canvas.height, 1);

    // let stencilRenderBuf = gl.createRenderbuffer();
    // gl.bindRenderbuffer(gl.RENDERBUFFER, stencilRenderBuf);
    // gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, w, h);

    let initialFbo = gl.createFramebuffer()!;
    let initialTex = gl.createTexture()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, initialFbo);
    gl.bindTexture(gl.TEXTURE_2D, initialTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, initialTex, 0);

    // gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilRenderBuf); // sharing the stencil buffer
    // gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    // also attach depth buffer of primary scene fbo

    function createBlurFbo() {
        let fbo = gl.createFramebuffer()!;
        let tex = gl.createTexture()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        // gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilRenderBuf); // sharing the stencil buffer
        // gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

        {
            let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.log(`Blur framebuffer not complete: ${status.toString(16)}`);
            }
        }

        return { fbo, tex };
    }

    let blurFbos = [createBlurFbo(), createBlurFbo()];

    let radiusPx = 4;
    let blurPixelStride = 2;

    // create ubo for blur shader, which are the [0..4] weights for the 5 samples (to the right of the center pixel & including)
    let blurWeights = new Float32Array((radiusPx * 2 + 1) * 4);
    let blurWeightsSum = 0;
    let blurSigma = radiusPx / 2;
    for (let i = -radiusPx; i <= radiusPx; i++) {
        let x = i / blurSigma;
        let w = Math.exp(-x * x * 0.5);
        let wIdx = i + radiusPx;
        blurWeights[wIdx * 4] = w;
        blurWeightsSum += w;
    }
    for (let i = 0; i < radiusPx * 2 + 1; i++) {
        blurWeights[i * 4] /= blurWeightsSum;
    }

    let blurUbo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, blurUbo);
    gl.bufferData(gl.UNIFORM_BUFFER, blurWeights.buffer, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, UboBindings.blur, blurUbo);

    function createBlurShader(name: string, dim: Dim) {
        return createShaderProgram(ctx.shaderManager, name, /*glsl*/`#version 300 es
            precision highp float;
            layout(location = 0) in vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0, 1);
            }
        `, /*glsl*/`#version 300 es
            precision highp float;

            layout(std140) uniform BlurWeights {
                float weights[${radiusPx * 2 + 1}];
            };

            uniform sampler2D u_texture;
            out vec4 o_color;

            void main() {
                ivec2 pos = ivec2(gl_FragCoord.xy);
                vec4 color = vec4(0);
                vec4 center = texelFetch(u_texture, pos, 0);
                for (int i = -${radiusPx}; i <= ${radiusPx}; i++) {
                    int wId = i + ${radiusPx};
                    color += texelFetch(u_texture, pos + ivec2(${dim === Dim.X ? 'i, 0' : '0, i'}) * ${blurPixelStride}, 0) * weights[wId];
                }
                o_color = max(color, center);
            }
        `, ['u_texture'], { uboBindings: { 'BlurWeights': UboBindings.blur } })!;
    }

    let horizShader = createBlurShader("blurHoriz", Dim.X);
    let vertShader = createBlurShader("blurVert", Dim.Y);

    let overlayShader = createShaderProgram(ctx.shaderManager, "blurOverlay", /*glsl*/`#version 300 es
            precision highp float;
            layout(location = 0) in vec2 a_position;
            out vec2 v_uv;
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                v_uv = a_position * 0.5 + 0.5;
            }
        `, /*glsl*/`#version 300 es
            precision highp float;
            uniform sampler2D u_texture;
            uniform sampler2D u_initTexture;
            in vec2 v_uv;
            out vec4 o_color;

            void main() {
                ivec2 pos = ivec2(gl_FragCoord.xy);
                vec4 blurColor = texture(u_texture, v_uv);
                // vec4 initColor = texture(u_initTexture, v_uv);

                vec4 base = vec4(0.9, 0.9, 0.9, 0.1);
                // if (blurColor.a == 0.0) {
                //     blurColor = vec4(0.1, 0.1, 0.1, 1.0);
                // }
                o_color = blurColor; // + initColor * (1.0 - blurColor.a);
                // o_color = initColor;
            }
        `, ['u_texture'])!;

    return {
        gl,
        quadVao,
        // stencilRenderBuf,
        initialFbo,
        initialTex,
        blurFbos,
        horizShader,
        vertShader,
        overlayShader,
        currViewSize: new Vec3(0, 0),
        blurFactor: 0.3,
    };
}

export function setupBlurTarget(blur: IBlurRender) {
    let gl = blur.gl;
    let w = gl.canvas.width;
    let h = gl.canvas.height;
    let blurW = Math.floor(w * blur.blurFactor);
    let blurH = Math.floor(h * blur.blurFactor);

    if (blur.currViewSize.x !== w || blur.currViewSize.y !== h) {
        // gl.bindRenderbuffer(gl.RENDERBUFFER, blur.stencilRenderBuf);
        // gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, blurW, blurH);

        gl.bindTexture(gl.TEXTURE_2D, blur.initialTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, blurW, blurH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        for (let fbo of blur.blurFbos) {
            gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, blurW, blurH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        blur.currViewSize = new Vec3(w, h);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, blur.initialFbo);
    gl.viewport(0, 0, blurW, blurH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
}

export function renderBlur(blur: IBlurRender, destFbo: WebGLFramebuffer | null) {
    let gl = blur.gl;
    let w = gl.canvas.width;
    let h = gl.canvas.height;
    let blurW = Math.floor(w * blur.blurFactor);
    let blurH = Math.floor(h * blur.blurFactor);
    gl.bindVertexArray(blur.quadVao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);

    gl.activeTexture(gl.TEXTURE0);

    { // initial -> blurFbos[0] (horizontal pass)
        gl.bindTexture(gl.TEXTURE_2D, blur.initialTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, blur.blurFbos[0].fbo);
        gl.viewport(0, 0, blurW, blurH);

        gl.useProgram(blur.horizShader.program);
        gl.uniform1i(blur.horizShader.locs.u_texture, 0);

        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    { // blurFbos[0] -> blurFbos[1] (vertical pass)
        gl.bindTexture(gl.TEXTURE_2D, blur.blurFbos[0].tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, blur.blurFbos[1].fbo);
        gl.viewport(0, 0, blurW, blurH);

        gl.useProgram(blur.vertShader.program);
        gl.uniform1i(blur.vertShader.locs.u_texture, 0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    { // blurFbos[1] -> destFbo (overlay)
        gl.enable(gl.BLEND);
        gl.viewport(0, 0, w, h);

        gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
        gl.bindTexture(gl.TEXTURE_2D, blur.blurFbos[1].tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, blur.initialTex);

        gl.useProgram(blur.overlayShader.program);
        gl.uniform1i(blur.overlayShader.locs.u_texture, 0);
        // gl.uniform1i(blur.overlayShader.locs.u_initTexture, 1);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }
}
