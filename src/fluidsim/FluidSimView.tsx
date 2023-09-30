'use client';

import React, { useEffect, useLayoutEffect, useState } from "react";
import { useScreenLayout } from "../utils/layout";
import { ICanvasTargetDef, IFluidSimState, initFluidSimState, stepFluidSim } from "./FluidSimMain";
import s from "./FluidSimView.module.scss";
import { Subscriptions, useSubscriptions } from "../utils/hooks";

let dummySubs = new Subscriptions();

export const FluidSimView: React.FC = () => {
    let [manager, setManager] = useState<FluidSimManager | null>(null);

    useSubscriptions(manager?.subscriptions ?? dummySubs);

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
    });

    useEffect(() => {
        console.log('canvasEl created; creating FluidSimManager');
        let manager = new FluidSimManager();
        setManager(manager);
        manager.markDirty();

        return () => {
            manager.looper.stopped = true;
            setManager(null);
        };
    }, []);

    manager?.markDirty();

    function handleResetClicked() {
        if (!manager) {
            return;
        }
        manager.fluidSimState = initFluidSimState();
        manager.fluidSimState.sim.numPressureIterations = 0;
        stepFluidSim(manager.fluidSimState.sim, 20);
        manager.markDirty();
    }

    function handleStepClicked() {
        if (!manager) {
            return;
        }
        let prevNumPressureIterations = manager.fluidSimState.sim.numPressureIterations;
        // manager.fluidSimState = initFluidSimState();
        // manager.fluidSimState.sim.numPressureIterations = prevNumPressureIterations + 10;
        stepFluidSim(manager.fluidSimState.sim, 20);
        manager.markDirty();
    }

    function handlePlayClicked() {
        if (!manager) {
            return;
        }
        manager.fluidSimState.running = !manager.fluidSimState.running;
        manager.markDirty();
    }

    let sim = manager?.fluidSimState.sim;

    return <div className={s.page}>
        FluidSimView
        {manager && sim && <>
            <button onClick={handleResetClicked}>Reset</button>
            <button onClick={handleStepClicked}>Step</button>
            <button onClick={handlePlayClicked}>Play/Pause</button>

            <div>Num Pressure Iterations: {sim.numPressureIterations}</div>
            <div className={'flex flex-row'}>
                <div className={'flex flex-col'}>
                    <CanvasView manager={manager} sourceType={SourceType.VelocityVector} sourceArray={sim.cells} name={"Main"} />
                    <CanvasView manager={manager} sourceType={SourceType.Scalar} sourceArray={sim.pressure0} name={"Pressure"} />
                </div>
                <div className={'flex flex-col'}>
                    <CanvasView manager={manager} sourceType={SourceType.Scalar} sourceArray={sim.divergence0} name={"Divergence Initial"} />
                    <CanvasView manager={manager} sourceType={SourceType.Scalar} sourceArray={sim.divergence1} name={"Divergence Validation"} />
                </div>
            </div>
        </>}
    </div>;
};

interface ICanvasRenderOpts {
    sourceType: SourceType;
    sourceArray: Float32Array;
}

enum SourceType {
    VelocityVector,
    Temp,
    Density,
    Scalar,
}

