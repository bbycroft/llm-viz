import { Mat4f } from "@/src/utils/matrix";
import { bindFloatAttribs, createElementBuffer, createFloatBuffer, createShaderProgram, ensureElementBufferSize, ensureFloatBufferSize, IGLContext, resetElementBufferMap, resetFloatBufferMap, uploadElementBuffer, uploadFloatBuffer } from "@/src/utils/shader";
import { Vec3, Vec4 } from "@/src/utils/vector";
import { ISharedRender, modelViewUboText, RenderPhase, UboBindings } from "./sharedRender";

export type ITriRender = ReturnType<typeof initTriRender>;

export function initTriRender(ctx: IGLContext, sharedRender: ISharedRender) {


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
    let triFloatBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, triVbo, 1024, byteStride, null);

    let triIbo = gl.createBuffer()!;
    let triIndexBuf = createElementBuffer(gl, triIbo, 1024, sharedRender);

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
        sharedRender,
    };
}

let defaultN = new Vec3(0, 0, 1);

let _vertP = new Vec3();
let _vertN = new Vec3();
export function addVert(render: ITriRender, p: Vec3, color: Vec4, n?: Vec3, mtx?: Mat4f) {
    let phase = render.sharedRender.activePhase;
    let vbo = render.vbo.localBufs[0];
    let ibo = render.ibo.localBufs[phase];
    ensureFloatBufferSize(vbo, 1);
    ensureElementBufferSize(ibo, 1);
    let fBuf = vbo.buf;
    let iBuf = ibo.buf;
    let fIdx = vbo.usedEls * vbo.strideFloats;
    let iIdx = ibo.usedVerts;

    if (mtx) {
        mtx.mulVec3Affine_(p, _vertP);
        mtx.mulVec3AffineVec_(n || defaultN, _vertN);
    } else {
        _vertP.copy_(p);
        _vertN.copy_(n || defaultN);
    }

    fBuf[fIdx + 0] = _vertP.x;
    fBuf[fIdx + 1] = _vertP.y;
    fBuf[fIdx + 2] = _vertP.z;
    fBuf[fIdx + 3] = _vertN.x;
    fBuf[fIdx + 4] = _vertN.y;
    fBuf[fIdx + 5] = _vertN.z;
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

let _quadTr = new Vec3();
let _quadBl = new Vec3();
export function addQuad(render: ITriRender, tl: Vec3, br: Vec3, color: Vec4, mtx?: Mat4f, isEnd: boolean = true) {
    _quadTr.x = br.x;
    _quadTr.y = tl.y;
    _quadTr.z = tl.z;

    _quadBl.x = tl.x;
    _quadBl.y = br.y;
    _quadBl.z = br.z;

    addVert(render, tl, color, undefined, mtx);
    addVert(render, _quadBl, color, undefined, mtx);
    addVert(render, _quadTr, color, undefined, mtx);
    addVert(render, br, color, undefined, mtx);
    if (isEnd) {
        let phase = render.sharedRender.activePhase;
        let localBuf = render.ibo.localBufs[phase];
        ensureElementBufferSize(localBuf, 1);
        localBuf.buf[localBuf.usedVerts++] = 0xffffffff; // primitive restart
    }
}

export function addPrimitiveRestart(render: ITriRender) {
    let phase = render.sharedRender.activePhase;
    let localBuf = render.ibo.localBufs[phase];
    ensureElementBufferSize(localBuf, 1);
    localBuf.buf[localBuf.usedVerts++] = 0xffffffff; // primitive restart
}

export function uploadAllTris(render: ITriRender) {
    let gl = render.gl;
    uploadFloatBuffer(gl, render.vbo);
    uploadElementBuffer(gl, render.ibo);
}

export function renderAllTris(render: ITriRender, renderPhase: RenderPhase) {
    let gl = render.gl;
    let localIdxBuf = render.ibo.localBufs[renderPhase];
    if (localIdxBuf.usedVerts === 0) {
        return;
    }

    gl.depthMask(renderPhase === RenderPhase.Opaque);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(render.triShader.program);
    gl.bindVertexArray(render.vao);
    gl.drawElements(gl.TRIANGLE_STRIP, localIdxBuf.usedVerts, gl.UNSIGNED_INT, localIdxBuf.glOffsetBytes);
    gl.depthMask(true);
}

export function resetTriRender(render: ITriRender) {
    resetElementBufferMap(render.ibo);
    resetFloatBufferMap(render.vbo);
}

export function checkError(gl: WebGL2RenderingContext, msg: string) {
    let errno = gl.getError();
    if (errno !== gl.NO_ERROR) {
        console.error('GLERROR:', msg, '0x' + errno.toString(16));
        return true;
    }
    return false;
}
