'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { IDataAndModel, IModelState, initModel, runModel, setModelInputData } from './GptModel';
import s from './LayerView.module.scss';
import { IRenderState, IRenderView } from './render/modelRender';
import { clamp, useGlobalDrag } from './utils/data';
import { fetchFontAtlasData, IFontAtlasData } from './render/fontRender';
import { Random } from './utils/random';
import { ITensorSet, TensorF32 } from './utils/tensor';
import { Vec3 } from './utils/vector';
import { ProgramStateContext, useProgramState, WalkthroughSidebar } from './Sidebar';
import { initProgramState, IProgramState, runProgram } from './Program';

async function fetchTensorData(url: string): Promise<ITensorSet> {
    let resp = await fetch(url);
    let data = await resp.json();
    for (let k in data) {
        if (data[k].shape) {
            data[k] = TensorF32.fromJson(data[k]);
        }
    }
    return data;
}

export function LayerView() {
    let [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [dataAndModel, setDataAndModel] = useState<IDataAndModel | null>(null);
    let [canvasRender, setCanvasRender] = useState<CanvasRender | null>(null);
    let [fontAtlasData, setFontAtlasData] = useState<IFontAtlasData | null>(null);

    useEffect(() => {
        function handleKeyDown(ev: KeyboardEvent) {
            if (!canvasRender?.progState) {
                return;
            }
            let walkthrough = canvasRender.progState.walkthrough;
            if (ev.key === ' ') {
                walkthrough.running = !walkthrough.running;
                walkthrough.lastBreakTime = walkthrough.time;
                canvasRender.markDirty();
            }
            if (ev.key === 'Backspace' || ev.key === 'Delete') {
                walkthrough.running = false;
                walkthrough.time = 0;
                walkthrough.lastBreakTime = 0;
                canvasRender.markDirty();
            }
            if (ev.key === 'f' || ev.key === 'F') {
                walkthrough.running = false;
                walkthrough.time = walkthrough.phaseLength;
                canvasRender.markDirty();
            }

            if (ev.key === ' ') {
                ev.preventDefault();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [canvasRender]);

    useEffect(() => {
        let stale = false;
        async function getData() {
            let dataP = fetchTensorData('gpt-nano-sort-t0-partials.json');
            let modelP = fetchTensorData('gpt-nano-sort-model.json');
            let [data, model] = await Promise.all([dataP, modelP]);
            if (stale) return;
            setDataAndModel({ data, model });
        }

        getData();

        return () => { stale = true; };
    }, []);

    useEffect(() => {
        let stale = false;
        async function getData() {
            let data = await fetchFontAtlasData();
            if (stale) return;
            setFontAtlasData(data);
        }

        getData();

        return () => { stale = true; };
    }, []);

    useEffect(() => {
        if (canvasEl && fontAtlasData) {
            let canvasRenderLocal = new CanvasRender(canvasEl, null!, fontAtlasData);
            let resizeObserver = new ResizeObserver(() => {
                canvasRenderLocal.canvasSizeDirty = true;
                canvasRenderLocal.markDirty();
            });
            let handleWheel = (ev: WheelEvent) => ev.preventDefault();
            setCanvasRender(canvasRenderLocal);
            resizeObserver.observe(canvasEl);
            canvasEl.addEventListener('wheel', handleWheel, { passive: false });
            return () => {
                canvasEl!.removeEventListener('wheel', handleWheel);
                canvasRenderLocal.destroy();
                resizeObserver.disconnect();
            };
        } else {
            setCanvasRender(null);
        }
    }, [canvasEl, fontAtlasData]);

    useEffect(() => {
        canvasRender?.setData({ dataAndModel });
    }, [canvasRender, dataAndModel]);

    console.log('hoverTarget', canvasRender?.progState?.display?.hoverTarget);

    return <div className={s.view}>
        <div className={s.sidebar}>
            {canvasRender && <ProgramStateContext.Provider value={canvasRender.progState}>
                <WalkthroughSidebar />
            </ProgramStateContext.Provider>}
        </div>
        <div className={s.canvasWrap}>
            <canvas
                className={s.canvas}
                ref={setCanvasEl}
            />
            {/* <div className={s.cursorFollow} style={{ top: pointPos.y, left: pointPos.x }} /> */}
            {canvasRender && <ProgramStateContext.Provider value={canvasRender.progState}>
                <CanvasEventSurface />
            </ProgramStateContext.Provider>}
        </div>
    </div>;
}

export const CanvasEventSurface: React.FC = () => {
    let progState = useProgramState();

    let updateRenderState = useCallback((fn: (ps: IProgramState) => void) => {
        fn(progState);
        progState.markDirty();
    }, [progState]);

    let [dragStart, setDragStart] = useGlobalDrag<{ camAngle: Vec3, camTarget: Vec3 }>(function handleMove(ev, ds) {
        if (!progState) {
            return;
        }

        let dx = ev.clientX - ds.clientX;
        let dy = ev.clientY - ds.clientY;
        let camAngle = ds.data.camAngle;

        if (!ds.shiftKey && !(ds.button === 1 || ds.button === 2)) {
            let target = ds.data.camTarget.clone();
            target.z = target.z + dy * 0.1 * camAngle.z; // @TODO: clamp to the bounding box of the model
            let sideMul = Math.sin(camAngle.x * Math.PI / 180) > 0 ? 1 : -1;
            target.x = target.x + sideMul * dx * 0.1 * camAngle.z;

            updateRenderState(ps => {
                ps.camera.center = target;
            });

        } else {
            let degPerPixel = 0.5;

            let initial = ds.data.camAngle;
            let x = initial.x - dx * degPerPixel;
            let y = clamp(initial.y + dy * degPerPixel, -87, 87);

            updateRenderState(ps => {
                ps.camera.angle = new Vec3(x, y, camAngle.z);
            });
        }

        ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        if (progState) {
            setDragStart(ev, { camAngle: progState.camera.angle, camTarget: progState.camera.center });
        }
    }

    function handleMouseMove(ev: React.MouseEvent) {
        if (progState) {
            let canvasBcr = progState.render.canvasEl.getBoundingClientRect();
            let mousePos = new Vec3(ev.clientX - canvasBcr.left, ev.clientY - canvasBcr.top, 0);
            updateRenderState(ps => {
                ps.mouse.mousePos = mousePos;
            });
        }
    }

    function handleWheel(ev: React.WheelEvent) {
        if (progState) {
            let camAngle = progState.camera.angle;
            let zoom = clamp(camAngle.z * Math.pow(1.0013, ev.deltaY), 0.01, 10000);
            updateRenderState(rs => {
                rs.camera.angle = new Vec3(camAngle.x, camAngle.y, zoom);
            });
        }
        ev.stopPropagation();
    }

    return <div
        className={s.canvasEventSurface}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onContextMenu={ev => ev.preventDefault()}
        style={{ cursor: dragStart ? 'grabbing' : progState.display.hoverTarget ? 'crosshair' : 'grab' }}
    
    />;
}

interface ICanvasData {
    dataAndModel: IDataAndModel | null;
}

class CanvasRender {
    renderState: IRenderState;
    progState: IProgramState;
    modelState: IModelState | null = null;
    random: Random;
    stopped = false;
    canvasSizeDirty = true;

    constructor(canvasEl: HTMLCanvasElement, private canvasData: ICanvasData, fontAtlasData: IFontAtlasData) {
        this.progState = initProgramState(canvasEl, fontAtlasData);
        this.progState.markDirty = this.markDirty;
        this.progState.walkthrough.markDirty = this.markDirty;
        this.renderState = this.progState.render;
        this.random = new Random(4);
    }

    destroy() {
        this.stopped = true;
    }

    setData(data: ICanvasData) {
        this.canvasData = data;

        if (data.dataAndModel && !this.progState.gptGpuModel) {
            this.progState.gptGpuModel = initModel(this.renderState, data.dataAndModel, 1);
            setModelInputData(this.renderState, this.progState.gptGpuModel, this.random);
            runModel(this.renderState, this.progState.gptGpuModel);
        }
        this.markDirty();
    }

    prevTime: number = performance.now();
    rafHandle: number = 0;
    isDirty = false;
    markDirty = () => {
        if (!this.canvasData || this.stopped) {
            return;
        }

        this.isDirty = true;
        if (!this.rafHandle) {
            this.prevTime = performance.now();
            this.rafHandle = requestAnimationFrame(this.loop);
        }
    }

    loop = (time: number) => {
        if (!this.isDirty || this.stopped) {
            this.rafHandle = 0;
            return;
        }
        this.isDirty = false;
        let dt = time - this.prevTime;
        this.prevTime = time;
        if (dt < 8) dt = 16;

        this.render(time, dt);

        this.rafHandle = requestAnimationFrame(this.loop);
    }

    render(time: number, dt: number) {
        let canvasEl = this.renderState.canvasEl;

        if (this.canvasSizeDirty) {
            let bcr = canvasEl.getBoundingClientRect();
            let scale = 1.0;
            canvasEl.width = bcr.width * scale;
            canvasEl.height = bcr.height * scale;
            this.canvasSizeDirty = false;
        }

        let view: IRenderView = { time, dt, markDirty: this.markDirty };
        runProgram(view, this.progState);
        this.progState.htmlSubs.notify();

    }

}

/*

For interactivity & exploration:

- Have various components swapped out or added to
  - Higher res option
  - Rotated to a camera-aligned view with example numbers etc
  - Active-thread trails
  - Symbols (#s, ops, mini-graphs) to show the operation of a layer

- What's the priority here?
  - trails/arrows showing the flow of data
  - symbols showing the operation of a layer/block
  - improved camera controls
  - thread trails
  - Splitting up a block into columns
  - dimension annotations (B, C, T) |------ C (48) ------|
  - input/output rendering (text to idx mapping; softmax-idxs to text mapping)
  - highlight of active blocks & threads
    - fast & slow
    - blocks below active show empty or faded
    - highlight of active threads
    - so it looks effective in large models
  - actually process the model in a sequence of rounds
*/
