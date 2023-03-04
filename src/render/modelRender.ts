import { render } from "react-dom";
import { IGpuGptModel, IModelShape } from "../GptModel";
import { genGptModelLayout, IBlkDef, IGptModelLayout } from "../GptModelLayout";
import { createFontBuffers, IFontAtlas, IFontAtlasData, IFontBuffers, measureTextWidth, renderAllText, resetFontBuffers, setupFontAtlas, writeTextToBuffer } from "../utils/font";
import { Mat4f } from "../utils/matrix";
import { createShaderManager, createShaderProgram, ensureShadersReady, IGLContext, IShaderManager } from "../utils/shader";
import { BoundingBox3d, Vec3, Vec4 } from "../utils/vector";
import { initWalkthrough, modifyCells } from "../Walkthrough";
import { createLineRender, renderAllLines, resetLineRender } from "./lineRender";
import { initThreadShader } from "./threadShader";
import { renderTokens } from "./tokenRender";

export interface IRenderView {
    canvasEl: HTMLCanvasElement;
    camAngle: Vec3; // degrees about z axis, and above the x-y plane
    camTarget: Vec3;
    time: number;
    dt: number;
    markDirty: () => void;
}

export type IRenderState = ReturnType<typeof initRender>;

export function initRender(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData) {
    // init shaders for various block types

    console.clear();
    let gl = canvasEl.getContext("webgl2", { antialias: true })!;

    let ext: IGLContext['ext'] = {
        colorBufferFloat: gl.getExtension("EXT_color_buffer_float"),
        disjointTimerQuery: gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    };

    let shaderManager = createShaderManager(gl);

    let ctx: IGLContext = { gl, shaderManager, ext };

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

    let blockShader = createShaderProgram(ctx, 'block', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec3 u_size;
        uniform vec3 u_offset;
        uniform vec3 u_nCells;
        uniform mat4 u_localPosMtx;

        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        out vec3 v_normal;
        out vec3 v_modelPos;
        out vec3 v_blockPos;
        out vec3 v_cubePos;
        void main() {
            vec3 localPos = (u_localPosMtx * vec4(a_position.xy, -a_position.z, 1.0)).xyz;
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
            v_normal = a_normal;
            v_modelPos = model_pos;
            v_blockPos = localPos * u_nCells;
            v_cubePos = localPos;
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec3 v_normal;
        out vec4 o_color;
        in vec3 v_blockPos;
        in vec3 v_cubePos;
        in vec3 v_modelPos;
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
            ivec3 blockPos = ivec3(v_blockPos - vec3(v_normal.x, v_normal.y, -v_normal.z) * 0.1);

            bool cellDark = (blockPos.x + blockPos.y + blockPos.z) % 2 == 0;

            vec3 pxPerCell = 1.0 / fwidth(v_blockPos);
            float maxPxPerCell = max(max(pxPerCell.x, pxPerCell.y), pxPerCell.z);


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

            for (int i = 0; i < 3; i++) {
                vec3 light_dir = normalize(u_lightPos[i] - v_modelPos);
                vec3 view_dir = normalize(u_camPos - v_modelPos);
                vec3 half_dir = normalize(light_dir + view_dir);
                vec3 reflect_dir = reflect(-light_dir, v_normal);
                vec3 diffuse = 0.2 * baseColor * max(dot(light_dir, v_normal), 0.0);
                vec3 specular = 0.1 * u_lightColor[i] * pow(max(dot(half_dir, v_normal), 0.0), 32.0);

                color += diffuse + specular;
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

    let lightShader = createShaderProgram(ctx, 'light', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform vec3 u_size;
        uniform vec3 u_offset;
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        out vec3 v_normal;
        out vec3 v_modelPos;
        void main() {
            vec3 model_pos = a_position * u_size + u_offset;
            gl_Position = u_view * u_model * vec4(model_pos, 1);
            v_normal = a_normal;
            v_modelPos = model_pos;
        }
    `, /*glsl*/`#version 300 es
        precision highp float;
        in vec3 v_normal;
        out vec4 o_color;

        void main() {
            o_color = vec4(.9, .5, .5, 1);
        }
    `, ['u_view', 'u_model', 'u_size', 'u_offset'])!;

    let fontAtlas = setupFontAtlas(ctx, fontAtlasData);

    let modelFontBuf = createFontBuffers(fontAtlas);
    let overlayFontBuf = createFontBuffers(fontAtlas);

    let cubeGeom = genCubeGeom(gl);

    let threadShader = initThreadShader(ctx);

    let lineRender = createLineRender(ctx);

    let walkthrough = initWalkthrough();

    ensureShadersReady(shaderManager);

    let query = gl.createQuery()!;

    return {
        canvasEl,
        gl,
        ctx,
        cubeGeom,
        quadVao,
        quadVbo,
        blockShader,
        lightShader,
        threadShader,
        lineRender,
        shaderManager,
        fontAtlas,
        modelFontBuf,
        overlayFontBuf,
        walkthrough,
        query,
        lastGpuMs: 0,
        lastJsMs: 0,
        hasRunQuery: false,
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

    // top left front is (0, 0, 0), bottom right back is (1, 1, -1)
    let transform = Mat4f.fromTranslation(new Vec3(0.5, 0.5, -0.5)).mul(Mat4f.fromScale(new Vec3(.5, .5, .5)));
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

export function renderModel(view: IRenderView, args: IRenderState, shape: IModelShape, gptGpuModel?: IGpuGptModel) {
    let timer0 = performance.now();
    let { gl, blockShader, lightShader, canvasEl, threadShader: { threadShader }, ctx } = args;
    let layout = genGptModelLayout(shape, gptGpuModel);
    let cell = layout.cell;

    resetLineRender(args.lineRender);
    resetFontBuffers(args.modelFontBuf);
    resetFontBuffers(args.overlayFontBuf);

    modifyCells(args, view, layout);
    args.walkthrough.markDirty = view.markDirty;

    renderTokens(args, layout);
    addSomeText(args.modelFontBuf, layout);

    // pull out timing logic somewhere else
    let resultAvailable = false;

    if (args.hasRunQuery) {
        resultAvailable = gl.getQueryParameter(args.query, gl.QUERY_RESULT_AVAILABLE);
    }

    let queryCanRun = ctx.ext.disjointTimerQuery && (!args.hasRunQuery || resultAvailable);

    if (queryCanRun && ctx.ext.disjointTimerQuery) {

        if (resultAvailable) {
            let timeElapsed = gl.getQueryParameter(args.query, gl.QUERY_RESULT);
            args.lastGpuMs = timeElapsed / 1000000;
        }

        if (queryCanRun) {
            gl.beginQuery(ctx.ext.disjointTimerQuery.TIME_ELAPSED_EXT, args.query);
            args.hasRunQuery = true;
        }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasEl.width, canvasEl.height);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    let bb = new BoundingBox3d();
    for (let c of layout.cubes) {
        let tl = new Vec3(c.x, c.y, c.z);
        let br = new Vec3(c.x + c.cx * cell, c.y + c.cy * cell, c.z + c.cz * cell);
        bb.addInPlace(tl);
        bb.addInPlace(br);
    }
    let localDist = bb.size().len();

    let camZoom = view.camAngle.z;
    let angleX = view.camAngle.x * Math.PI / 180;
    let angleY = view.camAngle.y * Math.PI / 180;

    let dist = 200 * camZoom;
    let camZ = dist * Math.sin(angleY);
    let camX = dist * Math.cos(angleY) * Math.cos(angleX);
    let camY = dist * Math.cos(angleY) * Math.sin(angleX);

    let camLookat = view.camTarget;
    let camPos = new Vec3(camX, camY, camZ).add(camLookat);

    let lookAt = Mat4f.fromLookAt(camPos, camLookat, new Vec3(0, 0, 1));
    let persp = Mat4f.fromPersp(40, view.canvasEl.height / view.canvasEl.width, dist / 100, localDist + Math.max(dist * 2, 10000));
    let viewMtx = persp.mul(lookAt);
    let modelMtx = new Mat4f();

    let lightPos = [
        new Vec3(100, 400, 600),
        new Vec3(-200, -300, -300),
        new Vec3(200, -100, 0),
    ];
    let lightColor = [
        new Vec3(1, 0.2, 0.2),
        new Vec3(1, 0.2, 0.2),
        new Vec3(1, 0.2, 0.2),
    ];
    let lightPosArr = new Float32Array(3 * 3);
    let lightColorArr = new Float32Array(3 * 3);
    for (let i = 0; i < 3; i++) {
        modelMtx.mulVec3Proj(lightPos[i]).writeToBuf(lightPosArr, i * 3);
        modelMtx.mulVec3Proj(lightColor[i]).writeToBuf(lightColorArr, i * 3);
    }

    for (let light of lightPos) {
        gl.useProgram(lightShader.program);
        let locs = lightShader.locs;
        let geom = args.cubeGeom;
        gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
        gl.uniformMatrix4fv(locs.u_model, false, modelMtx);
        gl.uniform3f(locs.u_offset, light.x, light.y, light.z);
        gl.uniform3f(locs.u_size, 3, 3, 3);
        gl.bindVertexArray(geom.vao);
        // gl.drawArrays(geom.type, 0, geom.numVerts);
    }

    {
        let locs = blockShader.locs;
        let geom = args.cubeGeom;
        gl.useProgram(blockShader.program);

        gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
        gl.uniformMatrix4fv(locs.u_model, false, modelMtx);
        let camPosModel = modelMtx.mulVec3Proj(camPos);
        gl.uniform3f(locs.u_camPos, camPosModel.x, camPosModel.y, camPosModel.z);

        gl.uniform3fv(locs.u_lightPos, lightPosArr);
        gl.uniform3fv(locs.u_lightColor, lightColorArr);
        gl.uniform1i(locs.u_accessSampler, 0);

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
            gl.uniformMatrix4fv(locs.u_localPosMtx, false, cube.localMtx ?? new Mat4f());
            gl.uniform3f(locs.u_nCells, cube.cx, cube.cy, cube.cz);
            gl.uniform3f(locs.u_size, cube.dx, cube.dy, cube.dz);
            gl.uniform3f(locs.u_offset, cube.x, cube.y, cube.z);
            gl.uniform1f(locs.u_highlight, cube.highlight ?? 0);
            let baseColor = cube.t === 'w' ? new Vec3(0.3, 0.3, 1.0) : new Vec3(0.4, 0.8, 0.4);
            gl.uniform3f(locs.u_baseColor, baseColor.x, baseColor.y, baseColor.z);
            let hasAccess = cube.access && cube.access.disable !== true;
            if (hasAccess && cube.access) {
                gl.uniformMatrix4x2fv(locs.u_accessMtx, true, cube.access.mat, 0, 8);
                let c = cube.access.channel;
                gl.uniform1i(locs.u_channel, c === 'r' ? 0 : c === 'g' ? 1 : c === 'b' ? 2 : 3);
            }
            gl.uniform1f(locs.u_accessTexScale, hasAccess && cube.access ? cube.access.scale : 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, hasAccess && cube.access ? cube.access.src.texture : null);

            gl.bindVertexArray(geom.vao);
            gl.drawArrays(geom.type, 0, geom.numVerts);
        }
    }

    {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.disable(gl.CULL_FACE);
        gl.polygonOffset(-1.0, -2.0);

        let locs = threadShader.locs;
        gl.useProgram(threadShader.program);

        gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
        gl.uniformMatrix4fv(locs.u_model, false, modelMtx);

        let block = layout.residual0;

        let deltaZ = block.cz / 2; // (view.time * 0.03) % block.cz;
        // view.markDirty();

        let cz = Math.round(deltaZ);
        let pos = new Vec3(block.x, block.y, block.z);
        let size = new Vec3(block.cx * cell, block.cy * cell, cz * cell);
        gl.uniform3f(locs.u_offset, pos.x, pos.y, pos.z);
        gl.uniform3f(locs.u_size, size.x, size.y, size.z);
        gl.uniform2f(locs.u_nCells, block.cx, cz);

        gl.uniformMatrix3x2fv(locs.u_threadDir, true, [
            1, 0, 0,
            0, -1, 1]);

        let baseColor = new Vec3(1.0, 0.0, 0.0);
        gl.uniform3f(locs.u_baseColor, baseColor.x, baseColor.y, baseColor.z);

        gl.bindVertexArray(args.threadShader.threadVao);
        // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

        gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    {
        renderAllText(gl, args.modelFontBuf, viewMtx, modelMtx);
    }
    {
        renderAllLines(args.lineRender, viewMtx, modelMtx, new Vec4(0, 0, 0, 1));
    }
    {
        let w = canvasEl.width;
        let h = canvasEl.height;

        let text = `GPU: ${args.lastGpuMs.toFixed(2)}ms, JS: ${args.lastJsMs.toFixed(2)}ms`;
        let fontSize = 14;
        let tw = measureTextWidth(args.overlayFontBuf, text, fontSize);
        writeTextToBuffer(args.overlayFontBuf, text, new Vec4(0,0,0,1), w - tw - 4, 4, fontSize, new Mat4f());

        let screenViewMtx = Mat4f.fromOrtho(0, w, h, 0, -1, 1);
        renderAllText(gl, args.overlayFontBuf, screenViewMtx, new Mat4f());
    }

    if (ctx.ext.disjointTimerQuery && queryCanRun) {
        gl.endQuery(ctx.ext.disjointTimerQuery.TIME_ELAPSED_EXT);
    }

    args.lastJsMs = performance.now() - timer0;
}

export function addSomeText(fontBuf: IFontBuffers, layout: IGptModelLayout) {

    let text = 'nano-gpt (~9k params)';
    let target = layout.idxObj;

    let fontEm = 4;
    let width = measureTextWidth(fontBuf, text, fontEm);

    let mtx = Mat4f.fromScale(new Vec3(1, 1, 1).mul(2));
    let mtx3 = Mat4f.fromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    let mtx2 = Mat4f.fromTranslation(new Vec3(0, 0, target.z + target.cz * layout.cell * 10 + 0.5));
    let mtxRes = mtx2.mul(mtx.mul(mtx3));
    writeTextToBuffer(fontBuf, text, new Vec4(0,0,0,1), - width / 2, -fontEm, fontEm, mtxRes);
}
