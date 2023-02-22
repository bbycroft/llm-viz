'use client';

import React, { useEffect, useState } from 'react';
import s from './LayerView.module.css';
import { initialize, IProgramState, mainLoop } from './mainLoop';
import { runLayer } from './SimpleLayer';

export function LayerView() {
    let [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

    useEffect(() => {
        // runLayer();
    }, []);

    useEffect(() => {
        let progData: IProgramState;
        let prevTime: DOMHighResTimeStamp;

        canvasEl && requestAnimationFrame(init);

        function init(time: number) {
            prevTime = time;
            progData = initialize(canvasEl!);
            requestAnimationFrame(loop);
        }

        function loop(time: number) {
            let dt = time - prevTime;
            prevTime = time;
            mainLoop(progData!, time, dt);
            // requestAnimationFrame(loop);
        }

    }, [canvasEl]);

    return <div className={s.view}>
        <div className={s.sidebar}>This is the layer view</div>
        <canvas className={s.canvas} ref={setCanvasEl} />
    </div>;
}
