'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { testGzipFile } from "./DeflateDecoder";
import { IDeflateData } from "./DeflateRenderModel";
import { renderDeflate } from "./DeflateRender";
import { KeyboardOrder, isArrowKeyWithModifiers, useCreateGlobalKeyboardDocumentListener, useGlobalKeyboard } from "../utils/keyboard";
import { clamp, isNil, isNotNil } from "../utils/data";
import { useRequestAnimationFrame } from "../utils/hooks";
import { lerp } from "../utils/math";

export const CodecMain: React.FC<{}> = ({ }) => {
    let [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [block, setBlock] = useState<IDeflateData | null>(null);
    let [symPos, setSymPos] = useState<number>(43);
    let [targetSymPos, setTargetSymPos] = useState<number | null>(null);
    useCreateGlobalKeyboardDocumentListener();

    useGlobalKeyboard(KeyboardOrder.MainPage, (ev) => {
        let newSymPos = Math.round(symPos);
        if (isArrowKeyWithModifiers(ev, 'left')) {
            newSymPos -= 1;
        } else if (isArrowKeyWithModifiers(ev, 'right')) {
            newSymPos += 1;
        }

        newSymPos = clamp(newSymPos, 0, 255);

        setTargetSymPos(newSymPos);
        // if (newSymPos !== symPos) {
        //     setSymPos(newSymPos);
        // }
    });

    useEffect(() => {
        let firstBlock = testGzipFile();
        firstBlock && setBlock(firstBlock);
    }, []);

    useLayoutEffect(() => {
        function renderCanvas() {
            if (!canvasEl) {
                return;
            }

            let ctx = canvasEl.getContext("2d");

            if (!ctx) {
                return;
            }

            let bcr = canvasEl.getBoundingClientRect();

            let w = Math.round(bcr.width);
            let h = Math.round(bcr.height);
            let wInternal = Math.round(bcr.width * window.devicePixelRatio);
            let hInternal = Math.round(bcr.height * window.devicePixelRatio);

            if (canvasEl.width !== wInternal || canvasEl.height !== hInternal) {
                canvasEl.width = wInternal;
                canvasEl.height = hInternal;
            }

            ctx.resetTransform();
            ctx.clearRect(0, 0, wInternal, hInternal);
            // ctx.fillStyle = "#f0f";
            // ctx.fillRect(0, 0, wInternal, hInternal);

            ctx.save();
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            ctx.translate(12, 20);

            // ctx.beginPath();
            // let pad = 10;
            // ctx.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, 10);
            // ctx.fillStyle = "#f0f0f0";
            // ctx.fill();

            if (block) {
                let now = performance.now();
                renderDeflate(ctx, block.src, block.blocks[0], symPos);
                console.log(`Render time: ${(performance.now() - now).toFixed(1)}ms`);
            }

            ctx.restore();
        }

        renderCanvas();
        if (canvasEl) {
            let resizeObserver = new ResizeObserver(renderCanvas);
            resizeObserver.observe(canvasEl);
            return () => { resizeObserver.disconnect(); };
        }

    }, [canvasEl, block, symPos]);


    let zoomBitsRef = useRef({
        initial: null as (number | null),
        target: null as (number | null),
        t: 0,
     });

    useRequestAnimationFrame(isNotNil(targetSymPos), (dtSeconds) => {
        if (isNil(targetSymPos)) {
            return;
        }
        let bits = zoomBitsRef.current;
        let target = targetSymPos;
        if (bits.target !== target) {
            bits.initial = symPos;
            bits.target = target;
            bits.t = 0;
        }

        let ms = 200;
        bits.t += dtSeconds / (ms / 1000); // t goes from 0 to 1 in 80ms

        let initial = bits.initial!;

        let isComplete = bits.t >= 1.0;
        if (isComplete) {
            bits.initial = null;
            bits.target = null;
            bits.t = 0;
        }

        // target = initial * Math.pow(scalePowerBase, someValue)
        // someValue = log(target / initial) / log(scalePowerBase)

        let symIdxInterp = isComplete ? target : lerp(initial, target, bits.t);

        setSymPos(symIdxInterp);
        setTargetSymPos(isComplete ? null : target);
    });

    return <div>
        <div className="pl-3">
            <p>Here's my rendering of the deflate block & deflate process:</p>
            <p>The question still remains: is canvas the right idea, or should I use plain HTML?</p>
        </div>
        <canvas ref={setCanvasEl} id="codec-canvas" className="w-[1200px] h-[600px] bg-gray-50" />
    </div>;
};
