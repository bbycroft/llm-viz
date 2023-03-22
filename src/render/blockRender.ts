import { IBlkDef, IModelLayout } from "../GptModelLayout";
import { Mat4f } from "../utils/matrix";
import { createFloatBuffer, createShaderProgram, ensureFloatBufferSize, IGLContext, resetFloatBufferMap, uploadFloatBuffer } from "../utils/shader";
import { Vec3, Vec4 } from "../utils/vector";
import { modelViewUboText, UboBindings } from "./sharedRender";


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

    let blockUboText = /*glsl*/`
    layout (std140) uniform BlockUbo {
        uniform vec3 u_offset;
        uniform vec3 u_size;
        uniform vec3 u_nCells;
        uniform mat4 u_localPosMtx;
        uniform vec4 u_baseColor;
        uniform float u_highlight;
    };`;

    let blockAccessUboText = /*glsl*/`
    layout (std140) uniform BlockAccessUbo {
        layout(row_major) uniform mat4x2 u_accessMtx;
        uniform float u_accessTexChannel;
        uniform float u_accessTexScale;
    };`;

    let numBlocks = 1024;
    let blockSize = (1 + 1 + 1 + 4 + 1 + 1) * 4 * 4;
    let blockUbo = createFloatBuffer(gl, gl.UNIFORM_BUFFER, gl.createBuffer()!, numBlocks, blockSize, null);

    let blockAccessSize = (2 + 1 + 1 + 1) * 4 * 4;
    let blockAccessUbo = createFloatBuffer(gl, gl.UNIFORM_BUFFER, gl.createBuffer()!, numBlocks, blockAccessSize, null);

    // Create a dummy texture to bind to the access texture slot. Some drivers (e.g. my phone) will complain if we don't.
    let dummyTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, dummyTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    let shader = createShaderProgram(ctx, 'block', /*glsl*/`#version 300 es
        precision highp float;

        ${modelViewUboText}

        ${blockUboText}

        ${blockAccessUboText}

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
        uniform vec3 u_lightPos[3]; // in model space
        uniform vec3 u_lightColor[3]; // in model space
        uniform vec3 u_camPos; // in model space

        ${blockUboText}

        ${blockAccessUboText}

        uniform sampler2D u_accessSampler;

        void main() {
            ivec3 blockPos = ivec3(v_blockPos - v_normal * 0.1);

            bool cellDark = (blockPos.x + blockPos.y + blockPos.z) % 2 == 0;

            float maxDist = 4000.0;
            float minDist = 600.0;
            float dist = distance(u_camPos, v_modelPos);
            float t = clamp((dist - minDist) / (maxDist - minDist), 0.0, 1.0);

            vec3 baseColor = mix(u_baseColor.rgb, vec3(0.5, 0.5, 0.5), 0.5);
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
                    float val = u_accessTexChannel == 0.0 ? valVec.r : u_accessTexChannel == 1.0 ? valVec.g : valVec.b;

                    float weight = clamp(abs(val), 0.0, 1.0);

                    vec3 negColor = vec3(0.0, 0.0, 0.0);
                    vec3 posColor = u_baseColor.rgb; // vec3(0.0, 1.0, 0.0);
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

                vec3 cube = v_cubePos - v_normal * 0.1;
                vec3 cubeGrid = abs(fract(cube - 0.5) - 0.5) / fwidth(cube);
                float lineCube = min(min(cubeGrid.x, cubeGrid.x), cubeGrid.z);

                float edgeWeight = smoothstep(0.0, 1.0, min(min(lineCube, line256), line16));
                baseColor = mix(baseColor, vec3(1.0, 1.0, 1.0), 1.0 - edgeWeight);
            }

            vec3 color = mix(baseColor * 0.7, u_baseColor.rgb, u_highlight);

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

            o_color = vec4(color, 1) * u_baseColor.a;
        }
    `, [
        'u_lightPos', 'u_camPos', 'u_lightColor', 'u_accessSampler',
    ], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView, 'BlockUbo': UboBindings.Block, 'BlockAccessUbo': UboBindings.BlockAccess } })!;

    let simpleShader = createShaderProgram(ctx, 'block-simple', /*glsl*/`#version 300 es
        precision highp float;
        ${modelViewUboText}
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
        'u_size', 'u_offset', 'u_baseColor',
    ], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;

    let cubeGeom = genCubeGeom(gl);

    return {
        gl,
        cubeGeom,
        quadVao,
        quadVbo,
        shader,
        simpleShader,
        blockUbo,
        blockAccessUbo,
        dummyTexture,
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

export function renderBlocksSimple(blockRender: IBlockRender, cubes: IBlkDef[]) {
    let gl = blockRender.gl;
    let locs = blockRender.simpleShader.locs;
    let geom = blockRender.cubeGeom;
    gl.useProgram(blockRender.simpleShader.program);
    gl.bindVertexArray(geom.vao);

    for (let cube of cubes) {
        gl.uniform3f(locs.u_size, cube.dx, cube.dy, cube.dz);
        gl.uniform3f(locs.u_offset, cube.x, cube.y, cube.z);
        let baseColor = (cube.t === 'w' ? new Vec4(0.3, 0.3, 1.0, 1) : new Vec4(0.4, 0.8, 0.4, 1)).mul(cube.highlight);
        gl.uniform4f(locs.u_baseColor, baseColor.x, baseColor.y, baseColor.z, baseColor.w);
        gl.drawArrays(geom.type, 0, geom.numVerts);
    }
}

export function renderAllBlocks(blockRender: IBlockRender, layout: IModelLayout, modelMtx: Mat4f, camPos: Vec3, lightPosArr: Float32Array, lightColorArr: Float32Array) {
    let gl = blockRender.gl;
    let locs = blockRender.shader.locs;
    let geom = blockRender.cubeGeom;
    gl.useProgram(blockRender.shader.program);

    let camPosModel = modelMtx.mulVec3Proj(camPos);
    gl.uniform3f(locs.u_camPos, camPosModel.x, camPosModel.y, camPosModel.z);

    gl.uniform3fv(locs.u_lightPos, lightPosArr);
    gl.uniform3fv(locs.u_lightColor, lightColorArr);
    gl.uniform1i(locs.u_accessSampler, 0);
    gl.enable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(geom.vao);

    let cubes: IBlkDef[] = [];
    let transparentCubes: IBlkDef[] = [];
    function addCube(c: IBlkDef) {
        if (c.subs) {
            c.subs.forEach(addCube);
        } else {
            if (c.opacity < 0.8 && c.opacity > 0) {
                transparentCubes.push(c);
            } else if (c.opacity > 0.0) {
                cubes.push(c);
            }
        }
    }
    layout.cubes.forEach(addCube);
    let allCubes = [...cubes, ...transparentCubes];
    let firstTransparent = cubes.length;

    let blockUbo = blockRender.blockUbo.localBufs[0];
    let blockAccessUbo = blockRender.blockAccessUbo.localBufs[0];

    {
        resetFloatBufferMap(blockRender.blockUbo);
        ensureFloatBufferSize(blockUbo, cubes.length);
        let blockBuf = blockUbo.buf;
        for (let cube of allCubes) {
            let baseOff = blockUbo.usedEls * blockUbo.strideFloats;
            blockBuf[baseOff + 0] = cube.x;
            blockBuf[baseOff + 1] = cube.y;
            blockBuf[baseOff + 2] = cube.z;

            blockBuf[baseOff + 4] = cube.dx;
            blockBuf[baseOff + 5] = cube.dy;
            blockBuf[baseOff + 6] = cube.dz;

            blockBuf[baseOff + 8] = cube.cx;
            blockBuf[baseOff + 9] = cube.cy;
            blockBuf[baseOff + 10] = cube.cz;

            blockBuf.set(cube.localMtx ?? new Mat4f(), baseOff + 12);

            let baseColor = (cube.t === 'w' ? new Vec4(0.3, 0.3, 1.0, cube.opacity) : new Vec4(0.4, 0.8, 0.4, cube.opacity));
            baseColor.writeToBuf(blockBuf, baseOff + 28);

            blockBuf[baseOff + 32] = cube.highlight;

            blockUbo.usedEls += 1;
        }
        uploadFloatBuffer(gl, blockRender.blockUbo);
    }

    {
        resetFloatBufferMap(blockRender.blockAccessUbo);
        ensureFloatBufferSize(blockAccessUbo, cubes.length);
        let blockBuf = blockAccessUbo.buf;
        for  (let cube of allCubes) {
            let baseOff = blockAccessUbo.usedEls * blockAccessUbo.strideFloats;
            if (cube.access && cube.access.disable !== true) {
                blockBuf.set(cube.access.mat.slice(0, 8), baseOff);
                let c = cube.access.channel;

                blockBuf[baseOff + 8] = c === 'r' ? 0.0 : c === 'g' ? 1.0 : c === 'b' ? 2.0 : 3.0;
                blockBuf[baseOff + 9] = cube.access.scale;
            } else {
                blockBuf[baseOff + 9] = 0.0;
            }
            blockAccessUbo.usedEls += 1;
        }
        uploadFloatBuffer(gl, blockRender.blockAccessUbo);
    }

    let prevHasAccess = true;
    let idx = 0;
    for (let cube of allCubes) {
        if (idx === firstTransparent) {
            gl.depthMask(false);
        }

        gl.bindBufferRange(gl.UNIFORM_BUFFER, UboBindings.Block, blockRender.blockUbo.buf, idx * blockUbo.strideBytes, blockUbo.strideBytes);

        let hasAccess = !!cube.access && cube.access.disable !== true;
        if (prevHasAccess || hasAccess) {
            gl.bindBufferRange(gl.UNIFORM_BUFFER, UboBindings.BlockAccess, blockRender.blockAccessUbo.buf, idx * blockAccessUbo.strideBytes, blockAccessUbo.strideBytes);
            gl.bindTexture(gl.TEXTURE_2D, hasAccess && cube.access ? cube.access.src.texture : blockRender.dummyTexture);
            prevHasAccess = hasAccess;
        }

        gl.drawArrays(geom.type, 0, geom.numVerts);
        idx++;
    }

    gl.depthMask(true);
}
