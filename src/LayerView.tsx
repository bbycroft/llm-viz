'use client';

import React, { useEffect, useState } from 'react';
import s from './LayerView.module.css';
import { IDataAndModel, initialize, IProgramState, mainLoop } from './mainLoop';
import { runLayer } from './SimpleLayer';
import { ITensorSet, TensorF32 } from './utils/tensor';


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
        let progData: IProgramState;
        let prevTime: DOMHighResTimeStamp;

        canvasEl && dataAndModel && requestAnimationFrame(init);

        function init(time: number) {
            prevTime = time;
            progData = initialize(canvasEl!, dataAndModel!);
            requestAnimationFrame(loop);
        }

        function loop(time: number) {
            let dt = time - prevTime;
            prevTime = time;
            mainLoop(progData!, time, dt);
            // requestAnimationFrame(loop);
        }

    }, [canvasEl, dataAndModel]);

    return <div className={s.view}>
        <div className={s.sidebar}>This is the layer view</div>
        <canvas className={s.canvas} ref={setCanvasEl} />
    </div>;
}
