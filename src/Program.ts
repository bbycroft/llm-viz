import { cameraMoveToDesired, ICamera } from "./Camera";
import { drawAllArrows } from "./components/Arrow";
import { drawBlockLabels } from "./components/BlockLabels";
import { drawModelCard } from "./components/ModelCard";
import { IGpuGptModel, IModelShape } from "./GptModel";
import { genGptModelLayout, IGptModelLayout } from "./GptModelLayout";
import { IFontAtlasData } from "./render/fontRender";
import { initRender, IRenderState, IRenderView, renderModel, resetRenderBuffers } from "./render/modelRender";
import { beginQueryAndGetPrevMs, endQuery } from "./render/queryManager";
import { drawTokens } from "./components/Tokens";
import { SavedState } from "./SavedState";
import { isNotNil, Subscriptions } from "./utils/data";
import { Vec3 } from "./utils/vector";
import { initWalkthrough, runWalkthrough } from "./walkthrough/Walkthrough";
import { IColorMix } from "./Annotations";

export interface IProgramState {
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

export interface IDisplayState {
    tokenColors: IColorMix | null;
    tokenIdxColors: IColorMix | null;
    tokenIdxModelOpacity?: number[];
}

export function initProgramState(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData): IProgramState {

    let render = initRender(canvasEl, fontAtlasData);
    let walkthrough = initWalkthrough();

    let prevState = SavedState.state;
    let camera: ICamera = {
        angle: prevState?.camera.angle ?? new Vec3(296, 16, 13.5),
        center: prevState?.camera.center ?? new Vec3(-8.4, 0, -481.5),
        transition: {},
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
        display: {
            tokenColors: null,
            tokenIdxColors: null,
        },
    };
}

export function runProgram(view: IRenderView, state: IProgramState) {
    let timer0 = performance.now();

    resetRenderBuffers(state.render);

    if (state.walkthrough.running) {
        cameraMoveToDesired(state.camera, view.dt);
    }

    // generate the base model, incorporating the gpu-side model if available
    state.layout = genGptModelLayout(state.shape, state.gptGpuModel);

    let queryRes = beginQueryAndGetPrevMs(state.render.queryManager, 'render');
    if (isNotNil(queryRes)) {
        state.render.lastGpuMs = queryRes;
    }

    // will modify layout; view; render a few things.
    runWalkthrough(state, view);

    // these will get modified by the walkthrough (stored where?)
    drawAllArrows(state.render, state.layout);
    drawBlockLabels(state.render, state.layout);

    drawModelCard(state);
    drawTokens(state.render, state.layout, state.display);

    // render everything; i.e. here's where we actually do gl draw calls
    // up until now, we've just been putting data in cpu-side buffers
    renderModel(state);

    endQuery(state.render.queryManager, 'render');
    state.render.gl.flush();

    state.render.lastJsMs = performance.now() - timer0;
}
