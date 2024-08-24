'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { testGzipFile } from "./DeflateDecoder";
import { AnimStepType, IDeflateRenderState } from "./DeflateRenderModel";
import { renderDeflate } from "./DeflateRender";
import { KeyboardOrder, isArrowKeyWithModifiers, useCreateGlobalKeyboardDocumentListener, useGlobalKeyboard } from "../utils/keyboard";
import { assignImm, clamp, isNil, isNotNil } from "../utils/data";
import { useRequestAnimationFrame } from "../utils/hooks";
import { lerp } from "../utils/math";
import { createDeflateBlockInfo, initDeflateRenderData, renderDeflateBlock } from "./renderDeflateBlock";
import { createRenderOutputArray, renderOutputArray } from "./renderOutputArray";
import { Vec2 } from "../utils/vector";
import { createCodeTreeInfo, renderCodingTree } from "./renderCodeTree";
import { baseRenderStyle, distDefString, distStyle, litLenDefString, litLenStyle } from "./deflateRenderHelpers";

export const CodecMain: React.FC<{}> = ({ }) => {
    let [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [renderState, setRenderState] = useState<IDeflateRenderState | null>(null);
    let [targetSymPos, setTargetSymPos] = useState<number | null>(null);
    useCreateGlobalKeyboardDocumentListener();

    useGlobalKeyboard(KeyboardOrder.MainPage, (ev) => {
        let newSymPos = targetSymPos ?? Math.round(renderState?.symPos ?? 0);
        if (isArrowKeyWithModifiers(ev, 'left')) {
            newSymPos -= 1;
        } else if (isArrowKeyWithModifiers(ev, 'right')) {
            newSymPos += 1;
        }

        newSymPos = clamp(newSymPos, 0, 255);

        setTargetSymPos(newSymPos);
    });

    useEffect(() => {
        let deflateData = testGzipFile();
        if (deflateData) {
            initDeflateRenderData(deflateData);

            setRenderState({
                ctx: null!,
                symPos: 43 + 84,
                data: deflateData,
                outputArrayState: {
                    offset: new Vec2(0, 500),
                    scrollPos: 0,
                    blockIdx: 0,
                },
                deflateBlockState: {},

                outputArrayInfo: null!,
                deflateBlockInfo: null!,
                distTreeInfo: null!,
                litLenTreeInfo: null!,
            })
        }
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
            // ctx.translate(12, 20);

            // ctx.beginPath();
            // let pad = 10;
            // ctx.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, 10);
            // ctx.fillStyle = "#f0f0f0";
            // ctx.fill();

            if (renderState) {
                let data = renderState.data;
                let block = renderState.data.blocks[0];
                let firstLitLenIdx = block.animSteps.arrType.findIndex(t => t === AnimStepType.LitLen);

                renderState.ctx = ctx;
                renderState.outputArrayInfo = createRenderOutputArray(renderState, renderState.outputArrayState);
                renderState.deflateBlockInfo = createDeflateBlockInfo(renderState, {
                    x: 10,
                    y: 8,
                    w: 750,
                });

                renderState.litLenTreeInfo = createCodeTreeInfo(renderState, block.litLenCoding.tree, {
                    renderSymbol: (sym) => {
                        let [color] = litLenStyle(baseRenderStyle, sym);
                        let defStr = litLenDefString(sym);
                        return [color, defStr];
                    },
                    x: 800,
                    y: 8,
                    h: 380,
                });

                renderState.distTreeInfo = createCodeTreeInfo(renderState, block.distCoding.tree, {
                    renderSymbol: (sym) => {
                        let [color] = distStyle(baseRenderStyle, sym);
                        let defStr = distDefString(sym);
                        return [color, defStr];
                    },
                    x: 800,
                    y: 390,
                    h: 200,
                });

                // let now = performance.now();


                // we'll adjust the symPos to point to the start of the litlen array for now


                // renderDeflate(ctx, data.src, firstBlock, renderState.symPos - firstLitLenIdx);

                ctx.save();
                renderDeflateBlock(renderState, renderState.deflateBlockInfo);
                renderCodingTree(renderState, renderState.litLenTreeInfo);
                renderCodingTree(renderState, renderState.distTreeInfo);
                renderOutputArray(renderState, renderState.outputArrayInfo);
                ctx.restore();

                // console.log(`Render time: ${(performance.now() - now).toFixed(1)}ms`);
            }

            ctx.restore();
        }

        renderCanvas();
        if (canvasEl) {
            let resizeObserver = new ResizeObserver(renderCanvas);
            resizeObserver.observe(canvasEl);
            return () => { resizeObserver.disconnect(); };
        }

    }, [canvasEl, renderState]);


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
            bits.initial = renderState?.symPos ?? 0;
            bits.target = target;
            bits.t = 0;
        }

        let ms = 600;
        bits.t += dtSeconds / (ms / 1000);

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

        setRenderState(a => assignImm(a, { symPos: symIdxInterp }));
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
