import { Mat4f } from "@/src/utils/matrix";
import { bindFloatAttribs, createElementBuffer, createFloatBuffer, createShaderProgram, ensureElementBufferSize, ensureFloatBufferSize, IGLContext, resetElementBufferMap, resetFloatBufferMap, uploadElementBuffer, uploadFloatBuffer } from "@/src/utils/shader";
import { Vec3, Vec3Buf, Vec4 } from "@/src/utils/vector";
import { ISharedRender, modelViewUboText, RenderPhase, UboBindings } from "./sharedRender";

export type ILineRender = ReturnType<typeof createLineRender>;

export function createLineRender(ctx: IGLContext, sharedRender: ISharedRender) {


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
        { name: 'a_lineDirA', size: 3 },
        { name: 'a_lineDirB', size: 3 },
        { name: 'a_color', size: 4 },
        { name: 'a_thickness', size: 1 },
        { name: 'a_firstPair', size: 1 },
        { name: 'a_normal', size: 3 },
        { name: 'a_dash', size: 1 },
        { name: 'a_t', size: 1 },
    ]);

    let lineFloatBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, lineVbo, 1024, strideBytes, null);

    let lineIbo = gl.createBuffer()!;
    let lineIndexBuf = createElementBuffer(gl, lineIbo, 1024, sharedRender);

    let lineShader = createShaderProgram(ctx, 'line', /*glsl*/`#version 300 es
        precision highp float;
        ${modelViewUboText}
        uniform vec2 u_viewSizeInv;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_lineDirA;
        layout(location = 2) in vec3 a_lineDirB;
        layout(location = 3) in vec4 a_color;
        layout(location = 4) in float a_thickness;
        layout(location = 5) in float a_firstPair;
        layout(location = 6) in vec3 a_normal;
        layout(location = 7) in float a_dash;
        layout(location = 8) in float a_t;
        out vec2 v_linePos;
        out vec4 v_color;
        out float v_thickness;
        out float v_dash;
        void main() {

            float mul = 1.0;
            if (gl_VertexID % 2 == 0) {
                mul = -1.0;
            }

            bool firstPair = a_firstPair > 0.0;

            float width;

            if (length(a_normal) == 0.0) {
                vec4 clipPos = u_view * u_model * vec4(a_position, 1);
                vec2 screenPos = clipPos.xy / clipPos.w;

                vec4 lineDirAClip = u_view * u_model * vec4(a_position + a_lineDirA, 1);
                vec2 lineDirA = normalize(lineDirAClip.xy / lineDirAClip.w - screenPos);
                vec4 lineDirBClip = u_view * u_model * vec4(a_position + a_lineDirB, 1);
                vec2 lineDirB = normalize(lineDirBClip.xy / lineDirBClip.w - screenPos);

                vec2 avgDir = normalize(lineDirA + lineDirB);
                vec2 activeDir = firstPair ? lineDirA : lineDirB;

                float scale = sqrt(2.0) / length(lineDirA + lineDirB);
                vec2 offset = vec2(-avgDir.y, avgDir.x);

                if (scale > 5.0) {
                    bool isOuter = cross(vec3(lineDirA, 0), vec3(lineDirB, 0)).z * mul < 0.0;
                    if (isOuter) {
                        offset = vec2(-activeDir.y, activeDir.x);
                        scale = 1.0 / sqrt(2.0);
                    } else {
                        offset = vec2(-activeDir.y, activeDir.x);
                        scale = 1.0 / sqrt(2.0);
                    }
                }

                width = a_thickness * 2.0;
                vec2 linePos = screenPos + offset * u_viewSizeInv * width * mul * scale;

                gl_Position = vec4(linePos.xy * clipPos.w, clipPos.z, clipPos.w);
                v_thickness = a_thickness;

            } else {

                width = a_thickness * 2.0;
                vec3 activeDir = firstPair ? a_lineDirA : a_lineDirB;

                vec3 avgDir = normalize(a_lineDirA + a_lineDirB);
                vec3 offset = normalize(cross(a_normal, avgDir));
                // need to scale by the amount of angle between the two line directions
                float scale = sqrt(2.0) / length(a_lineDirA + a_lineDirB);

                // if we exceed the miter limit (90 degrees), we need to clamp the line width, and draw a bevel instead.
                // the inner corner stays the same, but the outer corner is a bevel.

                if (scale > 2.0) {
                    bool isOuter = cross(a_lineDirA, a_lineDirB).z * mul < 0.0;

                    if (isOuter) {
                        offset = normalize(cross(a_normal, activeDir));
                        scale = 1.0 / sqrt(2.0);
                    }
                }

                vec3 linePos = a_position + offset * mul * width * scale;

                gl_Position = u_view * u_model * vec4(linePos, 1);
                v_thickness = 100.0;

            }

            v_dash = a_dash;
            v_color = a_color;
            v_linePos = vec2(mul * width, a_t);
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec2 v_linePos;
        in vec4 v_color;
        in float v_thickness;
        in float v_dash;
        out vec4 o_color;

        void main() {
            float lineWidth = v_thickness - 1.0;
            float edge0 = lineWidth / 2.0;
            float edge1 = lineWidth / 2.0 + fwidth(v_linePos.x);
            float t = 1.0 - smoothstep(edge0, edge1, abs(v_linePos.x));

            if (v_dash > 0.0) {
                float dashPos = mod(v_linePos.y, v_dash);
                if (dashPos > v_dash / 2.0) {
                    t = 0.0;
                }
            }

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
        sharedRender,
    };
}

export interface ILineOpts {
    thick: number;
    color: Vec4;
    mtx: Mat4f;
    n?: Vec3;
    closed?: boolean;
    dash?: number;
}

export function makeLineOpts(opts: Partial<ILineOpts> = {}): ILineOpts {
    return {
        thick: +(opts.thick || 1),
        color: opts.color || new Vec4(1, 1, 1, 1),
        mtx: opts.mtx || Mat4f.identity,
        n: opts.n || undefined,
        closed: opts.closed || false,
        dash: opts.dash ?? 0,
    };
}

export function addLine2(render: ILineRender, a: Vec3, b: Vec3, opts: ILineOpts) {
    addLine(render, opts.thick, opts.color, a, b, opts.n, opts.mtx, opts.dash);
}

let _lineA = new Vec3();
let _lineB = new Vec3();
let _lineDir = new Vec3();

export function addLine(render: ILineRender, thickness: number, color: Vec4, a: Vec3, b: Vec3, n?: Vec3, mtx?: Mat4f, dash?: number, t?: number) {
    let phase = render.sharedRender.activePhase;
    let floatLocalBuf = render.floatBuf.localBufs[0];
    let buf = floatLocalBuf.buf;
    let idxLocalBuf = render.indexBuf.localBufs[phase];
    let idxBuf = idxLocalBuf.buf;
    ensureFloatBufferSize(floatLocalBuf, 4);
    ensureElementBufferSize(idxLocalBuf, 5);
    if (mtx) {
        mtx.mulVec3Affine_(a, _lineA);
        mtx.mulVec3Affine_(b, _lineB);
        // thickness = thickness;
        // n = n ? mtx.mulVec3ProjVec(n) : undefined;
    } else {
        _lineA.copy_(a);
        _lineB.copy_(b);
    }

    dash = dash ?? 0;
    _lineDir.x = _lineB.x - _lineA.x;
    _lineDir.y = _lineB.y - _lineA.y;
    _lineDir.z = _lineB.z - _lineA.z;
    let len = _lineDir.len();
    let dirLen = 1.0 / len;
    _lineDir.x *= dirLen;
    _lineDir.y *= dirLen;
    _lineDir.z *= dirLen;

    let pt = [_lineA, _lineA, _lineB, _lineB];
    n = n ?? Vec3.zero;

    let i = floatLocalBuf.usedEls * floatLocalBuf.strideFloats;
    let k = idxLocalBuf.usedVerts;
    for (let j = 0; j < 4; j++) {
        buf[i + 0] = pt[j].x;
        buf[i + 1] = pt[j].y;
        buf[i + 2] = pt[j].z;
        buf[i + 3] = _lineDir.x;
        buf[i + 4] = _lineDir.y;
        buf[i + 5] = _lineDir.z;
        buf[i + 6] = _lineDir.x;
        buf[i + 7] = _lineDir.y;
        buf[i + 8] = _lineDir.z;
        buf[i + 9] = color.x;
        buf[i + 10] = color.y;
        buf[i + 11] = color.z;
        buf[i + 12] = color.w;
        buf[i + 13] = thickness;
        buf[i + 14] = 1.0;
        buf[i + 15] = n.x;
        buf[i + 16] = n.y;
        buf[i + 17] = n.z;
        buf[i + 18] = dash;
        buf[i + 19] = j < 2 ? 0 : len;
        i += floatLocalBuf.strideFloats;
        idxBuf[k + j] = floatLocalBuf.usedEls + j;
    }
    idxBuf[k + 4] = 0xffffffff;
    floatLocalBuf.usedEls += 4;
    idxLocalBuf.usedVerts += 5;
}

let _lineSegBufs = new Float32Array(2 * 3);
let _dir = _lineSegBufs.subarray(0, 3);
let _prevDir = _lineSegBufs.subarray(3, 6);
let _ptsTransformed = new Float32Array(0);
export function drawLineSegs(render: ILineRender, pts: Float32Array, opts: ILineOpts) {
    let phase = render.sharedRender.activePhase;
    let floatLocalBuf = render.floatBuf.localBufs[0];
    let buf = floatLocalBuf.buf;

    let idxLocalBuf = render.indexBuf.localBufs[phase];
    let idxBuf = idxLocalBuf.buf;

    let ptsLen = pts.length;
    let n = (opts.n ?? Vec3.zero).clone();

    if (opts.mtx) {
        if (_ptsTransformed.length < pts.length) {
            _ptsTransformed = new Float32Array(pts.length);
        }
        for (let i = 0; i < pts.length; i += 3) {
            opts.mtx.mulVec3AffineArr_(pts, i, _ptsTransformed, i);
        }
        pts = _ptsTransformed;
        opts.mtx.mulVec3AffineVec_(n, n);
    }

    let nPts = ptsLen / 3 + (opts.closed ? 1 : 0);

    ensureFloatBufferSize(floatLocalBuf, nPts * 4);
    ensureElementBufferSize(idxLocalBuf, nPts * 4 + 1); // +1 for the primitive restart

    if (opts.closed) {
        Vec3Buf.sub_(pts, 0, pts, ptsLen - 3, _prevDir, 0);
        Vec3Buf.normalize_(_prevDir, 0, _prevDir, 0);
    }

    let dash = opts.dash ?? 0;
    let cx = opts.color.x;
    let cy = opts.color.y;
    let cz = opts.color.z;
    let cw = opts.color.w;
    let thick = opts.thick;
    let nx = n.x;
    let ny = n.y;
    let nz = n.z;
    let linePos = 0;

    for (let i = 0; i < nPts; i++) {
        let pOff = i * 3;
        if (opts.closed && i === nPts - 1) {
            pOff = 0;
        }

        let segLen = 0.0;
        if ((!opts.closed && i < nPts - 1) || (opts.closed && i !== nPts - 2)) {
            Vec3Buf.sub_(pts, pOff + 3, pts, pOff, _dir, 0);
            segLen = Vec3Buf.len_(_dir, 0);
            Vec3Buf.normalize_(_dir, 0, _dir, 0);

        } else if (opts.closed && i === nPts - 2) {
            // wrap around
            Vec3Buf.sub_(pts, 0, pts, ptsLen - 3, _dir, 0);
            segLen = Vec3Buf.len_(_dir, 0);
            Vec3Buf.normalize_(_dir, 0, _dir, 0);
        }

        let bufOff = floatLocalBuf.usedEls * floatLocalBuf.strideFloats;
        let idxOff = idxLocalBuf.usedVerts;

        let dirA = (i == 0 && !opts.closed) ? _dir : _prevDir;
        let dirB = (i == nPts - 1 && !opts.closed) ? _prevDir : _dir;

        let idxCount = opts.closed && i === nPts - 1 ? 2 : 4;

        for (let j = 0; j < idxCount; j++) {
            Vec3Buf.copy_(pts, pOff, buf, bufOff);
            Vec3Buf.copy_(dirA, 0, buf, bufOff + 3);
            Vec3Buf.copy_(dirB, 0, buf, bufOff + 6);
            buf[bufOff + 9] = cx;
            buf[bufOff + 10] = cy;
            buf[bufOff + 11] = cz;
            buf[bufOff + 12] = cw;
            buf[bufOff + 13] = thick;
            buf[bufOff + 14] = j > 2 ? 0.0 : 1.0;
            buf[bufOff + 15] = nx;
            buf[bufOff + 16] = ny;
            buf[bufOff + 17] = nz;
            buf[bufOff + 18] = dash;
            buf[bufOff + 19] = linePos;
            bufOff += floatLocalBuf.strideFloats;
            idxBuf[idxOff + j] = floatLocalBuf.usedEls + j;
        }

        floatLocalBuf.usedEls += idxCount;
        idxLocalBuf.usedVerts += idxCount;
        linePos += segLen;

        Vec3Buf.copy_(_dir, 0, _prevDir, 0);
    }

    idxBuf[idxLocalBuf.usedVerts] = 0xffffffff;
    idxLocalBuf.usedVerts += 1;
}

export function uploadAllLines(render: ILineRender) {
    let gl = render.gl;
    uploadFloatBuffer(gl, render.floatBuf);
    uploadElementBuffer(gl, render.indexBuf)
}

export function renderAllLines(render: ILineRender, renderPhase: RenderPhase) {
    let gl = render.gl;
    let localIdxBuf = render.indexBuf.localBufs[renderPhase];
    if (localIdxBuf.usedVerts === 0) {
        return;
    }

    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    gl.useProgram(render.lineShader.program);
    gl.bindVertexArray(render.vao);

    let locs = render.lineShader.locs;
    gl.uniform2f(locs.u_viewSizeInv, 1.0 / gl.canvas.width, 1.0 / gl.canvas.height);
    gl.drawElements(gl.TRIANGLE_STRIP, localIdxBuf.usedVerts, gl.UNSIGNED_INT, localIdxBuf.glOffsetBytes);

    gl.depthMask(true);
}

export function resetLineRender(render: ILineRender) {
    resetFloatBufferMap(render.floatBuf);
    resetElementBufferMap(render.indexBuf);
}
