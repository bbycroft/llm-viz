import { IColorMix } from "../Annotations";
import { IGpuGptModel, IModelShape } from "../GptModel";
import { genGptModelLayout, IGptModelLayout } from "../GptModelLayout";
import { createFontBuffers, IFontAtlas, IFontAtlasData, IFontBuffers, measureTextWidth, renderAllText, resetFontBuffers, setupFontAtlas, writeTextToBuffer } from "./fontRender";
import { Mat4f } from "../utils/matrix";
import { createShaderManager, ensureShadersReady, IGLContext } from "../utils/shader";
import { BoundingBox3d, Vec3, Vec4 } from "../utils/vector";
import { initWalkthrough, runWalkthrough } from "../walkthrough/Walkthrough";
import { IBlockRender, initBlockRender, renderAllBlocks, renderBlocksSimple } from "./blockRender";
import { initBlurRender, renderBlur, setupBlurTarget } from "./blurRender";
import { createLineRender, renderAllLines, resetLineRender } from "./lineRender";
import { renderAllThreads, initThreadRender } from "./threadRender";
import { renderTokens } from "./tokenRender";
import { initSharedRender, writeModelViewUbo } from "./sharedRender";
import { cameraMoveToDesired, cameraToMatrixView, ICamera } from "../Camera";
import { renderModelCard } from "../components/ModelCard";
import { SavedState } from "../SavedState";
import { initTriRender, renderAllTris, resetTriRender } from "./triRender";
import { drawAllArrows } from "../components/Arrow";

export interface IRenderView {
    time: number;
    dt: number;
    markDirty: () => void;
}

export interface IRenderState {
    gl: WebGL2RenderingContext;
    canvasEl: HTMLCanvasElement;
    ctx: IGLContext;
    blockRender: IBlockRender;
    walkthrough: ReturnType<typeof initWalkthrough>;
    lineRender: ReturnType<typeof createLineRender>;
    threadRender: ReturnType<typeof initThreadRender>;
    blurRender: ReturnType<typeof initBlurRender>;
    sharedRender: ReturnType<typeof initSharedRender>;
    triRender: ReturnType<typeof initTriRender>;
    fontAtlas: IFontAtlas;
    modelFontBuf: IFontBuffers;
    overlayFontBuf: IFontBuffers;
    quadVao: WebGLVertexArrayObject;
    query: WebGLQuery;
    tokenColors: IColorMix | null;

    camera: ICamera;

    // factor into query stuff
    lastGpuMs: number;
    lastJsMs: number;
    hasRunQuery: boolean;
}

export function initRender(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData): IRenderState {
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

    let fontAtlas = setupFontAtlas(ctx, fontAtlasData);

    let modelFontBuf = createFontBuffers(fontAtlas);
    let overlayFontBuf = createFontBuffers(fontAtlas);
    let sharedRender = initSharedRender(ctx);
    let threadRender = initThreadRender(ctx);
    let lineRender = createLineRender(ctx);
    let blockRender = initBlockRender(ctx);
    let triRender = initTriRender(ctx);
    let blurRender = initBlurRender(ctx, quadVao);
    let walkthrough = initWalkthrough();

    ensureShadersReady(shaderManager);

    let query = gl.createQuery()!;

    let prevState = SavedState.state;
    let camera: ICamera = {
        angle: prevState?.camera.angle ?? new Vec3(290, 20, 30),
        center: prevState?.camera.center ?? new Vec3(0, 0, -500),
        transition: {},
    }

    return {
        canvasEl,
        gl,
        ctx,
        blockRender,
        threadRender,
        lineRender,
        blurRender,
        triRender,
        sharedRender,
        fontAtlas,
        modelFontBuf,
        overlayFontBuf,
        walkthrough,
        quadVao,
        query,
        tokenColors: null as IColorMix | null,
        lastGpuMs: 0,
        lastJsMs: 0,
        hasRunQuery: false,
        camera,
    };
}

export function renderModel(view: IRenderView, args: IRenderState, shape: IModelShape, gptGpuModel?: IGpuGptModel) {
    let timer0 = performance.now();
    let { gl, blockRender, canvasEl, ctx } = args;

    if (args.walkthrough.running) {
        cameraMoveToDesired(args.camera, view.dt);
    }

    let layout = genGptModelLayout(shape, gptGpuModel);
    let cell = layout.cell;

    resetLineRender(args.lineRender);
    resetFontBuffers(args.modelFontBuf);
    resetFontBuffers(args.overlayFontBuf);
    resetTriRender(args.triRender);

    runWalkthrough(args, view, layout);

    drawAllArrows(args, layout);

    renderModelCard(args, layout);
    renderTokens(args, layout, undefined, undefined, args.tokenColors || undefined);


    let bb = new BoundingBox3d();
    for (let c of layout.cubes) {
        let tl = new Vec3(c.x, c.y, c.z);
        let br = new Vec3(c.x + c.cx * cell, c.y + c.cy * cell, c.z + c.cz * cell);
        bb.addInPlace(tl);
        bb.addInPlace(br);
    }
    let localDist = bb.size().len();

    let { lookAt, camPos } = cameraToMatrixView(args.camera);
    let dist = 200 * args.camera.angle.z;

    let persp = Mat4f.fromPersp(40, args.canvasEl.width / args.canvasEl.height, dist / 100, localDist + Math.max(dist * 2, 10000));
    let viewMtx = persp.mul(lookAt);
    let modelMtx = new Mat4f();
    modelMtx[0] = 1.0;
    modelMtx[5] = 0.0;
    modelMtx[6] = -1.0;
    modelMtx[9] = -1.0;
    modelMtx[10] = 0.0;

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

    /// ------ The render pass ------ ///

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasEl.width, canvasEl.height);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    gl.frontFace(gl.CW); // our transform has a -ve determinant, so we switch this for correct rendering

    writeModelViewUbo(args.sharedRender, modelMtx, viewMtx);

    {
        let blurBlocks = layout.cubes.filter(a => a.highlight > 0)
        setupBlurTarget(args.blurRender);
        renderBlocksSimple(blockRender, blurBlocks);

        renderBlur(args.blurRender, null);
    }
    gl.enable(gl.DEPTH_TEST);

    renderAllBlocks(blockRender, layout, modelMtx, camPos, lightPosArr, lightColorArr);
    renderAllTris(args.triRender);
    renderAllThreads(args.threadRender);
    renderAllText(gl, args.modelFontBuf);
    renderAllLines(args.lineRender, viewMtx, modelMtx, new Vec4(0, 0, 0, 1));

    {
        let w = canvasEl.width;
        let h = canvasEl.height;

        let text = `GPU: ${args.lastGpuMs.toFixed(2)}ms, JS: ${args.lastJsMs.toFixed(2)}ms`;
        let fontSize = 14;
        let tw = measureTextWidth(args.overlayFontBuf, text, fontSize);
        writeTextToBuffer(args.overlayFontBuf, text, new Vec4(0,0,0,1), w - tw - 4, 4, fontSize, new Mat4f());

        writeModelViewUbo(args.sharedRender, new Mat4f(), Mat4f.fromOrtho(0, w, h, 0, -1, 1));
        renderAllText(gl, args.overlayFontBuf);
    }

    if (ctx.ext.disjointTimerQuery && queryCanRun) {
        gl.endQuery(ctx.ext.disjointTimerQuery.TIME_ELAPSED_EXT);
    }
    gl.flush();

    args.lastJsMs = performance.now() - timer0;
}
