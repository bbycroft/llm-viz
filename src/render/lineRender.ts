import { Mat4f } from "../utils/matrix";
import { createShaderProgram, IGLContext } from "../utils/shader";
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

    let quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 1024 * bytesPerLine, gl.DYNAMIC_DRAW);

    let quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.enableVertexAttribArray(3);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytesPerVert, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytesPerVert, 3 * 4);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, bytesPerVert, 6 * 4);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bytesPerVert, 10 * 4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, bytesPerVert, 11 * 4);

    let quadIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 1024 * 5 * 2, gl.DYNAMIC_DRAW)
    let indices = new Uint16Array(1024 * 5);
    for (let i = 0; i < 1024; i++) {
        indices[i * 5 + 0] = i * 4 + 0;
        indices[i * 5 + 1] = i * 4 + 1;
        indices[i * 5 + 2] = i * 4 + 2;
        indices[i * 5 + 3] = i * 4 + 3;
        indices[i * 5 + 4] = 65535;
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indices);

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
        'u_view', 'u_model', 'u_viewSizeInv'
    ], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;

    return {
        gl,
        vao: quadVao,
        vbo: quadVbo,
        localBuffer: new Float32Array(1024 * floatsPerLine),
        usedCount: 0,
        lineShader,
    };
}

export function addLine(render: ILineRender, thickness: number, color: Vec4, a: Vec3, b: Vec3, n?: Vec3) {
    let buf = render.localBuffer;

    let dir = b.sub(a).normalize();
    let pt = [a, a, b, b];
    n = n ?? new Vec3();

    let i = render.usedCount * floatsPerLine;
    for (let j = 0; j < 4; j++) {
        buf[i + 0] = pt[j].x;
        buf[i + 1] = pt[j].y;
        buf[i + 2] = pt[j].z;
        buf[i + 3] = dir.x;
        buf[i + 4] = dir.y;
        buf[i + 5] = dir.z;
        buf[i + 6] = color.x;
        buf[i + 7] = color.y;
        buf[i + 8] = color.z;
        buf[i + 9] = color.w;
        buf[i + 10] = thickness;
        buf[i + 11] = n.x;
        buf[i + 12] = n.y;
        buf[i + 13] = n.z;
        i += floatsPerVert;
    }
    render.usedCount += 1;
}

export function renderAllLines(render: ILineRender, view: Mat4f, model: Mat4f, baseColor: Vec4) {
    let gl = render.gl;
    gl.bindVertexArray(render.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, render.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, render.localBuffer.slice(0, render.usedCount * floatsPerLine));
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    gl.useProgram(render.lineShader.program);

    let locs = render.lineShader.locs;
    gl.uniformMatrix4fv(locs.u_view, false, view);
    gl.uniformMatrix4fv(locs.u_model, false, model);
    gl.uniform2f(locs.u_viewSizeInv, 1.0 / gl.canvas.width, 1.0 / gl.canvas.height);

    gl.drawElements(gl.TRIANGLE_STRIP, render.usedCount * 5, gl.UNSIGNED_SHORT, 0);
    // gl.drawArrays(gl.TRIANGLE_STRIP, 0, render.usedCount * 4);

    gl.depthMask(true);
}

export function resetLineRender(render: ILineRender) {
    render.usedCount = 0;
}
