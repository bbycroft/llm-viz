import { createFontBuffers, IFontAtlas, IFontAtlasData, IFontBuffers, measureTextWidth, renderAllText, resetFontBuffers, setupFontAtlas, uploadAllText, writeTextToBuffer } from "./fontRender";
import { Mat4f } from "@/src/utils/matrix";
import { createShaderManager, ensureShadersReady, IGLContext } from "@/src/utils/shader";
import { Vec3, Vec4 } from "@/src/utils/vector";
import { IBlockRender, initBlockRender, renderAllBlocks, renderAllBlocksInstanced, renderBlocksSimple } from "./blockRender";
import { initBlurRender, renderBlur, setupBlurTarget } from "./blurRender";
import { createLineRender, renderAllLines, resetLineRender, uploadAllLines } from "./lineRender";
import { renderAllThreads, initThreadRender } from "./threadRender";
import { initSharedRender, RenderPhase, writeModelViewUbo } from "./sharedRender";
import { cameraToMatrixView } from "../Camera";
import { initTriRender, renderAllTris, resetTriRender, uploadAllTris } from "./triRender";
import { createQueryManager, IQueryManager } from "./queryManager";
import { IProgramState } from "../Program";
import { ISyncObject } from "./syncObjects";

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
    lineRender: ReturnType<typeof createLineRender>;
    threadRender: ReturnType<typeof initThreadRender>;
    blurRender: ReturnType<typeof initBlurRender>;
    sharedRender: ReturnType<typeof initSharedRender>;
    triRender: ReturnType<typeof initTriRender>;
    fontAtlas: IFontAtlas;
    modelFontBuf: IFontBuffers;
    quadVao: WebGLVertexArrayObject;
    queryManager: IQueryManager;
    syncObjects: ISyncObject[];
    size: Vec3;

    renderTiming: boolean;
    lastGpuMs: number;
    lastJsMs: number;
}

export function initRender(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData): IRenderState | null {
    // init shaders for various block types

    // console.clear();
    let gl = canvasEl.getContext("webgl2", { antialias: true })!;

    if (!gl) {
        return null;
    }

    let ext: IGLContext['ext'] = {
        colorBufferFloat: gl.getExtension("EXT_color_buffer_float"),
        disjointTimerQuery: gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    };

    if (!ext.colorBufferFloat) {
        console.log("initRender: EXT_color_buffer_float not supported: floating point textures will not work.");
    }

    if (!ext.disjointTimerQuery) {
        console.log("initRender: EXT_disjoint_timer_query_webgl2 not supported: GPU timing will not work.");
    }

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

    let sharedRender = initSharedRender(ctx);

    let fontAtlas = setupFontAtlas(ctx, fontAtlasData);

    let modelFontBuf = createFontBuffers(fontAtlas, sharedRender);
    let threadRender = initThreadRender(ctx);
    let lineRender = createLineRender(ctx, sharedRender);
    let blockRender = initBlockRender(ctx);
    let triRender = initTriRender(ctx, sharedRender);
    let blurRender = initBlurRender(ctx, quadVao);
    let queryManager = createQueryManager(ctx);

    ensureShadersReady(shaderManager);

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
        quadVao,
        queryManager,
        syncObjects: [],
        size: new Vec3(1, 1),
        lastGpuMs: 0,
        lastJsMs: 0,
        renderTiming: false,
    };
}

export function resetRenderBuffers(args: IRenderState) {
    resetLineRender(args.lineRender);
    resetFontBuffers(args.modelFontBuf);
    resetTriRender(args.triRender);
}

export function renderModel(state: IProgramState) {
    let { layout, render: args, camera } = state;
    let { gl, blockRender, size } = args;

    let { modelMtx, viewMtx } = camera;
    let { camPos } = cameraToMatrixView(camera);

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


    /// ------ The render pass ------ ///

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size.x, size.y);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    gl.frontFace(gl.CW); // our transform has a -ve determinant, so we switch this for correct rendering

    if (args.renderTiming) {
        let text = `GPU: ${args.lastGpuMs.toFixed(1)}ms JS: ${args.lastJsMs.toFixed(1)}ms`;
        let w = size.x;
        let fontSize = 14;
        args.sharedRender.activePhase = RenderPhase.Overlay2D;
        let tw = measureTextWidth(args.modelFontBuf, text, fontSize);
        writeTextToBuffer(args.modelFontBuf, text, new Vec4(0,0,0,1), w - tw - 4, 4, fontSize, new Mat4f());
    }

    writeModelViewUbo(args.sharedRender, modelMtx, viewMtx);

    {
        let blurBlocks = layout.cubes.filter(a => a.highlight > 0)
        setupBlurTarget(args.blurRender);
        renderBlocksSimple(blockRender, blurBlocks);

        renderBlur(args.blurRender, null);
    }
    gl.enable(gl.DEPTH_TEST);

    uploadAllLines(args.lineRender);
    uploadAllTris(args.triRender);
    uploadAllText(args.modelFontBuf);

    renderAllBlocks(blockRender, layout, modelMtx, camPos, lightPosArr, lightColorArr);

    args.sharedRender.activePhase = RenderPhase.Opaque;

    for (let example of state.examples) {
        if (example.enabled && example.layout) {
            let { modelMtx, viewMtx } = camera;
            let { camPos } = cameraToMatrixView(camera);
            var modelMtxLocal = modelMtx.mul(Mat4f.fromTranslation(example.offset));
            writeModelViewUbo(args.sharedRender, modelMtxLocal, viewMtx);
            renderAllBlocksInstanced(example.blockRender, example.layout, modelMtxLocal, camPos);
        }
    }

    writeModelViewUbo(args.sharedRender, modelMtx, viewMtx);

    renderAllThreads(args.threadRender);

    gl.polygonOffset(-1.0, -2.0);

    let phaseOrder = [RenderPhase.Opaque, RenderPhase.Arrows, RenderPhase.Overlay, RenderPhase.Overlay2D];
    for (let phase of phaseOrder) {

        if (phase === RenderPhase.Overlay2D) {
            let w = size.x;
            let h = size.y;
            gl.clear(gl.DEPTH_BUFFER_BIT);
            writeModelViewUbo(args.sharedRender, new Mat4f(), Mat4f.fromOrtho(0, w, h, 0, -1, 1));
        }

        if (phase === RenderPhase.Overlay || phase === RenderPhase.Overlay2D) {
            gl.enable(gl.POLYGON_OFFSET_FILL);
        } else {
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }
        renderAllTris(args.triRender, phase);
        renderAllText(args.modelFontBuf, phase);
        renderAllLines(args.lineRender, phase);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

}
