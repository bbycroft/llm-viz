import React, { CSSProperties, memo } from "react";
import { ICanvasState, IComp } from "../CpuModel";
import { ensureSigned32Bit, ensureUnsigned32Bit } from "./RiscvInsDecode";
import s from './CompStyles.module.scss';
import clsx from "clsx";
import { useEditorContext } from "../Editor";
import { assert } from "console";
import { assignImm } from "@/src/utils/data";

export function regValToStr(val: number) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = ensureSigned32Bit(val);
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(8, "0");
    let pcValStr = valS32.toString().padStart(2, "0");
    return pcValStr + '  ' + pcHexStr;
}

export const registerOpts = {
    innerPadX: 0.4,
}


export const CompRectBase: React.FC<{
    comp: IComp,
    hideHover?: boolean,
    className?: string,
    children?: React.ReactNode,
}> = memo(function CompRectBase({ comp, className, children, hideHover }) {
    let { setEditorState } = useEditorContext();

    function handleHover(isHover: boolean) {
        if (!hideHover) {
            return;
        }
        setEditorState(a => {
            return assignImm(a, {
                maskHover: isHover ? comp.id : (a.maskHover === comp.id ? null : a.maskHover),
            });
        });
    }

    return <div
        className={clsx(s.baseComp, className)} style={createCanvasDivStyle(comp)}
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
        onMouseDown={ev => ev.stopPropagation()}
    >

        {children}
    </div>;
});

export function createCanvasDivStyle(comp: IComp): CSSProperties {

    let scale = 15;

    return {
        width: comp.size.x * scale,
        height: comp.size.y * scale,
        transform: `translate(${comp.pos.x}px, ${comp.pos.y}px) scale(${1/scale})`,
    };
}
