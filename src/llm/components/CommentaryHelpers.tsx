import React from 'react';
import { DimStyle, dimStyleColor } from '../walkthrough/WalkthroughTools';
import { useProgramState } from '../Sidebar';
import { IBlkDef } from '../GptModelLayout';
import { isNotNil } from '@/src/utils/data';

export const DimensionText: React.FC<{
    dim: DimStyle,
    children?: React.ReactNode,
    style?: React.CSSProperties,
}> = ({ dim, style, children }) => {
    let state = useProgramState();

    function setHover(isHover: boolean) {
        state.display.dimHover = isHover ? dim : null;
        state.markDirty();
    }

    let isHover = state.display.dimHover === dim;

    return <span
        style={{ ...style,
            textShadow: isHover ? `0 0 0.5em ${dimStyleColor(dim).toHexColor()}` : undefined
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        >
            {children}
        </span>;
}


export const BlockText: React.FC<{
    blk: IBlkDef | IBlkDef[],
    children?: React.ReactNode,
    style?: React.CSSProperties,
}> = ({ blk, style, children }) => {
    let state = useProgramState();
    let blkArr = Array.isArray(blk) ? blk : [blk];
    let firstBlk = blkArr[0];
    let dimStyle = firstBlk.t === 'i' ? DimStyle.Intermediates : firstBlk.t === "w" ? DimStyle.Weights : DimStyle.Aggregates;
    let color = dimStyleColor(dimStyle).toHexColor();

    function setHover(isHover: boolean) {
        state.display.blkIdxHover = isHover ? blkArr.map(a => a.idx) : null;
        state.markDirty();
    }

    let hoverIdxs = state.display.blkIdxHover ?? [state.display.hoverTarget?.mainCube.idx].filter(isNotNil);

    let isHover = hoverIdxs.length > 0 && hoverIdxs.includes(firstBlk.idx);

    return <span
        style={{
            color: color,
            textShadow: isHover ? `0 0 0.5em ${style?.color ?? color}` : undefined,
            ...style,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        >
            {children}
        </span>;
}
