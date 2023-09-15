import { IBlkDef, IModelLayout } from "../GptModelLayout";
import { Mat4f } from "@/src/utils/matrix";
import { bindFloatAttribs, createFloatBuffer, createShaderProgram, IGLContext } from "@/src/utils/shader";
import { Dim, Vec3, Vec4 } from "@/src/utils/vector";
import { modelViewUboText, UboBindings } from "./sharedRender";

export type IThreadRender = ReturnType<typeof initThreadRender>;

export function initThreadRender(ctx: IGLContext) {


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
        0, 1, 0,
        1, 1, 0,
        1, 0, 0,
        0, 0, 0,
    ]), gl.STATIC_DRAW);

    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    let instanceVbo = gl.createBuffer()!;
    let instanceStride = bindFloatAttribs(gl, instanceVbo, { divisor: 1, locOffset: 2 }, [
        { name: 'a_offset', size: 3 },
        { name: 'a_size', size: 3 },
        { name: 'a_nCells', size: 2 },
        { name: 'a_threadDir', size: 2, nCols: 3 },
    ]);
    let instanceBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, instanceVbo, 1024, instanceStride, null);

    let shader = createShaderProgram(ctx, 'thread', /*glsl*/`#version 300 es
        precision highp float;
        ${modelViewUboText}
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;

        uniform vec3 u_offset;
        uniform vec3 u_size;
        uniform vec2 u_nCells;
        uniform mat3x2 u_threadDir;
        out vec3 v_normal;
        out vec3 v_modelPos;
        out vec2 v_blockPos;
        out vec2 v_squarePos;
        void main() {
            vec2 localPos = u_threadDir * vec3(a_position.xy, 1);
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
        uniform vec3 u_camPos; // in model space
        uniform vec3 u_baseColor;

        void main() {
            ivec2 blockPos = ivec2(v_blockPos - v_normal.xy * 0.0);

            vec2 pxPerCell = 1.0 / fwidth(v_blockPos);
            float maxPxPerCell = max(pxPerCell.x, pxPerCell.y);

            vec4 color = vec4(0);

            if (v_blockPos.y < 0.0) {
                discard;
            }

            if (blockPos.y == 0) {
                // draw head
                vec2 d = fract(v_blockPos) - 0.5;
                float d2 = sqrt(d.x * d.x + d.y * d.y);

                // fwidth(d);
                float deltad2_per_px = fwidth(d2); // fwidth(d2);

                float t = 1.0 - smoothstep(0.45, 0.45 + 1.0 * deltad2_per_px, d2);

                float t2 = smoothstep(0.35, 0.35 + 1.0 * deltad2_per_px, d2);

                // if (d2 > 0.35 && d2 < 0.45) {
                color = mix(color, vec4(u_baseColor, 1), min(t, t2));
                // }
            }

            if (v_blockPos.y > (0.5 + 0.45)) {
                float falloffY = 1.0 - clamp(v_blockPos.y / 10.0, 0.0, 1.0);

                float cellPosX = fract(v_blockPos.x);
                float distFromX = abs(cellPosX - 0.5);
                // small side-to-side falloff based on distFromX for a glow effect
                float falloffX = 1.0 - smoothstep(0.0, min(0.3, 5.0 * fwidth(v_blockPos.x)), distFromX);

                color = mix(color, vec4(u_baseColor, 1), falloffX * falloffY);
            }

            // color = vec4(1, 0, 0, 1);

            o_color = color;
        }
    `, [
        'u_size', 'u_offset', 'u_baseColor', 'u_nCells', 'u_threadDir',
    ], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;


    return {
        gl,
        vao,
        quadVbo,
        instanceVbo,
        instanceBuf,
        numInstances: 0,
        shader,
        threadInfos: [] as IThreadInfo[],
    };
}

export interface IThreadInfo {
    pos: Vec3;
    size: Vec3;
    nCells: Vec3;
    baseColor: Vec4;
    threadDir: number[]; // 6 element, 3x2 matrix; col major
}

export function drawThread(threadRender: IThreadRender, layout: IModelLayout, blk: IBlkDef, dim: Dim, x: number, y: number, cx: number, cy: number, color: Vec4) {
    let threadDir = dim === Dim.X ? [0, -1,  1, 0,  0, 1] : [1, 0,  0, -1,  0, 1];
    let pos = new Vec3(blk.x + x * layout.cell, blk.y + y * layout.cell, blk.z + blk.dz);
    let size = new Vec3(cx * layout.cell, cy * layout.cell, blk.dz);
    let nCells = new Vec3(cx, cy, 0);
    threadRender.threadInfos.push({ pos, size, nCells, baseColor: color, threadDir });
}

export function renderAllThreads(threadRender: IThreadRender) {
    let { gl, shader, vao: threadVao } = threadRender;

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.polygonOffset(-1.0, -2.0);

    let locs = shader.locs;
    gl.useProgram(shader.program);
    gl.bindVertexArray(threadVao);

    for (let a of threadRender.threadInfos) {
        let color = a.baseColor;
        gl.uniform3f(locs.u_offset, a.pos.x, a.pos.y, a.pos.z);
        gl.uniform3f(locs.u_size, a.size.x, a.size.y, a.size.z);
        gl.uniform2f(locs.u_nCells, a.nCells.x, a.nCells.y);
        gl.uniform3f(locs.u_baseColor, color.x, color.y, color.z);
        gl.uniformMatrix3x2fv(locs.u_threadDir, false, a.threadDir);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    threadRender.threadInfos = [];

    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
}
