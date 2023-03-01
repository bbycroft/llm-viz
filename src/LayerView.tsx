'use client';

import React, { useEffect, useState } from 'react';
import { IDataAndModel, IModelShape, IModelState, initModel, runModel, setModelInputData } from './GptModel';
import s from './LayerView.module.css';
import { initRender, IRenderState, IRenderView, renderModel } from './render/modelRender';
import { clamp, useGlobalDrag } from './utils/data';
import { IFontAtlas, resetFontAtlas, setupFontAtlas } from './utils/font';
import { Random } from './utils/random';
import { ITensorSet, TensorF32 } from './utils/tensor';
import { Vec3 } from './utils/vector';

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
    let [camAngle, setCamAngle] = useState(new Vec3(290, 20, 30)); // degrees about z axis, and above the x-y plane; zoom
    let [camTarget, setCamTarget] = useState(new Vec3(0, 0, -500)); // where the camera is looking
    let [canvasRender, setCanvasRender] = useState<CanvasRender | null>(null);

    let [dragStart, setDragStart] = useGlobalDrag<{ camAngle: Vec3, camTarget: Vec3 }>(function handleMove(ev, ds) {
        let dx = ev.clientX - ds.clientX;
        let dy = ev.clientY - ds.clientY;

        if (ev.shiftKey || ds.button === 1) {
            let target = ds.data.camTarget.clone();
            target.z = target.z + dy * 0.1 * camAngle.z; // @TODO: clamp to the bounding box of the model
            setCamTarget(target);

        } else {
            let degPerPixel = 0.5;

            let initial = ds.data.camAngle;
            let x = initial.x - dx * degPerPixel;
            let y = clamp(initial.y + dy * degPerPixel, -87, 87);

            setCamAngle(new Vec3(x, y, camAngle.z));
        }
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev, { camAngle, camTarget });
    }

    function handleWheel(ev: React.WheelEvent) {
        let zoom = clamp(camAngle.z * Math.pow(1.0012, ev.deltaY), 0.01, 10000);
        setCamAngle(new Vec3(camAngle.x, camAngle.y, zoom));
    }

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
        if (canvasEl) {
            let canvasRenderLocal = new CanvasRender(canvasEl, null!);
            let resizeObserver = new ResizeObserver(() => {
                canvasRenderLocal.canvasSizeDirty = true;
                canvasRenderLocal.markDirty();
            });
            setCanvasRender(canvasRenderLocal);
            resizeObserver.observe(canvasEl);
            return () => {
                canvasRenderLocal.destroy();
                resizeObserver.disconnect();
            };
        } else {
            setCanvasRender(null);
        }
    }, [canvasEl]);

    useEffect(() => {
        canvasRender?.setData({ dataAndModel, camAngle, camTarget });
    }, [canvasRender, dataAndModel, camAngle, camTarget]);

    return <div className={s.view}>
        <div className={s.sidebar}>This is the layer view</div>
        <div className={s.canvasWrap}>
            <canvas
                className={s.canvas}
                ref={setCanvasEl}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
                style={{ cursor: dragStart ? 'grabbing' : 'grab' }}
            />
        </div>
    </div>;
}

interface ICanvasData {
    dataAndModel: IDataAndModel | null;
    camAngle: Vec3;
    camTarget: Vec3;
}

class CanvasRender {
    renderState: IRenderState;
    modelState: IModelState | null = null;
    fontAtlas: IFontAtlas | null = null;
    random: Random;
    stopped = false;
    canvasSizeDirty = true;

    constructor(private canvasEl: HTMLCanvasElement, private canvasData: ICanvasData) {
        this.renderState = initRender(canvasEl);
        this.random = new Random(4);
        setupFontAtlas(this.renderState.shaderManager).then((fa) => {
            this.fontAtlas = fa;
            this.markDirty();
        });
    }

    modelInitRun = false;

    destroy() {
        this.stopped = true;
    }

    setData(data: ICanvasData) {
        this.canvasData = data;

        if (data.dataAndModel && !this.modelInitRun) {
            this.modelInitRun = true;
            this.modelState = initModel(this.renderState, data.dataAndModel, 1);
            setModelInputData(this.renderState, this.modelState, this.random);
            runModel(this.renderState, this.modelState);
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
            canvasEl.width = bcr.width;
            canvasEl.height = bcr.height;
            this.canvasSizeDirty = false;
        }

        let shape: IModelShape = {
            B: 1,
            T: 11,
            C: 48,
            nHeads: 3,
            A: 48 / 3,
            nBlocks: 3,
            vocabSize: 3,
            // vocabSize: 128,
        };

        // let shapeGpt1: IModelShape = {
        //     B: 1,
        //     nBlocks: 12,
        //     nHeads: 12,
        //     C: 768,
        //     A: 768 / 12,
        //     vocabSize: 50257,
        //     T: 1024,
        // };

        let view: IRenderView = {
            ...this.canvasData,
            canvasEl: canvasEl!,
            fontAtlas: this.fontAtlas,
            time,
            markDirty: this.markDirty,
        }

        renderModel(view, this.renderState, shape, this.modelState || undefined);

        this.fontAtlas && resetFontAtlas(this.fontAtlas);
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
