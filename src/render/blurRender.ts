import { IGLContext } from "../utils/shader";

export function initBlurRender(ctx: IGLContext) {
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


    let stencilRenderBuf = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencilRenderBuf);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL, gl.canvas.width, gl.canvas.height);


}
