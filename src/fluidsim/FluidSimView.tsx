'use client';

import React, { useEffect } from "react";
import { useScreenLayout } from "../utils/layout";
import { ICanvasTargetDef, IFluidSimState, initFluidSimState, stepFluidSim } from "./FluidSimMain";
import s from "./FluidSimView.module.scss";

export const FluidSimView: React.FC = () => {
    let [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
    let [manager, setManager] = React.useState<FluidSimManager | null>(null);

    let layout = useScreenLayout();
    useEffect(() => {
        function handleKeyDown(ev: KeyboardEvent) {
            if (!manager) {
                return;
            }
            let key = ev.key.toLowerCase();
            if (ev.key === ' ') {
                handleStepClicked();
            }
            if (ev.key === 'Backspace') {
                handleResetClicked();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [manager]);

    useEffect(() => {
        if (canvasEl) {
            console.log('canvasEl created; creating FluidSimManager');
            let manager = new FluidSimManager(canvasEl);
            setManager(manager);
            manager.markDirty();

            return () => {
                manager.looper.stopped = true;
                setManager(null);
            };
        }
    }, [canvasEl]);

    manager?.markDirty();

    function handleResetClicked() {
        if (!manager) {
            return;
        }
        manager.fluidSimState = initFluidSimState(manager.canvas);
        manager.markDirty();
    }

    function handleStepClicked() {
        if (!manager) {
            return;
        }
        stepFluidSim(manager.fluidSimState.sim, 500);
        manager.markDirty();
    }

    return <div className={s.page}>
        FluidSimView
        {manager && <>
            <button onClick={handleResetClicked}>Reset</button>
            <button onClick={handleStepClicked}>Step</button>

        </>}
        <CanvasView setCanvasEl={setCanvasEl} />
        {/* <div className={s.canvasWrap}>
            <canvas ref={setCanvasEl} className={s.canvas} />
        </div> */}
    </div>;
};

const CanvasView: React.FC<{
    setCanvasEl: (el: HTMLCanvasElement | null) => void;
}> = ({ setCanvasEl }) => {
    return <div className={s.canvasWrap}>
        <canvas ref={setCanvasEl} className={s.canvas} />
    </div>;
}


class FluidSimManager {
    looper: Looper;
    markDirty: () => void;
    fluidSimState: IFluidSimState;

    constructor(public canvas: HTMLCanvasElement) {
        this.looper = new Looper(this.render);
        this.markDirty = this.looper.markDirty;
        this.fluidSimState = initFluidSimState(canvas);
    }

    render = (time: number, dt: number) => {
        updateFluidSim(this.fluidSimState, dt);
    }
}

class Looper {
    stopped = false;
    prevTime: number = performance.now();
    rafHandle: number = 0;
    isDirty = false;

    constructor(public render: (time: number, dt: number) => void) {
    }

    markDirty = () => {
        if (this.stopped) {
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
        let wasDirty = this.isDirty;

        this.isDirty = false;

        let dt = time - this.prevTime;
        this.prevTime = time;
        if (dt < 8) dt = 16; // sometimes we get -ve dt due to perf.now() vs requestAnimationFrame() timing, so put to 16ms in that case

        if (wasDirty || this.isDirty) {
            this.render(time, dt);
        }

        this.rafHandle = requestAnimationFrame(this.loop);
    }
}

function drawToCanvas(state: IFluidSimState, canvas: HTMLCanvasElement) {
    let ctx = canvas.getContext("2d")!;
    let cellData = new Uint8ClampedArray(state.sim.width * state.sim.height * 4);

    let nPx = state.sim.width * state.sim.height;
    let tempMin = 1000000;
    let tempMax = -1000000;
    for (let i = 0; i < nPx; i++) {
        let temp = state.sim.cells[i * 4 + 0];
        let density = state.sim.cells[i * 4 + 1];
        let vX = state.sim.cells[i * 4 + 2];
        let vY = state.sim.cells[i * 4 + 3];
        cellData[i * 4 + 0] = floatToByte(vX * 40);
        cellData[i * 4 + 1] = floatToByte(vY * 40); //density * 255;
        cellData[i * 4 + 3] = 255;
        tempMax = Math.max(tempMax, temp);
        tempMin = Math.min(tempMin, temp);
    }

    let imageData = new ImageData(cellData, state.sim.width, state.sim.height);
    ctx.putImageData(imageData, 0, 0);
}

function drawFieldToCanvas(state: IFluidSimState, canvasDef: ICanvasTargetDef, arr: Float32Array) {
    if (!canvasDef?.canvas) {
        return;
    }
    let ctx = canvasDef.canvas.getContext("2d")!;
    let cellData = new Uint8ClampedArray(state.sim.width * state.sim.height * 4);
    let nPx = state.sim.width * state.sim.height;
    for (let i = 0; i < nPx; i++) {
        cellData[i * 4 + 0] = floatToByte(arr[i] * 40);
        cellData[i * 4 + 3] = 255;
    }
    let imageData = new ImageData(cellData, state.sim.width, state.sim.height);
    ctx.putImageData(imageData, 0, 0);
}

function updateFluidSim(state: IFluidSimState, dt: number) {
    state.canvas.width = state.sim.width;
    state.canvas.height = state.sim.height;

    let ctx = state.canvas.getContext("2d")!;

    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    drawToCanvas(state, state.canvas);
    drawFieldToCanvas(state, state.targetDefs[0], state.sim.divergence0);
    drawFieldToCanvas(state, state.targetDefs[1], state.sim.divergence1);
    // stepFluidSim(state.sim, dt);
}

function floatToByte(f: number) {
    // sigmoid function, assuming a common range of -1 to 1

    let x = f;
    let y = 1 / (1 + Math.exp(-x));
    return y * 255;
}