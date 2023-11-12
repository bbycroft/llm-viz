import clsx from "clsx";
import React, { useState } from "react";
import { clamp } from "./data";
import { useCombinedMouseTouchDrag } from "./pointer";

export const Resizer: React.FC<{
    id: string;
    className?: string;
    vertical?: boolean;
    defaultFraction?: number;
    children: React.ReactNode[];
}> = ({ id, className, children, vertical, defaultFraction }) => {

    let [parentEl, setParentEl] = useState<HTMLElement | null>(null);
    let [sliderHitEl, setSliderHitEl] = useState<HTMLElement | null>(null);
    let childrenArr = React.Children.toArray(children).filter(a => a);
    let firstChild = childrenArr[0] as React.ReactElement;
    let scndChild = childrenArr[1] as React.ReactElement;

    let [fraction, setFraction] = useState(defaultFraction ?? 0.4);

    let [, setDragStart] = useCombinedMouseTouchDrag(sliderHitEl, () => fraction, (ev, ds, end) => {
        let parentBcr = parentEl!.getBoundingClientRect();
        let deltaPx = vertical ? ev.clientY - ds.clientY : ev.clientX - ds.clientX;
        let fullSizePx = vertical ? parentBcr.height : parentBcr.width;
        let newFraction = clamp(ds.data + deltaPx / fullSizePx, 0, 1);
        setFraction(newFraction);
        ev.preventDefault();
        ev.stopPropagation();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.stopPropagation();
        ev.preventDefault();
    }

    let pct = (fraction * 100) + '%';
    let invPct = ((1 - fraction) * 100) + '%';
    let hasBothChildren = firstChild && scndChild;

    return <div ref={setParentEl} className={clsx("relative flex", className, vertical ? 'flex-col' : 'flex-row')}>
        {firstChild && <div className="flex flex-initial overflow-hidden" style={{ flexBasis: hasBothChildren ? pct : '100%' }}>
            {firstChild}
        </div>}
        {scndChild && <div className="flex flex-initial overflow-hidden" style={{ flexBasis: hasBothChildren ? invPct : '100%' }}>
            {scndChild}
        </div>}
        {hasBothChildren && <>
            <div
                ref={setSliderHitEl}
                className={clsx("absolute", vertical ? "w-full cursor-ns-resize h-4" : "h-full cursor-ew-resize w-4")}
                style={{ transform: `translate${vertical ? 'Y' : 'X'}(-50%)`, top: vertical ? pct : undefined, left: vertical ? undefined : pct }}
                onMouseDown={handleMouseDown}>
            </div>
            <div
                className={clsx("absolute bg-slate-200 pointer-events-none", vertical ? "w-full h-0 border-t" : "h-full w-0 border-l")}
                style={{ transform: `translate${vertical ? 'Y' : 'X'}(-50%)`, top: vertical ? pct : undefined, left: vertical ? undefined : pct }}>
            </div>
        </>}
    </div>;
};