const CanvasView: React.FC<{
    manager: FluidSimManager;
    name: string,
} & ICanvasRenderOpts> = ({ manager, name, ...renderOpts }) => {
    let [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
    useSubscriptions(manager.subscriptions);

    useLayoutEffect(() => {
        if (canvasEl) {
            let parentBcr = canvasEl.parentElement!.getBoundingClientRect();
            let pr = window.devicePixelRatio;
            canvasEl.width = parentBcr.width * pr;
            canvasEl.height = parentBcr.height * pr;
            renderFluidSimTarget(manager.fluidSimState, canvasEl, renderOpts);
        }
    });

    return <div className="flex flex-col m-2">
        <div className="text-center">{name}</div>
        <div className="aspect-square relative overflow-hidden flex-none w-[256px] h-[256px]">
            <canvas ref={setCanvasEl} className={s.canvas} />
        </div>
    </div>;
}


class FluidSimManager {
    looper: Looper;
    markDirty: () => void;
    fluidSimState: IFluidSimState;
    subscriptions = new Subscriptions();

    constructor() {
        this.looper = new Looper(this.render);
        this.markDirty = this.looper.markDirty;
        this.fluidSimState = initFluidSimState();
    }

    render = (time: number, dt: number) => {
        if (this.fluidSimState.running) {
            stepFluidSim(this.fluidSimState.sim, 10);
        }

        updateFluidSim(this.fluidSimState, dt);
        this.subscriptions.subs.forEach(s => s());
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

function drawToCanvas(state: IFluidSimState, canvas: HTMLCanvasElement, sourceArr: Float32Array) {
    let ctx = canvas.getContext("2d")!;
    let w = state.sim.width;
    let h = state.sim.height;
    let cellData = new Uint8ClampedArray(w * h * 4);

    let nPx = state.sim.width * state.sim.height;
    for (let i = 0; i < nPx; i++) {
        let temp = sourceArr[i * 4 + 0];
        let vX = sourceArr[i * 4 + 2];
        let vY = sourceArr[i * 4 + 3];
        cellData[i * 4 + 0] = floatToByte(temp);
        // cellData[i * 4 + 1] = floatToByte(vY * 40); //density * 255;
        cellData[i * 4 + 3] = 255;
    }

    {
        let localCanvas = state.canvasTemp;
        localCanvas.width = w;
        localCanvas.height = h;
        let localCtx = localCanvas.getContext("2d")!;
        let imageData = new ImageData(cellData, w, h);
        localCtx.putImageData(imageData, 0, 0);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.canvasTemp, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(canvas.width / w, canvas.height / h);
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
            // draw arrow for velocity, with length proportional to velocity amplitude
            let vx = sourceArr[(y * w + x) * 4 + 2];
            let vy = sourceArr[(y * w + x) * 4 + 3];
            let vLen = Math.sqrt(vx * vx + vy * vy);
            let drawLen = floatToByte(vLen * 40) / 255 * 3;

            let x0 = x + 0.5;
            let y0 = y + 0.5;

            let x2 = x0 + vx * drawLen / vLen;
            let y2 = y0 + vy * drawLen / vLen;

            // two arrowhead lines, each at 45 degrees to the line
            let dx = x2 - x0;
            let dy = y2 - y0;

            let x3 = x2 - dx * 0.2 + dy * 0.2;
            let y3 = y2 - dy * 0.2 - dx * 0.2;

            let x4 = x2 - dx * 0.2 - dy * 0.2;
            let y4 = y2 - dy * 0.2 + dx * 0.2;

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.moveTo(x2, y2);
            ctx.lineTo(x4, y4);
            ctx.strokeStyle = "white";
            ctx.lineWidth = w / canvas.width;
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawFieldToCanvas(state: IFluidSimState, canvas: HTMLCanvasElement, arr: Float32Array) {
    let ctx = canvas.getContext("2d")!;
    let w = state.sim.width;
    let h = state.sim.height;
    let cellData = new Uint8ClampedArray(w * h * 4);
    let nPx = w * h;
    for (let i = 0; i < nPx; i++) {
        cellData[i * 4 + 0] = floatToByte(arr[i] * 40);
        cellData[i * 4 + 3] = 255;
    }

    {
        let localCanvas = state.canvasTemp;
        localCanvas.width = w;
        localCanvas.height = h;
        let localCtx = localCanvas.getContext("2d")!;
        let imageData = new ImageData(cellData, w, h);
        localCtx.putImageData(imageData, 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(state.canvasTemp, 0, 0, canvas.width, canvas.height);
    }
}

function renderFluidSimTarget(state: IFluidSimState, canvas: HTMLCanvasElement, opts: ICanvasRenderOpts) {

    // canvas.width = state.sim.width;
    // canvas.height = state.sim.height;

    let ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (opts.sourceType === SourceType.VelocityVector) {
        drawToCanvas(state, canvas, opts.sourceArray);
    }
    if (opts.sourceType === SourceType.Scalar) {
        drawFieldToCanvas(state, canvas, opts.sourceArray);
    }

    // drawFieldToCanvas(state, state.targetDefs[0], state.sim.divergence0);
    // drawFieldToCanvas(state, state.targetDefs[1], state.sim.divergence1);
}

function updateFluidSim(state: IFluidSimState, dt: number) {
    /*
    state.canvas.width = state.sim.width;
    state.canvas.height = state.sim.height;

    let ctx = state.canvas.getContext("2d")!;

    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    drawToCanvas(state, state.canvas);
    drawFieldToCanvas(state, state.targetDefs[0], state.sim.divergence0);
    drawFieldToCanvas(state, state.targetDefs[1], state.sim.divergence1);
    */
    // stepFluidSim(state.sim, dt);
}

function floatToByte(f: number) {
    // sigmoid function, assuming a common range of -1 to 1

    let x = f;
    let y = 1 / (1 + Math.exp(-x));
    return y * 255;
}
