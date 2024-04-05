'use client';
import React, { useEffect, useLayoutEffect, useState } from "react";
import { testGzipFile } from "./DeflateDecoder";
import { IDeflateData } from "./DeflateRenderModel";
import { renderDeflate } from "./DeflateRender";

export const CodecMain: React.FC<{}> = ({ }) => {
    let [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [block, setBlock] = useState<IDeflateData | null>(null);

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
                renderDeflate(ctx, block.src, block.blocks[0]);
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

    }, [canvasEl, block]);

    return <div>
        <div className="pl-3">
            <p>Here's my rendering of the deflate block & deflate process:</p>
            <p>The question still remains: is canvas the right idea, or should I use plain HTML?</p>
        </div>
        <canvas ref={setCanvasEl} id="codec-canvas" className="w-[1200px] h-[600px] bg-gray-50" />
    </div>;
};
