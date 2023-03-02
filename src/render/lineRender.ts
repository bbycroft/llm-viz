import { Mat4f } from "../utils/matrix";
import { createShaderProgram, IGLContext } from "../utils/shader";
import { Vec3, Vec4 } from "../utils/vector";

export type ILineRender = ReturnType<typeof createLineRender>;

const floatsPerVert = 3 * 2;
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
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytesPerVert, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytesPerVert, 3 * 4);


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
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec2 u_viewSizeInv;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_lineDir;
        out vec2 v_linePos;
        void main() {
            vec4 lineDirClip = u_view * u_model * vec4(a_lineDir, 0);
            vec2 lineDir = normalize(lineDirClip.xy);

            vec4 clipPos = u_view * u_model * vec4(a_position, 1);
            vec2 screenPos = clipPos.xy / clipPos.w;

            float mul = 1.0;
            if (gl_VertexID % 2 == 0) {
                mul = -1.0;
            }

            float width = 3.0;
            vec2 linePos = screenPos + vec2(lineDir.y, -lineDir.x) * u_viewSizeInv * width * mul;

            v_linePos = vec2(mul * width, 0);

            // gl_Position = vec4(linePos, 0, 1);
            gl_Position = vec4(linePos.xy * clipPos.w, clipPos.z, clipPos.w);
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec2 v_linePos;
        out vec4 o_color;
        uniform vec4 u_baseColor;

        void main() {
            float lineWidth = 0.0;
            float edge0 = lineWidth / 2.0;
            float edge1 = lineWidth / 2.0 + fwidth(v_linePos.x);
            float t = 1.0 - smoothstep(edge0, edge1, abs(v_linePos.x));

            if (t == 0.0) {
                discard;
            }

            o_color = u_baseColor * t;
        }
    `, [
        'u_view', 'u_model', 'u_baseColor', 'u_viewSizeInv'
    ])!;

    return {
        gl,
        vao: quadVao,
        vbo: quadVbo,
        localBuffer: new Float32Array(1024 * floatsPerLine),
        usedCount: 0,
        lineShader,
    };
}

export function addLine(render: ILineRender, a: Vec3, b: Vec3) {
    let buf = render.localBuffer;

    let dir = b.sub(a).normalize();

    let i = render.usedCount * floatsPerLine;
    for (let j = 0; j < 2; j++) {
        buf[i + 0] = a.x;
        buf[i + 1] = a.y;
        buf[i + 2] = a.z;
        buf[i + 3] = dir.x;
        buf[i + 4] = dir.y;
        buf[i + 5] = dir.z;
        i += floatsPerVert;
    }
    for (let j = 0; j < 2; j++) {
        buf[i + 0] = b.x;
        buf[i + 1] = b.y;
        buf[i + 2] = b.z;
        buf[i + 3] = dir.x;
        buf[i + 4] = dir.y;
        buf[i + 5] = dir.z;
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

    gl.useProgram(render.lineShader.program);

    let locs = render.lineShader.locs;
    gl.uniformMatrix4fv(locs.u_view, false, view);
    gl.uniformMatrix4fv(locs.u_model, false, model);
    gl.uniform4fv(locs.u_baseColor, baseColor);
    gl.uniform2f(locs.u_viewSizeInv, 1.0 / gl.canvas.width, 1.0 / gl.canvas.height);

    gl.drawElements(gl.TRIANGLE_STRIP, render.usedCount * 5, gl.UNSIGNED_SHORT, 0);
    // gl.drawArrays(gl.TRIANGLE_STRIP, 0, render.usedCount * 4);
}

export function resetLineRender(render: ILineRender) {
    render.usedCount = 0;
}
