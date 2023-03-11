import { Mat4f } from "../utils/matrix";
import { bindFloatAttribs, createElementBuffer, createFloatBuffer, createShaderProgram, ensureElementBufferSize, ensureFloatBufferSize, IGLContext, resetElementBufferMap, resetFloatBufferMap, uploadElementBuffer, uploadFloatBuffer } from "../utils/shader";
import { Vec3, Vec4 } from "../utils/vector";
import { modelViewUboText, UboBindings } from "./sharedRender";

export type ILineRender = ReturnType<typeof createLineRender>;

const floatsPerVert = 14;
const floatsPerLine = floatsPerVert * 4;

const bytesPerVert = floatsPerVert * 4;
const bytesPerLine = floatsPerLine * 4;

export function createLineRender(ctx: IGLContext) {


    /* Lines are made up of several quads, 1(?) for each line segment.

    we'll use TRIANGLE_STRIP for rendering, and indexed arrays to support primitive restart.

    Just gonna render each line segment separately. Corners too much of a pain for now!

    Still need to get the quad to face the camera, and to be the right size.
    I think it makes sense to do this after projection in the vertex shader.

    */

    let gl = ctx.gl;

    let lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(lineVao);

    let lineVbo = gl.createBuffer()!;
    let strideBytes = bindFloatAttribs(gl, lineVbo, { }, [
        { name: 'a_position', size: 3 },
        { name: 'a_lineDir', size: 3 },
        { name: 'a_color', size: 4 },
        { name: 'a_thickness', size: 1 },
        { name: 'a_normal', size: 3 },
    ])

    let lineFloatBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, lineVbo, 1024, strideBytes);

    let lineIbo = gl.createBuffer()!;
    let lineIndexBuf = createElementBuffer(gl, lineIbo, 1024);

    let lineShader = createShaderProgram(ctx, 'line', /*glsl*/`#version 300 es
        precision highp float;
        ${modelViewUboText}
        uniform vec2 u_viewSizeInv;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_lineDir;
        layout(location = 2) in vec4 a_color;
        layout(location = 3) in float a_thickness;
        layout(location = 4) in vec3 a_normal;
        out vec2 v_linePos;
        out vec4 v_color;
        out float v_thickness;
        void main() {

            float mul = 1.0;
            if (gl_VertexID % 2 == 0) {
                mul = -1.0;
            }

            float width;

            if (length(a_normal) == 0.0) {
                vec4 lineDirClip = u_view * u_model * vec4(a_lineDir, 0);
                vec2 lineDir = normalize(lineDirClip.xy);

                vec4 clipPos = u_view * u_model * vec4(a_position, 1);
                vec2 screenPos = clipPos.xy / clipPos.w;

                width = a_thickness * 2.0;
                vec2 linePos = screenPos + vec2(lineDir.y, -lineDir.x) * u_viewSizeInv * width * mul;

                gl_Position = vec4(linePos.xy * clipPos.w, clipPos.z, clipPos.w);
                v_thickness = a_thickness;

            } else {

                width = a_thickness * 2.0;
                vec3 offset = normalize(cross(a_normal, a_lineDir));
                vec3 linePos = a_position + offset * mul * width;

                gl_Position = u_view * u_model * vec4(linePos, 1);
                v_thickness = 100.0;

            }

            v_color = a_color;
            v_linePos = vec2(mul * width, 0);
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec2 v_linePos;
        in vec4 v_color;
        in float v_thickness;
        out vec4 o_color;

        void main() {
            float lineWidth = v_thickness - 1.0;
            float edge0 = lineWidth / 2.0;
            float edge1 = lineWidth / 2.0 + fwidth(v_linePos.x);
            float t = 1.0 - smoothstep(edge0, edge1, abs(v_linePos.x));

            if (t == 0.0) {
                discard;
            }

            o_color = v_color * t;
        }
    `, [
        'u_viewSizeInv'
    ], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;

    return {
        gl,
        vao: lineVao,
        floatBuf: lineFloatBuf,
        indexBuf: lineIndexBuf,
        lineShader,
    };
}

export interface ILineOpts {
    thick: number;
    color: Vec4;
    mtx: Mat4f;
    n?: Vec3;
}

export function addLine2(render: ILineRender, a: Vec3, b: Vec3, opts: ILineOpts) {
    addLine(render, opts.thick, opts.color, a, b, opts.n, opts.mtx);
}

let _lineA = new Vec3();
let _lineB = new Vec3();
let _lineDir = new Vec3();

export function addLine(render: ILineRender, thickness: number, color: Vec4, a: Vec3, b: Vec3, n?: Vec3, mtx?: Mat4f) {
    let floatBuf = render.floatBuf;
    let buf = floatBuf.localBuf;
    let idxBuf = render.indexBuf.localBuf;
    ensureFloatBufferSize(floatBuf, 4);
    ensureElementBufferSize(render.indexBuf, 5);
    if (mtx) {
        mtx.mulVec3Affine_(a, _lineA);
        mtx.mulVec3Affine_(b, _lineB);
        // thickness = thickness;
        // n = n ? mtx.mulVec3ProjVec(n) : undefined;
    } else {
        _lineA.copy_(a);
        _lineB.copy_(b);
    }

    _lineDir.x = _lineB.x - _lineA.x;
    _lineDir.y = _lineB.y - _lineA.y;
    _lineDir.z = _lineB.z - _lineA.z;
    let dirLen = 1.0 / _lineDir.len();
    _lineDir.x *= dirLen;
    _lineDir.y *= dirLen;
    _lineDir.z *= dirLen;

    let pt = [_lineA, _lineA, _lineB, _lineB];
    n = n ?? Vec3.zero;

    let i = floatBuf.usedEls * floatBuf.strideFloats;
    let k = render.indexBuf.usedVerts;
    for (let j = 0; j < 4; j++) {
        buf[i + 0] = pt[j].x;
        buf[i + 1] = pt[j].y;
        buf[i + 2] = pt[j].z;
        buf[i + 3] = _lineDir.x;
        buf[i + 4] = _lineDir.y;
        buf[i + 5] = _lineDir.z;
        buf[i + 6] = color.x;
        buf[i + 7] = color.y;
        buf[i + 8] = color.z;
        buf[i + 9] = color.w;
        buf[i + 10] = thickness;
        buf[i + 11] = n.x;
        buf[i + 12] = n.y;
        buf[i + 13] = n.z;
        i += floatBuf.strideFloats;
        idxBuf[k + j] = floatBuf.usedEls + j;
    }
    idxBuf[k + 4] = 0xffffffff;
    floatBuf.usedEls += 4;
    render.indexBuf.usedVerts += 5;
}

export function renderAllLines(render: ILineRender) {
    let gl = render.gl;
    uploadFloatBuffer(gl, render.floatBuf);
    uploadElementBuffer(gl, render.indexBuf)

    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    gl.useProgram(render.lineShader.program);
    gl.bindVertexArray(render.vao);

    let locs = render.lineShader.locs;
    gl.uniform2f(locs.u_viewSizeInv, 1.0 / gl.canvas.width, 1.0 / gl.canvas.height);

    // console.log('rendering lines', render.indexBuf.usedVerts);
    gl.drawElements(gl.TRIANGLE_STRIP, render.indexBuf.usedVerts, gl.UNSIGNED_INT, 0);

    gl.depthMask(true);
}

export function resetLineRender(render: ILineRender) {
    resetFloatBufferMap(render.floatBuf);
    resetElementBufferMap(render.indexBuf);
}
