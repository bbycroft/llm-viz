import { IBlkDef, IModelLayout } from "../GptModelLayout";
import { Mat4f } from "../utils/matrix";
import { createShaderProgram, IGLContext } from "../utils/shader";
import { Vec3, Vec4 } from "../utils/vector";


export type IBlockRender = ReturnType<typeof initBlockRender>;

export function initBlockRender(ctx: IGLContext) {
    let gl = ctx.gl;

    let quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        1, 1,
        -1, 1,
    ]), gl.STATIC_DRAW);

    let quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let shader = createShaderProgram(ctx, 'block', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec3 u_size;
        uniform vec3 u_offset;
        uniform vec3 u_nCells;
        uniform mat4 u_localPosMtx;
        uniform mat4x2 u_accessMtx;

        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        out vec3 v_normal;
        out vec3 v_modelPos;
        out vec3 v_blockPos;
        out vec2 v_accessPos;
        out vec3 v_cubePos;
        void main() {
            vec3 localPos = (u_localPosMtx * vec4(a_position, 1.0)).xyz;
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
            v_normal = a_normal;
            v_modelPos = model_pos;
            v_blockPos = localPos * u_nCells;
            v_accessPos = u_accessMtx * vec4(v_blockPos, 1.0);
            v_cubePos = localPos;
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec3 v_normal;
        out vec4 o_color;
        in vec3 v_blockPos;
        in vec3 v_cubePos;
        in vec3 v_modelPos;
        in vec2 v_accessPos;
        uniform vec3 u_nCells;
        uniform vec3 u_lightPos[3]; // in model space
        uniform vec3 u_lightColor[3]; // in model space
        uniform vec3 u_camPos; // in model space
        uniform vec3 u_baseColor;
        uniform float u_accessTexScale;
        uniform sampler2D u_accessSampler;
        uniform mat4x2 u_accessMtx;
        uniform int u_channel;
        uniform float u_highlight;

        void main() {
            ivec3 blockPos = ivec3(v_blockPos - vec3(v_normal.x, v_normal.y, v_normal.z) * 0.1);

            bool cellDark = (blockPos.x + blockPos.y + blockPos.z) % 2 == 0;

            float maxDist = 4000.0;
            float minDist = 600.0;
            float dist = distance(u_camPos, v_modelPos);
            float t = clamp((dist - minDist) / (maxDist - minDist), 0.0, 1.0);

            vec3 baseColor = mix(u_baseColor, vec3(0.5, 0.5, 0.5), 0.5);
            if (cellDark) {
                baseColor *= mix(0.9, 1.0, t);
            }

            if (u_accessTexScale > 0.0 && dist < maxDist) { // have access texture
                vec3 texBaseColor = mix(baseColor, vec3(0.5, 0.5, 0.5), 0.8);

                vec3 d = fract(v_blockPos) - 0.5;
                float r2 = 0.3*0.3;
                bool insideX = d.y * d.y + d.z * d.z < r2;
                bool insideY = d.x * d.x + d.z * d.z < r2;
                bool insideZ = d.x * d.x + d.y * d.y < r2;
                bool insideAny = insideX || insideY || insideZ;

                if (insideAny) {
                    ivec2 accessPos = ivec2(u_accessMtx * vec4(blockPos, 1.0));
                    vec4 valVec = texelFetch(u_accessSampler, accessPos, 0) * u_accessTexScale;
                    float val = u_channel == 0 ? valVec.r : u_channel == 1 ? valVec.g : valVec.b;

                    float weight = clamp(abs(val), 0.0, 1.0);

                    vec3 negColor = vec3(0.0, 0.0, 0.0);
                    vec3 posColor = u_baseColor; // vec3(0.0, 1.0, 0.0);
                    vec3 zeroColor = vec3(0.5, 0.5, 0.5);
                    texBaseColor = mix(mix(zeroColor, negColor, weight), mix(zeroColor, posColor, weight), step(0.0, val));
                }

                baseColor = mix(texBaseColor, baseColor, t);
            }

            if (true) {
                // draw a line at 16 block intervals (edges?)
                // @TODO: factor out into a function and decide how to choose each line-group
                // e.g. based on zoom level, & probably limited to 2

                vec3 block16 = v_blockPos / 16.0;
                vec3 block16Grid = abs(fract(block16 - 0.5) - 0.5) / fwidth(block16);
                float line16 = min(min(block16Grid.x, block16Grid.y), block16Grid.z);

                vec3 block256 = v_blockPos / 256.0;
                vec3 block256Grid = abs(fract(block256 - 0.5) - 0.5) / fwidth(block256);
                float line256 = min(min(block256Grid.x, block256Grid.y), block256Grid.z);

                vec3 cube = v_cubePos;
                vec3 cubeGrid = abs(fract(cube - 0.5) - 0.5) / fwidth(cube);
                float lineCube = min(min(cubeGrid.x, cubeGrid.x), cubeGrid.z);

                float edgeWeight = smoothstep(0.0, 1.0, min(min(lineCube, line256), line16));
                baseColor = mix(baseColor, vec3(1.0, 1.0, 1.0), 1.0 - edgeWeight);
            }

            vec3 color = mix(baseColor * 0.7, u_baseColor, u_highlight);

            if (false) {
            for (int i = 0; i < 3; i++) {
                vec3 light_dir = normalize(u_lightPos[i] - v_modelPos);
                vec3 view_dir = normalize(u_camPos - v_modelPos);
                vec3 half_dir = normalize(light_dir + view_dir);
                vec3 reflect_dir = reflect(-light_dir, v_normal);
                vec3 diffuse = 0.2 * baseColor * max(dot(light_dir, v_normal), 0.0);
                vec3 specular = 0.1 * u_lightColor[i] * pow(max(dot(half_dir, v_normal), 0.0), 32.0);

                color += diffuse + specular;
            }
            }

            o_color = vec4(color, 1);
        }
    `, [
        'u_view', 'u_model', 'u_size', 'u_offset',
        'u_baseColor', 'u_nCells',
        'u_lightPos', 'u_camPos', 'u_lightColor',
        'u_channel', 'u_accessTexScale', 'u_accessSampler', 'u_accessMtx', 'u_localPosMtx',
        'u_highlight',
    ])!;

    let simpleShader = createShaderProgram(ctx, 'block-simple', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec3 u_size;
        uniform vec3 u_offset;

        layout(location = 0) in vec3 a_position;
        void main() {
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        out vec4 o_color;
        uniform vec4 u_baseColor;

        void main() {
            o_color = u_baseColor;
        }
    `, [
        'u_view', 'u_model', 'u_size', 'u_offset', 'u_baseColor',
    ])!;

    let cubeGeom = genCubeGeom(gl);

    return {
        gl,
        cubeGeom,
        quadVao,
        quadVbo,
        shader,
        simpleShader,
    };
}


