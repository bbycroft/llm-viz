import clsx from "clsx";
import React, { CSSProperties, useState } from "react";
import { clamp } from "./data";
import { useCombinedMouseTouchDrag } from "./pointer";

export const Resizer: React.FC<{
    id: string;
    className?: string;
    vertical?: boolean;
    defaultAmt?: number;
    fixedWidthLeft?: boolean;
    fixedWidthRight?: boolean;
    children: React.ReactNode[];
}> = ({ id, className, children, vertical, defaultAmt, fixedWidthLeft, fixedWidthRight }) => {

    let [parentEl, setParentEl] = useState<HTMLElement | null>(null);
    let [sliderHitEl, setSliderHitEl] = useState<HTMLElement | null>(null);
    let childrenArr = React.Children.toArray(children).filter(a => a);
    let firstChild = childrenArr[0] as React.ReactElement;
    let scndChild = childrenArr[1] as React.ReactElement;

    let [amt, setAmt] = useState(defaultAmt ?? 0.4);

    let [, setDragStart] = useCombinedMouseTouchDrag(sliderHitEl, () => amt, (ev, ds, end) => {
        let parentBcr = parentEl!.getBoundingClientRect();
        let deltaPx = vertical ? ev.clientY - ds.clientY : ev.clientX - ds.clientX;
        let fullSizePx = vertical ? parentBcr.height : parentBcr.width;
        if (fixedWidthLeft) {
            let newAmt = clamp(ds.data + deltaPx, 0, fullSizePx);
            setAmt(newAmt);
        } else if (fixedWidthRight) {
            let newAmt = clamp(ds.data - deltaPx, 0, fullSizePx);
            setAmt(newAmt);
        } else {
            let newFraction = clamp(ds.data + deltaPx / fullSizePx, 0, 1);
            setAmt(newFraction);
        }
        ev.preventDefault();
        ev.stopPropagation();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.stopPropagation();
        ev.preventDefault();
    }

    let pct = (amt * 100) + '%';
    let invPct = ((1 - amt) * 100) + '%';
    let basisLeft = fixedWidthLeft ? amt + 'px' : fixedWidthRight ? undefined : pct;
    let basisRight = fixedWidthRight ? amt + 'px' : fixedWidthLeft ? undefined : invPct;

    let hasBothChildren = firstChild && scndChild;

    let style: CSSProperties = { transform: `translate${vertical ? 'Y' : 'X'}(${(fixedWidthRight ? '50%' : '-50%')})` };
    let key: keyof CSSProperties = vertical ? (fixedWidthRight ? 'bottom' : 'top') : (fixedWidthRight ? 'right' : 'left');
    style[key] = fixedWidthRight ? basisRight : basisLeft;

    return <div ref={setParentEl} className={clsx("x-resize-parent relative flex overflow-hidden", className, vertical ? 'flex-col' : 'flex-row')} data-resizetype={fixedWidthLeft ? 'left' : fixedWidthRight ? 'right' : 'pct'}>
        {firstChild && <div className="x-resize-c0 flex flex-initial overflow-hidden" style={{ flexBasis: hasBothChildren ? basisLeft : '100%', flexGrow: basisLeft ? undefined : '1' }}>
            {firstChild}
        </div>}
        {scndChild && <div className="x-resize-c1 flex flex-initial overflow-hidden" style={{ flexBasis: hasBothChildren ? basisRight : '100%', flexGrow: basisRight ? undefined : '1' }}>
            {scndChild}
        </div>}
        {hasBothChildren && <>
            <div
                ref={setSliderHitEl}
                className={clsx("x-resize-slide-hit absolute", vertical ? "w-full cursor-ns-resize h-4" : "h-full cursor-ew-resize w-4")}
                style={style}
                onMouseDown={handleMouseDown}>
            </div>
            <div
                className={clsx("x-resize-slide absolute bg-slate-200 pointer-events-none", vertical ? "w-full h-0 border-t" : "h-full w-0 border-l")}
                style={style}>
            </div>
        </>}
    </div>;
};
