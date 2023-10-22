import React, { CSSProperties, useMemo, useState } from "react";
import { Portal } from "./Portal";
import clsx from "clsx";
import { useResizeChangeHandler } from "./layout";
import { assignImm, clamp } from "./data";

const PosStart = 16;
const PosEnd = 32;

enum TipPos {
    Top = 1,
    Right = 2,
    Left = 4,
    Bottom = 8,

    TopStart = Top | PosStart,
    TopEnd = Top | PosEnd,

    BottomStart = Bottom | PosStart,
    BottomEnd = Bottom | PosEnd,

    LeftStart = Left | PosStart,
    LeftEnd = Left | PosEnd,

    RightStart = Right | PosStart,
    RightEnd = Right | PosEnd,
}

enum TipStyle {
    Gray,
}

export const Tooltip: React.FC<{
    tip: React.ReactNode,
    tipStyle?: TipStyle,
    pos?: TipPos,
    arrow?: boolean,
    className?: string,
    children: React.ReactNode,
}> = ({ tip, className, pos = TipPos.Bottom, tipStyle = TipStyle.Gray, arrow = true, children }) => {
    let [isVisible, setIsVisible] = useState(false);
    let [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
    let [tooltipEl, setTooltipEl] = useState<HTMLElement | null>(null);
    let [tooltipInfo, setTooltipInfo] = useState<ITooltipInfo>({ });

    useResizeChangeHandler(isVisible ? targetEl : null, () => {
        setTooltipInfo(a => assignImm(a, { targetBcr: targetEl?.getBoundingClientRect() }));
    });

    useResizeChangeHandler(isVisible && targetEl ? tooltipEl : null, () => {
        setTooltipInfo(a => assignImm(a, { tooltipBcr: tooltipEl?.getBoundingClientRect() }));
    });

    let { tooltipStyle, arrowStyle } = useMemo(() => {
        if (!isVisible || !tooltipInfo.targetBcr || !tooltipInfo.tooltipBcr) {
            return {};
        }

        let arrowHalfWidth = 8;
        let offset = 14;
        let pageMargin = 8;
        let targetBcr = tooltipInfo.targetBcr;
        let tooltipBcr = tooltipInfo.tooltipBcr;

        let isBottom = !!(pos & TipPos.Bottom);

        let isStart = !!(pos & PosStart);
        let isEnd = !!(pos & PosEnd);

        // applies to bottom & top
        let x = isStart ? targetBcr.left : isEnd ? targetBcr.right - tooltipBcr.width : targetBcr.left + targetBcr.width / 2 - tooltipBcr.width / 2;
        let y = isBottom ? targetBcr.bottom + offset : targetBcr.top - tooltipBcr.height - offset;

        x = clamp(x, pageMargin, window.innerWidth - tooltipBcr.width - pageMargin);


        let arrowXGlobal = isStart ? targetBcr.left + arrowHalfWidth : isEnd ? targetBcr.right - arrowHalfWidth : targetBcr.left + targetBcr.width / 2;

        let arrowX = clamp(arrowXGlobal - x, arrowHalfWidth, tooltipBcr.width - arrowHalfWidth);
        let arrowY = isBottom ? 1 : tooltipBcr.height;

        return {
            tooltipStyle: {
                visibility: "visible",
                transform: `translate(${x}px, ${y}px)`,
            } as CSSProperties,
            arrowStyle: {
                transform: `translate(-50%, -100%) translate(${arrowX}px, ${arrowY}px)`,
            } as CSSProperties,
        };

    }, [tooltipInfo, isVisible, pos]);

    return <>
        {React.cloneElement(React.Children.only(children) as React.ReactElement, { onMouseEnter: () => setIsVisible(true), onMouseLeave: () => setIsVisible(false), ref: setTargetEl })}
        {isVisible && <Portal>
            <div ref={setTooltipEl} className={clsx(className,
                    "invisible absolute pointer-events-auto flex justify-center items-center z-0 min-h-[2.5rem] rounded px-3 py-1 min-w-[2.5rem] shadow-lg",
                    tipStyle === TipStyle.Gray && "bg-gray-600 text-white",
                )} style={tooltipStyle}>
                {tip}
                {arrow && <div className={clsx(
                    "absolute w-0 h-0 top-0 left-0 origin-center border-8 z-[1] shadow-lg",
                    tipStyle === TipStyle.Gray && "border-gray-600",
                    (pos & TipPos.Bottom) && "border-t-transparent border-l-transparent border-r-transparent",
                )}
                style={arrowStyle}>

                </div>}
            </div>
        </Portal>}
    </>;
};

interface ITooltipInfo {
    targetBcr?: DOMRect;
    tooltipBcr?: DOMRect;
}