export interface IGeom {
    name: string;
    vao: WebGLVertexArrayObject;
    vbo: WebGLBuffer;
    type: number; // gl.TRIANGLES etc
    numVerts: number;
}

export function genCubeGeom(gl: WebGL2RenderingContext): IGeom {
    let faceVerts = [-1, 1, -1, -1, 1, 1, 1, 1, -1, -1, 1, -1];

    let faces = [
        new Mat4f(),
        Mat4f.fromAxisAngle(new Vec3(1, 0), Math.PI / 2),
        Mat4f.fromAxisAngle(new Vec3(1, 0), Math.PI),
        Mat4f.fromAxisAngle(new Vec3(1, 0), -Math.PI / 2),
        Mat4f.fromAxisAngle(new Vec3(0, 1), Math.PI / 2),
        Mat4f.fromAxisAngle(new Vec3(0, 1), -Math.PI / 2),
    ];

    // top left front is (0, 0, 0), bottom right back is (1, 1, 1)
    let transform = Mat4f.fromTranslation(new Vec3(0.5, 0.5, 0.5)).mul(Mat4f.fromScale(new Vec3(.5, .5, .5)));
    let arr = new Float32Array(6 * 6 * 3 * 2);
    let j = 0;
    for (let faceMtx of faces) {
        for (let i = 0; i < 6; i++) {
            let v = transform.mulVec3Proj(faceMtx.mulVec3Proj(new Vec3(faceVerts[i*2], faceVerts[i*2+1], -1)));
            let n = faceMtx.mulVec3Proj(new Vec3(0, 0, -1));
            arr[j++] = Math.round(v.x);
            arr[j++] = Math.round(v.y);
            arr[j++] = Math.round(v.z);
            arr[j++] = n.x;
            arr[j++] = n.y;
            arr[j++] = n.z;
        }
    }

    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    let vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6 * 4, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 3 * 4);

    return { name: 'cube', vao, vbo, type: gl.TRIANGLES, numVerts: 36 };
}

