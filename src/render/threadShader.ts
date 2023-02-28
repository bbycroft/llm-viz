import { createShaderProgram, IGLContext } from "../utils/shader";

export function initThreadShader(ctx: IGLContext) {


    /* We'll construct a quad [0..1], [0..1] in the x-z plane that looks something like this:

    It can go either vertical or horizontal, and in either forward or back.

         [   ]
         [ . ]
         [ | ]
         [ | ]
         [ 0 ]

    It's made up of a head, and a tail. Want a falloff pattern for the tail, and also a strength.
    Likely clamp the tail for a max thickness/brightness.

    Units are the same as the blocks, and threads are 1 unit thick (actually do multiple threads in one view).

    Standard thread direction is towards the top, and in the first row of cells.
    All cells below those are in the tail, with appropriate falloff.

    The 3x2 threadDir matrix can be used to rotate the thread to any direction.

    Any special effects like coloring one particular thread differently requires separate blocks.
    E.g. first 5 columns have standard, next 1 has special, remaining have standard again.

      0         1
   0  ----------->  +x
      | 0  0  0 |
      | |  |  | |
      | |  |  | |
      | .  .  . |
   1  v---------|

      +y

    */

    let gl = ctx.gl;

    let quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0, -1,
        1, 0, -1,
        1, 0, 0,
        0, 0, 0,
    ]), gl.STATIC_DRAW);

    let quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    let threadShader = createShaderProgram(ctx, 'block', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec3 u_offset;
        uniform vec3 u_size;
        uniform vec2 u_nCells;
        uniform mat3x2 u_threadDir;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        out vec3 v_normal;
        out vec3 v_modelPos;
        out vec2 v_blockPos;
        out vec2 v_squarePos;
        void main() {
            vec2 localPos = u_threadDir * vec3(a_position.x, -a_position.z, 1);
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
            v_normal = a_normal;
            v_modelPos = model_pos;
            v_blockPos = localPos * abs(u_threadDir * vec3(u_nCells, 0));
            v_squarePos = localPos;
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec3 v_normal;
        in vec3 v_modelPos;
        in vec2 v_blockPos;
        in vec2 v_squarePos;
        out vec4 o_color;
        uniform vec2 u_nCells;
        uniform vec3 u_lightPos[3]; // in model space
        uniform vec3 u_lightColor[3]; // in model space
        uniform vec3 u_camPos; // in model space
        uniform vec3 u_baseColor;
        uniform float u_accessTexScale;
        uniform sampler2D u_accessSampler;
        uniform mat4x2 u_accessMtx;
        uniform int u_channel;

        void main() {
            ivec2 blockPos = ivec2(v_blockPos - vec2(v_normal.x, v_normal.z) * 0.0);

            vec2 pxPerCell = 1.0 / fwidth(v_blockPos);
            float maxPxPerCell = max(pxPerCell.x, pxPerCell.y);

            vec4 color = vec4(0.0, 0, 0, 0.0);

            if (v_blockPos.y < 0.0) {
                discard;
            }

            if (blockPos.y == 0) {
                // draw head
                vec2 d = fract(v_blockPos) - 0.5;
                float d2 = d.x * d.x + d.y * d.y;

                if (d2 > 0.35*0.35 && d2 < 0.45*0.45) {
                    color = vec4(u_baseColor, 1);
                }
            }

            if (v_blockPos.y > (0.5 + 0.45)) {
                // draw tail (along y axis) with falloff
                float cellPosX = fract(v_blockPos.x);
                float distFromX = abs(cellPosX - 0.5);
                // small side-to-side falloff based on distFromX for a glow effect
                float falloffX = 1.0 - smoothstep(0.0, min(0.3, 5.0 * fwidth(v_blockPos.x)), distFromX);

                float falloffY = 1.0 - clamp(v_blockPos.y / 10.0, 0.0, 1.0);

                color = mix(color, vec4(u_baseColor, 1), falloffX * falloffY);
            }

            // color = vec4(1, 0, 0, 1);

            o_color = color;
        }
    `, [
        'u_view', 'u_model', 'u_size', 'u_offset',
        'u_baseColor', 'u_nCells', 'u_threadDir',
    ])!;

    return {
        threadVao: quadVao,
        threadVbo: quadVbo,
        threadShader,
    };
}
