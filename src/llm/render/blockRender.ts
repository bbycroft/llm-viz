import { IBlkDef, IModelLayout } from "../GptModelLayout";
import { Mat4f } from "@/src/utils/matrix";
import { bindFloatAttribs, createFloatBuffer, createShaderProgram, ensureFloatBufferSize, IGLContext, resetFloatBufferMap, uploadFloatBuffer } from "@/src/utils/shader";
import { Vec3, Vec4 } from "@/src/utils/vector";
import { Colors } from "../walkthrough/WalkthroughTools";
import { modelViewUboText, UboBindings } from "./sharedRender";


export type IBlockRender = ReturnType<typeof initBlockRender>;

export function initBlockRender(ctx: IGLContext) {
    let gl = ctx.gl;

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

    // non-instanced rendering VAO
    let cubeGeom = genCubeGeom(gl);

    // instanced rendering VAO
    let instancedVao = gl.createVertexArray()!;
    gl.bindVertexArray(instancedVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeGeom.vbo);
    bindFloatAttribs(gl, cubeGeom.vbo, {}, [
        { name: 'a_position', size: 3 },
        { name: 'a_normal', size: 3 },
    ]);

    let instancedVbo = gl.createBuffer()!;
    let instancedStrideBytes = bindFloatAttribs(gl, instancedVbo, { locOffset: 2, divisor: 1 }, [
        { name: 'a_offset', size: 4 },
        { name: 'a_size', size: 4 },
        { name: 'a_nCells', size: 4 },
        { name: 'a_localPosMtx0', size: 4 },
        { name: 'a_localPosMtx1', size: 4 },
        { name: 'a_localPosMtx2', size: 4 },
        { name: 'a_localPosMtx3', size: 4 },
        { name: 'a_baseColor', size: 4 },
        { name: 'a_highlight', size: 1 },
    ]);

    let instancedFloatBuf = createFloatBuffer(gl, gl.ARRAY_BUFFER, instancedVbo, 1024, instancedStrideBytes, null);

    // Create a dummy texture to bind to the access texture slot. Some drivers (e.g. my phone) will complain if we don't.
    let dummyTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, dummyTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    function createVertShader(instanced: boolean) {
        return /*glsl*/`#version 300 es
        precision highp float;

        ${modelViewUboText}

        ${instanced ? '' : blockUboText}

        ${blockAccessUboText}

        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        out vec3 v_normal;
        out vec3 v_modelPos;
        out vec3 v_blockPos;
        out vec2 v_accessPos;
        out vec3 v_cubePos;

        ${instanced ? `
            layout(location = 2) in vec4 a_offset;
            layout(location = 3) in vec4 a_size;
            layout(location = 4) in vec4 a_nCells;
            layout(location = 5) in vec4 a_localPosMtx0;
            layout(location = 6) in vec4 a_localPosMtx1;
            layout(location = 7) in vec4 a_localPosMtx2;
            layout(location = 8) in vec4 a_localPosMtx3;
            layout(location = 9) in vec4 a_baseColor;
            layout(location = 10) in float a_highlight;

            out vec4 u_baseColor;
            out float u_highlight;
        ` : ''}

        void main() {
            ${instanced ? `
                vec3 u_offset = a_offset.xyz;
                vec3 u_size = a_size.xyz;
                vec3 u_nCells = a_nCells.xyz;
                mat4 u_localPosMtx = mat4(a_localPosMtx0, a_localPosMtx1, a_localPosMtx2, a_localPosMtx3);
                u_baseColor = a_baseColor;
                u_highlight = a_highlight;
            ` : ''}

            vec3 localPos = (u_localPosMtx * vec4(a_position, 1.0)).xyz;
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
            v_normal = a_normal;
            v_modelPos = model_pos;
            v_blockPos = localPos * u_nCells;
            v_accessPos = u_accessMtx * vec4(v_blockPos, 1.0);
            v_cubePos = localPos;
            ${instanced ? ` ` : ''}
        }`;
    }

    function createFragShader(instanced: boolean) {
        return /*glsl*/`#version 300 es
        precision highp float;
        in vec3 v_normal;
        out vec4 o_color;
        in vec3 v_blockPos;
        in vec3 v_cubePos;
        in vec3 v_modelPos;
        in vec2 v_accessPos;
        uniform vec3 u_camPos; // in model space

        ${instanced ? `
            in vec4 u_baseColor;
            in float u_highlight;
        ` : blockUboText}

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
                vec3 block16 = v_blockPos / 16.0;
                vec3 pxPerBlock16 = 1.0 / fwidth(block16);
                float strength16 = min(min(pxPerBlock16.x, pxPerBlock16.y), pxPerBlock16.z);
                vec3 colorEdge = vec3(1.0, 1.0, 1.0);
                vec3 color16 = vec3(1.0, 1.0, 1.0) * 0.7;
                vec3 color256 = vec3(1.0, 1.0, 1.0);

                // if we're zoomed out enough, show 256 & (256 * 16) grid lines
                // the 16 grid lines are faded out by this point (fade out between 10px -> 1px)
                if (strength16 < 2.0) {
                    block16 = block16 / 16.0;
                    pxPerBlock16 = 1.0 / fwidth(block16);
                    strength16 = min(min(pxPerBlock16.x, pxPerBlock16.y), pxPerBlock16.z);
                    color16 = color256;
                    // orange
                    color256 = vec3(1.0, 0.7, 0.4);
                }

                float visibility16 = smoothstep(2.0, 10.0, strength16); // below 10px between lines, fade out
                vec3 block16Grid = 1.0 - abs(fract(block16 - 0.5) - 0.5) * pxPerBlock16;
                float line16 = max(max(block16Grid.x, block16Grid.y), block16Grid.z) * visibility16;

                vec3 block256 = block16 / 16.0;
                vec3 block256Grid = 1.0 - abs(fract(block256 - 0.5) - 0.5) / fwidth(block256);
                float line256 = max(max(block256Grid.x, block256Grid.y), block256Grid.z);

                vec3 cube = v_cubePos - v_normal * 0.1;
                vec3 cubeGrid = 1.0 - abs(fract(cube - 0.5) - 0.5) / fwidth(cube);
                float lineCube = max(max(cubeGrid.x, cubeGrid.y), cubeGrid.z);

                float bestPxPerBlock = min(min(pxPerBlock16.x, pxPerBlock16.y), pxPerBlock16.z);
                float edgeWeight = smoothstep(0.0, 1.0, max(max(line16, lineCube), line256));
                vec3 color = lineCube > 0.0 ? colorEdge : (line256 > 0.0 ? color256 : color16);
                baseColor = mix(baseColor, color, edgeWeight);
            }

            vec3 color = mix(baseColor * 0.7, u_baseColor.rgb, u_highlight);

            o_color = vec4(color, 1) * u_baseColor.a;
        }`;
    }

    let shader = createShaderProgram(ctx, 'block', createVertShader(false), createFragShader(false),
        ['u_camPos', 'u_accessSampler'],
        { uboBindings: { 'ModelViewUbo': UboBindings.ModelView, 'BlockUbo': UboBindings.Block, 'BlockAccessUbo': UboBindings.BlockAccess } })!;

    let instancedShader = createShaderProgram(ctx, 'block-instanced', createVertShader(true), createFragShader(true),
        ['u_camPos', 'u_accessSampler'],
        { uboBindings: { 'ModelViewUbo': UboBindings.ModelView, 'BlockAccessUbo': UboBindings.BlockAccess } })!;

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

    return {
        gl,
        cubeGeom,
        shader,
        simpleShader,
        blockUbo,
        blockAccessUbo,
        dummyTexture,

        /* specific to instanced rendering of the blocks. */
        instancedShader,
        instancedVao,
        instancedFloatBuf,
        instancedDataStale: true,
        instancedNumBlocks: 0,
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

    bindFloatAttribs(gl, vbo, {}, [
        { name: 'a_position', size: 3 },
        { name: 'a_normal', size: 3 },
    ]);

    return { name: 'cube', vao, vbo, type: gl.TRIANGLES, numVerts: 36 };
}

export function renderBlocksSimple(blockRender: IBlockRender, cubes: IBlkDef[]) {
    let gl = blockRender.gl;
    if (!blockRender.simpleShader.ready) {
        return;
    }
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

    if (!blockRender.shader.ready) {
        return;
    }

    gl.useProgram(blockRender.shader.program);

    let camPosModel = modelMtx.mulVec3Proj(camPos);
    gl.uniform3f(locs.u_camPos, camPosModel.x, camPosModel.y, camPosModel.z);

    gl.uniform1i(locs.u_accessSampler, 0);
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

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

            let color = (cube.t === 'w' ? Colors.Weights : cube.t === 'i' ? Colors.Intermediates : Colors.Aggregates);
            let baseColor = new Vec4(color.x, color.y, color.z, cube.opacity);
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


export function renderAllBlocksInstanced(blockRender: IBlockRender, layout: IModelLayout, modelMtx: Mat4f, camPos: Vec3) {
    if (!blockRender.instancedShader.ready) {
        return;
    }

    let gl = blockRender.gl;
    let locs = blockRender.instancedShader.locs;
    let blockAccessUbo = blockRender.blockAccessUbo.localBufs[0];
    gl.useProgram(blockRender.instancedShader.program);

    let modelMtxInv = modelMtx.invert();
    let camPosModel = modelMtxInv.mulVec3Proj(camPos);
    gl.uniform3f(locs.u_camPos, camPosModel.x, camPosModel.y, camPosModel.z);

    gl.uniform1i(locs.u_accessSampler, 0);
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blockRender.dummyTexture);

    gl.bindVertexArray(blockRender.instancedVao);

    if (blockRender.instancedDataStale) {
        blockRender.instancedDataStale = false;

        {
            resetFloatBufferMap(blockRender.instancedFloatBuf);
            let vboBuf = blockRender.instancedFloatBuf.localBufs[0];
            ensureFloatBufferSize(vboBuf, layout.cubes.length);
            let buf = vboBuf.buf;

            for (let cube of layout.cubes) {
                if (cube.small) {
                    continue;
                }

                let baseOff = vboBuf.usedEls * vboBuf.strideFloats;
                buf[baseOff + 0] = cube.x;
                buf[baseOff + 1] = cube.y;
                buf[baseOff + 2] = cube.z;

                buf[baseOff + 4] = cube.dx;
                buf[baseOff + 5] = cube.dy;
                buf[baseOff + 6] = cube.dz;

                buf[baseOff + 8] = cube.cx;
                buf[baseOff + 9] = cube.cy;
                buf[baseOff + 10] = cube.cz;

                buf.set(cube.localMtx ?? new Mat4f(), baseOff + 12);

                let color = (cube.t === 'w' ? Colors.Weights : cube.t === 'i' ? Colors.Intermediates : Colors.Aggregates);
                let baseColor = new Vec4(color.x, color.y, color.z, cube.opacity);
                baseColor.writeToBuf(buf, baseOff + 28);

                buf[baseOff + 32] = cube.highlight;

                vboBuf.usedEls += 1;
            }
            uploadFloatBuffer(gl, blockRender.instancedFloatBuf);
            blockRender.instancedNumBlocks = vboBuf.usedEls;
        }

        {
            resetFloatBufferMap(blockRender.blockAccessUbo);
            ensureFloatBufferSize(blockAccessUbo, 1);
            let blockBuf = blockAccessUbo.buf;
            blockBuf[0 + 9] = 0.0;
            blockAccessUbo.usedEls += 1;
            uploadFloatBuffer(gl, blockRender.blockAccessUbo);
        }
    }

    gl.bindBufferRange(gl.UNIFORM_BUFFER, UboBindings.BlockAccess, blockRender.blockAccessUbo.buf, 0, blockAccessUbo.strideBytes);
    gl.drawArraysInstanced(blockRender.cubeGeom.type, 0, blockRender.cubeGeom.numVerts, blockRender.instancedNumBlocks);

    gl.depthMask(true);
}
