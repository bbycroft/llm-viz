import { Mat4f } from "../utils/matrix";
import { bindFloatAttribs, createElementBuffer, createFloatBuffer, createShaderProgram, ensureElementBufferSize, ensureFloatBufferSize, IGLContext, uploadElementBuffer, uploadFloatBuffer } from "../utils/shader";
import { Vec3, Vec4 } from "../utils/vector";
import { modelViewUboText, UboBindings } from "./sharedRender";

export type ITriRender = ReturnType<typeof initTriRender>;

export function initTriRender(ctx: IGLContext) {


    /* Lines are made up of several quads, 1(?) for each line segment.

    we'll use TRIANGLE_STRIP for rendering, and indexed arrays to support primitive restart.

    Just gonna render each line segment separately. Corners too much of a pain for now!

    Still need to get the quad to face the camera, and to be the right size.
    I think it makes sense to do this after projection in the vertex shader.

    */

    let gl = ctx.gl;

    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    let triVbo = gl.createBuffer()!;
    let byteStride = bindFloatAttribs(gl, triVbo, {}, [
        { name: 'a_pos', size: 3 },
        { name: 'a_normal', size: 3 },
        { name: 'a_color', size: 4 },
        { name: 'a_uv', size: 2 },
    ]);
    let triFloatBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, triVbo, 1024, byteStride);

    let triIbo = gl.createBuffer()!;
    let triIndexBuf = createElementBuffer(gl, triIbo, 1024);

    let triShader = createShaderProgram(ctx, 'triangles', /*glsl*/`#version 300 es
        precision highp float;
        ${modelViewUboText}
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        layout(location = 2) in vec4 a_color;
        layout(location = 3) in vec2 a_uv;
        out vec4 v_color;
        out vec2 v_uv;
        out vec3 v_normal;
        void main() {
            gl_Position = u_view * u_model * vec4(a_position, 1);
            v_color = a_color;
            v_normal = a_normal;
            v_uv = a_uv;
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec2 v_uv;
        in vec3 v_normal;
        in vec4 v_color;
        out vec4 o_color;

        void main() {
            o_color = v_color;
        }
    `, [], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;

    return {
        gl,
        vao,
        vbo: triFloatBuf,
        ibo: triIndexBuf,
        triShader,
    };
}

let defaultN = new Vec3(0, 0, 1);

export function addVert(render: ITriRender, p: Vec3, color: Vec4, n?: Vec3, mtx?: Mat4f) {
    ensureFloatBufferSize(render.vbo, 1);
    ensureElementBufferSize(render.ibo, 1);
    let vbo = render.vbo;
    let ibo = render.ibo;
    let fBuf = vbo.localBuf;
    let iBuf = ibo.localBuf;
    let fIdx = vbo.usedEls * vbo.strideFloats;
    let iIdx = ibo.usedVerts;

    p = mtx ? mtx.mulVec3Proj(p) : p;
    n = n ? mtx ? mtx.mulVec3ProjVec(n) : n : defaultN;

    fBuf[fIdx + 0] = p.x;
    fBuf[fIdx + 1] = p.y;
    fBuf[fIdx + 2] = p.z;
    fBuf[fIdx + 3] = n.x;
    fBuf[fIdx + 4] = n.y;
    fBuf[fIdx + 5] = n.z;
    fBuf[fIdx + 6] = color.x;
    fBuf[fIdx + 7] = color.y;
    fBuf[fIdx + 8] = color.z;
    fBuf[fIdx + 9] = color.w;
    fBuf[fIdx + 10] = 0; // uv.x
    fBuf[fIdx + 11] = 0; // uv.y

    iBuf[iIdx] = vbo.usedEls;

    vbo.usedEls += 1;
    ibo.usedVerts += 1;
}

export function addQuad(render: ITriRender, tl: Vec3, br: Vec3, color: Vec4, mtx?: Mat4f, isEnd: boolean = true) {
    let tr = new Vec3(br.x, tl.y, tl.z);
    let bl = new Vec3(tl.x, br.y, br.z);
    addVert(render, tl, color, undefined, mtx);
    addVert(render, bl, color, undefined, mtx);
    addVert(render, tr, color, undefined, mtx);
    addVert(render, br, color, undefined, mtx);
    if (isEnd) {
        ensureElementBufferSize(render.ibo, 1);
        render.ibo.localBuf[render.ibo.usedVerts] = 0xffffffff; // primitive restart
        render.ibo.usedVerts += 1;
    }
}

export function addPrimitiveRestart(render: ITriRender) {
    ensureElementBufferSize(render.ibo, 1);
    render.ibo.localBuf[render.ibo.usedVerts] = 0xffffffff; // primitive restart
    render.ibo.usedVerts += 1;
}

export function renderAllTris(render: ITriRender) {
    let gl = render.gl;

    uploadFloatBuffer(gl, render.vbo);
    uploadElementBuffer(gl, render.ibo);

    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(render.triShader.program);
    gl.bindVertexArray(render.vao);
    gl.drawElements(gl.TRIANGLE_STRIP, render.ibo.usedVerts, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
}

export function resetTriRender(render: ITriRender) {
    render.ibo.usedVerts = 0;
    render.vbo.usedEls = 0;
}