export function renderBlocksSimple(blockRender: IBlockRender, layout: IModelLayout, cubes: IBlkDef[], viewMtx: Mat4f, modelMtx: Mat4f) {
    let gl = blockRender.gl;
    let locs = blockRender.simpleShader.locs;
    let geom = blockRender.cubeGeom;
    gl.useProgram(blockRender.simpleShader.program);

    gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
    gl.uniformMatrix4fv(locs.u_model, false, modelMtx);
    gl.bindVertexArray(geom.vao);

    for (let cube of cubes) {
        gl.uniform3f(locs.u_size, cube.dx, cube.dy, cube.dz);
        gl.uniform3f(locs.u_offset, cube.x, cube.y, cube.z);
        let baseColor = (cube.t === 'w' ? new Vec4(0.3, 0.3, 1.0, 1) : new Vec4(0.4, 0.8, 0.4, 1)).mul(cube.highlight ?? 0);
        gl.uniform4f(locs.u_baseColor, baseColor.x, baseColor.y, baseColor.z, baseColor.w);
        gl.drawArrays(geom.type, 0, geom.numVerts);
    }
}

export function renderAllBlocks(blockRender: IBlockRender, layout: IModelLayout, viewMtx: Mat4f, modelMtx: Mat4f, camPos: Vec3, lightPosArr: Float32Array, lightColorArr: Float32Array) {
    let gl = blockRender.gl;
    let locs = blockRender.shader.locs;
    let geom = blockRender.cubeGeom;
    gl.useProgram(blockRender.shader.program);

    gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
    gl.uniformMatrix4fv(locs.u_model, false, modelMtx);
    let camPosModel = modelMtx.mulVec3Proj(camPos);
    gl.uniform3f(locs.u_camPos, camPosModel.x, camPosModel.y, camPosModel.z);

    gl.uniform3fv(locs.u_lightPos, lightPosArr);
    gl.uniform3fv(locs.u_lightColor, lightColorArr);
    gl.uniform1i(locs.u_accessSampler, 0);

    gl.bindVertexArray(geom.vao);

    let cubes: IBlkDef[] = [];
    function addCube(c: IBlkDef) {
        if (c.subs) {
            c.subs.forEach(addCube);
        } else {
            cubes.push(c);
        }
    }
    layout.cubes.forEach(addCube);

    for (let cube of cubes) {
        // using uniforms is just a quick & easy way to sort this out
        // things worth putting into a texture:
        gl.uniformMatrix4fv(locs.u_localPosMtx, false, cube.localMtx ?? new Mat4f());
        gl.uniform3f(locs.u_nCells, cube.cx, cube.cy, cube.cz);
        gl.uniform3f(locs.u_size, cube.dx, cube.dy, cube.dz);
        gl.uniform3f(locs.u_offset, cube.x, cube.y, cube.z);
        gl.uniform1f(locs.u_highlight, cube.highlight ?? 0);
        let baseColor = cube.t === 'w' ? new Vec3(0.3, 0.3, 1.0) : new Vec3(0.4, 0.8, 0.4);
        gl.uniform3f(locs.u_baseColor, baseColor.x, baseColor.y, baseColor.z);

        // things we can just pass in as uniforms:
        let hasAccess = cube.access && cube.access.disable !== true;
        if (hasAccess && cube.access) {
            gl.uniformMatrix4x2fv(locs.u_accessMtx, true, cube.access.mat, 0, 8);
            let c = cube.access.channel;
            gl.uniform1i(locs.u_channel, c === 'r' ? 0 : c === 'g' ? 1 : c === 'b' ? 2 : 3);
        }
        gl.uniform1f(locs.u_accessTexScale, hasAccess && cube.access ? cube.access.scale : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, hasAccess && cube.access ? cube.access.src.texture : null);

        gl.drawArrays(geom.type, 0, geom.numVerts);
    }
}
