import { inverseLerp } from "../llm/walkthrough/Walkthrough04_SelfAttention";
import { Vec2 } from "../utils/vector";
import { IDeflateBlock, IDeflateData, IDeflateRenderState } from "./DeflateRenderModel";

// actually split this into two parts:
// 1) doing the "layout", deciding where to put the blocks, taking into account the zoom, scroll
//    position etc
// 2) rendering the blocks to the canvas
// In between these stages, we can add extra things, like add flags onto the layout for hover,
// selection, activation in the stream (as we write the stream), etc.

// So we're building up a big data structure that is going to be rendered, using that data structure
// to create more bits, and then finally rendering it to the canvas.

// This includes things like arrows between blocks & stream processing, or cross-reference highlighting
// on hover.

// We'll have some top-level "IRenderOutput" data structure that will be passed around, and we'll
// have a bunch of stages that add/edit to that, with things like the output array below creating
// a sub-block. Hmm, want a prefix for these type of things, like "IRender*", but shorter: "IRo*".

// We'll only be rendering partial data, so we'll have some lookups to make cross-ref'ing cheaper.

// This data structure will be created, populated, and read each frame.

// We'll do hover detection against this data structure, since it has layout information.

export interface IOutputArrayState {
    offset: Vec2;
    scrollPos: number;
    blockIdx: number;
}

export interface IOutputArrayInfo {
    cells: IRenOutputCell[];
}

export interface IRenOutputCell {
    x: number;
    y: number;
    width: number;
    height: number;
    val: number;
    visible: boolean;
    completion: number;
}

export function getActiveBlock(data: IDeflateData, symPos: number): IDeflateBlock | null {
    for (let block of data.blocks) {
        if (block.animSteps.stepOffset + block.animSteps.stepCount > symPos) {
            return block;
        }
    }

    return null;
}

export function createRenderOutputArray(renderState: IDeflateRenderState, oaState: IOutputArrayState): IOutputArrayInfo {
    // need to figure out how much to render
    // we use the symPos, and lookup the block that contains that symbol, and then examine an array
    // which says where in the output that symbol writes up to. (and maybe how many bytes it writes)

    let symPos = renderState.symPos;
    let symPosFloor = Math.floor(symPos);
    let symPosCeil = Math.ceil(symPos);
    let data = renderState.data;

    let block = getActiveBlock(data, symPosFloor);

    if (!block) {
        return {
            cells: [],
        };
    }

    let animSteps = block.animSteps;
    let symBlockIdx = symPosFloor - animSteps.stepOffset;
    let outputStart = animSteps.arrOutputIdx[symBlockIdx];
    let outputLen = animSteps.arrOutputCount[symBlockIdx];

    let lastByteVisible = outputStart + outputLen;

    let cells: IRenOutputCell[] = [];

    let cellWidth = 20;
    let cellHeight = 15;
    let cellSpacing = 2;
    let rowHeight = cellHeight + cellSpacing;

    let viewportWidth = 1000;
    let viewportHeight = 500;

    let cellsPerRow = Math.floor(viewportWidth / (cellWidth + cellSpacing));

    let firstRowByte = Math.floor(oaState.scrollPos / rowHeight) * cellsPerRow;
    let numRowsVisible = Math.ceil(viewportHeight / rowHeight);

    for (let i = 0; i < numRowsVisible; i++) {
        let rowByte = firstRowByte + i * cellsPerRow;
        let rowY = i * rowHeight + oaState.offset.y;

        for (let j = 0; j < cellsPerRow; j++) {
            let cellX = j * (cellWidth + cellSpacing) + oaState.offset.x;
            let cellIdx = rowByte + j;
            let cellVal = data.dest[cellIdx];

            let isTransitioning = cellIdx >= outputStart && cellIdx < lastByteVisible;
            let isCompleted = cellIdx < outputStart;

            let completion = 1.0;
            if (isTransitioning) {
                completion = inverseLerp(0.8, 1.0, symPos - symPosFloor);
            }

            cells.push({
                x: cellX,
                y: rowY,
                width: cellWidth,
                height: cellHeight,
                val: cellVal,
                visible: cellIdx < lastByteVisible,
                completion: completion,
            });

            if (cellIdx >= lastByteVisible) {
                break;
            }
        }

        if (rowByte >= lastByteVisible) {
            break;
        }
    }

    return {
        cells: cells,
    };
}

export function renderOutputArray(ctx: CanvasRenderingContext2D, oa: IOutputArrayInfo) {
    for (let cell of oa.cells) {
        if (!cell.visible) {
            continue;
        }

        ctx.globalAlpha = cell.completion;
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);

        ctx.font = "13px monospace";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let char = String.fromCharCode(cell.val);

        ctx.fillText(char, cell.x + cell.width / 2, cell.y + cell.height / 2 + 1);
    }

    ctx.globalAlpha = 1;
}
