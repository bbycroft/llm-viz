'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IDataAndModel, IModelShape, IModelState, initModel, runModel, setModelInputData } from './GptModel';
import s from './LayerView.module.css';
import { initRender, IRenderState, IRenderView, renderModel } from './modelRender';
import { clamp, useGlobalDrag } from './utils/data';
import { IFontAtlas, setupFontAtlas } from './utils/font';
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
    let [camTarget, setCamTarget] = useState(new Vec3(0, 0, 1000)); // where the camera is looking
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
                canvasRenderLocal.markDirty();
            });
            setCanvasRender(canvasRenderLocal);
            resizeObserver.observe(canvasEl);
            return () => {
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

    constructor(private canvasEl: HTMLCanvasElement, private canvasData: ICanvasData) {
        this.renderState = initRender(canvasEl);
        this.random = new Random(4);
        setupFontAtlas(this.renderState.shaderManager).then((fa) => {
            this.fontAtlas = fa;
            this.markDirty();
        });
    }

    modelInitRun = false;

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
        if (!this.canvasData) {
            return;
        }

        this.isDirty = true;
        if (!this.rafHandle) {
            this.prevTime = performance.now();
            this.rafHandle = requestAnimationFrame(this.loop);
        }
    }

    loop = (time: number) => {
        if (!this.isDirty) {
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

        let bcr = canvasEl.getBoundingClientRect();
        canvasEl.width = bcr.width;
        canvasEl.height = bcr.height;

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
        }

        renderModel(view, this.renderState, shape, this.modelState || undefined);
    }

}

/*
We want to render the whole layer!

- Classic problem of managing a whole bunch of gl stuff while keeping it succint.
- The entire structure & layout will be generated in code, so want a good structure object
- Then we walk through the layers, computing offsets based on B, T, C etc
  - Just plain linear code please!
- Then we have a laid out structure to render
  - Don't bother batching draw calls or anything
  - Each component then has some source (an existing real buffer, or proc-gen)
  - Also have different approaches to rendering a layer:
    - just a cube with box-ey textures for the weights
    - cube with boxes representing the weights (with vert-shader-set heights)
- Then have various components swapped out or added to
  - Higher res option
  - Rotated to a camera-aligned view with example numbers etc
  - Active-thread trails
  - Symbols (#s, ops, mini-graphs) to show the operation of a layer

Let's start minimal:
- Need a camera ofc, (copy matrices from other projects)
- We'll layout the token embedding & positional embedding objects below the input token arrays
*/
