import React, { CSSProperties, memo } from "react";
import { ICanvasState, IComp } from "../CpuModel";
import { ensureSigned32Bit, ensureUnsigned32Bit } from "./RiscvInsDecode";
import s from './CompStyles.module.scss';
import clsx from "clsx";

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
    cvs: ICanvasState,
    comp: IComp,
    children?: React.ReactNode,
}> = memo(function CompRectBase({ cvs, comp, children }) {

    return <div className={clsx(s.rectComp, s.baseComp)} style={createCanvasDivStyle(cvs, comp)}>
        {children}
    </div>;
});

export function createCanvasDivStyle(cvs: ICanvasState, comp: IComp): CSSProperties {

    let mtxStr = `matrix(${cvs.mtx.toTransformParams().join(',')})`;
    let scale = 15;

    return {
        width: comp.size.x * scale,
        height: comp.size.y * scale,
        transform: `${mtxStr} translate(${comp.pos.x}px, ${comp.pos.y}px) scale(${1/scale})`,
    };
}
