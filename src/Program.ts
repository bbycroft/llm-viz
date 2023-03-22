import { cameraMoveToDesired, genModelViewMatrices, ICamera } from "./Camera";
import { drawAllArrows } from "./components/Arrow";
import { drawBlockLabels } from "./components/BlockLabels";
import { drawModelCard } from "./components/ModelCard";
import { IGpuGptModel, IModelShape } from "./GptModel";
import { genGptModelLayout, IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { drawText, IFontAtlasData, IFontOpts, measureText } from "./render/fontRender";
import { initRender, IRenderState, IRenderView, renderModel, resetRenderBuffers } from "./render/modelRender";
import { beginQueryAndGetPrevMs, endQuery } from "./render/queryManager";
import { drawTokens } from "./components/Tokens";
import { SavedState } from "./SavedState";
import { isNotNil, Subscriptions } from "./utils/data";
import { Vec3, Vec4 } from "./utils/vector";
import { initWalkthrough, runWalkthrough } from "./walkthrough/Walkthrough";
import { IColorMix } from "./Annotations";
import { Mat4f } from "./utils/matrix";
import { runMouseHitTesting } from "./Interaction";
import { RenderPhase } from "./render/sharedRender";

export interface IProgramState {
    mouse: IMouseState;
    render: IRenderState;
    walkthrough: ReturnType<typeof initWalkthrough>;
    camera: ICamera;
    htmlSubs: Subscriptions;
    layout: IGptModelLayout;
    shape: IModelShape;
    gptGpuModel: IGpuGptModel | null;
    display: IDisplayState;
    markDirty: () => void;
}

export interface IMouseState {
    mousePos: Vec3;
}

export interface IDisplayState {
    tokenColors: IColorMix | null;
    tokenIdxColors: IColorMix | null;
    tokenIdxModelOpacity?: number[];
    lines: string[];
    hoverTarget: IHoverTarget | null;
}

export interface IHoverTarget {
    subCube: IBlkDef;
    mainCube: IBlkDef;
    mainIdx: Vec3;
}

export function initProgramState(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData): IProgramState {

    let render = initRender(canvasEl, fontAtlasData);
    let walkthrough = initWalkthrough();

    let prevState = SavedState.state;
    let camera: ICamera = {
        angle: prevState?.camera.angle ?? new Vec3(296, 16, 13.5),
        center: prevState?.camera.center ?? new Vec3(-8.4, 0, -481.5),
        transition: {},
        modelMtx: new Mat4f(),
        viewMtx: new Mat4f(),
        lookAtMtx: new Mat4f(),
        camPos: new Vec3(),
    }

    let shape: IModelShape = {
        B: 1,
        T: 11,
        C: 48,
        nHeads: 3,
        A: 48 / 3,
        nBlocks: 3,
        vocabSize: 3,
    };

    return {
        render,
        walkthrough,
        camera,
        shape,
        layout: genGptModelLayout(shape),
        gptGpuModel: null,
        markDirty: () => { },
        htmlSubs: new Subscriptions(),
        mouse: {
            mousePos: new Vec3(),
        },
        display: {
            tokenColors: null,
            tokenIdxColors: null,
            lines: [],
            hoverTarget: null,
        },
    };
}

export function runProgram(view: IRenderView, state: IProgramState) {
    let timer0 = performance.now();

    resetRenderBuffers(state.render);
    state.display.lines = [];
    state.display.hoverTarget = null;
    state.display.tokenColors = null;
    state.display.tokenIdxColors = null;

    if (state.walkthrough.running) {
        cameraMoveToDesired(state.camera, view.dt);
    }

    // generate the base model, incorporating the gpu-side model if available
    state.layout = genGptModelLayout(state.shape, state.gptGpuModel);

    genModelViewMatrices(state);

    let queryRes = beginQueryAndGetPrevMs(state.render.queryManager, 'render');
    if (isNotNil(queryRes)) {
        state.render.lastGpuMs = queryRes;
    }

    // will modify layout; view; render a few things.
    runWalkthrough(state, view);

    // these will get modified by the walkthrough (stored where?)
    drawAllArrows(state.render, state.layout);

    drawModelCard(state);
    drawTokens(state.render, state.layout, state.display);

    runMouseHitTesting(state);
    state.render.sharedRender.activePhase = RenderPhase.Opaque;
    drawBlockLabels(state.render, state.layout);

    let lineNo = 1;
    let tw = state.render.canvasEl.width;
    for (let line of state.display.lines) {
        let opts: IFontOpts = { color: new Vec4(), size: 14 };
        let w = measureText(state.render.overlayFontBuf, line, opts);
        drawText(state.render.overlayFontBuf, line, tw - w - 4, lineNo * opts.size * 1.3 + 4, opts)
        lineNo++;
    }

    // render everything; i.e. here's where we actually do gl draw calls
    // up until now, we've just been putting data in cpu-side buffers
    renderModel(state);

    endQuery(state.render.queryManager, 'render');
    state.render.gl.flush();

    state.render.lastJsMs = performance.now() - timer0;
}
