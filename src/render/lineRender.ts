import { createShaderProgram, IGLContext } from "../utils/shader";

export interface ILineRender {

}

export function createLineRender(ctx: IGLContext): ILineRender {


    /* Lines are made up of several quads, 1(?) for each line segment.

    we'll use TRIANGLE_STRIP for rendering, and indexed arrays to support primitive restart.

    Just gonna render each line segment separately. Corners too much of a pain for now!

    Still need to get the quad to face the camera, and to be the right size.
    I think it makes sense to do this after projection in the vertex shader.

    */

    let gl = ctx.gl;

    let quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 1024, gl.DYNAMIC_DRAW);

    let stride = 3 * 2 * 4;
    let quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);

    let lineShader = createShaderProgram(ctx, 'line', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_lineDir;
        out vec2 v_linePos;
        void main() {
            vec4 lineDirClip = u_view * u_model * vec4(a_lineDir, 0);
            vec2 lineDir = lineDirClip.xy / lineDirClip.w;

            vec4 clipPos = u_view * u_model * vec4(a_position, 1);
            vec2 screenPos = clipPos.xy / clipPos.w;

            float mul = 1;
            if (gl_VertexID % 2 == 0) {
                mul = -1;
            }

            vec2 linePos = screenPos + vec2(lineDir.y, -lineDir.x) * 2 * mul;

            gl_Position = vec4(screenPos.xy * clipPos.w, clipPos.z, clipPos.w);
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
            float t = smoothstep(edge0, edge1, abs(v_linePos.x));

            t = 1.0;

            if (t == 0.0) {
                discard;
            }

            o_color = color * t;
        }
    `, [
        'u_view', 'u_model', 'u_baseColor',
    ])!;

    return {
        threadVao: quadVao,
        threadVbo: quadVbo,
        lineShader,
    };
}
