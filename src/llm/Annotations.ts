import { cellPosition, IBlkDef, IModelLayout } from "./GptModelLayout";
import { addLine } from "./render/lineRender";
import { IRenderState } from "./render/modelRender";
import { measureTextWidth, writeTextToBuffer } from "./render/fontRender";
import { lerp, lerpSmoothstep } from "@/src/utils/math";
import { Mat4f } from "@/src/utils/matrix";
import { Dim, Vec3, Vec4 } from "@/src/utils/vector";
import { DimStyle, dimStyleColor, dimStyleText } from "./walkthrough/WalkthroughTools";
import { IProgramState } from "./Program";
import { camScaleToScreen } from "./Camera";
import { isNil } from "@/src/utils/data";

export function blockDimension(state: IProgramState, layout: IModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, t: number) {
    let render = state.render;

    // Render |----- T ------| along the appropriate dimension

    let { vecId } = dimConsts(dim);
    let { cx } = dimProps(blk, dim);

    let offVecId = vecId === 0 ? 1 : 0;

    let text = dimStyleText(style);
    if (style === DimStyle.None) {
        return;
    }

    let start = cellPosition(layout, blk, dim, 0);
    let end = cellPosition(layout, blk, dim, cx - 1) + layout.cell;
    let mid = (end + start) / 2;
    let midPos = dim === Dim.X ? new Vec3(mid, blk.y + blk.dz, blk.z + blk.dz) : new Vec3(blk.x, mid, blk.z + blk.dz);
    let mul = dim === Dim.X ? -1.0 : 1.0;

    let scale = camScaleToScreen(state, midPos);
    scale = Math.min(scale, 1);

    let fontSize = 2.5 * scale;
    let tw = measureTextWidth(render.modelFontBuf, text, fontSize);
    let th = fontSize;
    let textPad = dim === Dim.X ? tw / 2 + fontSize * 0.4 : dim === Dim.Y ? th / 2 + fontSize * 0.4 : 0;

    let botPad = fontSize * 0.3;
    let edgeH2 = fontSize / 2 * 0.5;

    let color = dimStyleColor(style).mul(t);

    let zOffset = 0.1;

    let textPos = new Vec3(blk.x, blk.y + blk.dy, blk.z + blk.dz + zOffset)
        .setAt(vecId, mid)
        .withAddAt(offVecId, -mul * (fontSize / 2 + botPad));

    let textYOff = 0;
    let tooSmall = tw > end - start - textPad * 2;
    if (tooSmall) {
        textYOff = mul * fontSize;
    }

    let mtx = Mat4f.fromTranslation(textPos);

    let textDx = dim === Dim.X ? -tw / 2 : dim === Dim.Y ? -tw / 2 : 0;
    let textDy = dim === Dim.X ? -textYOff - fontSize / 2 : dim === Dim.Y ? -fontSize / 2 : 0;

    writeTextToBuffer(render.modelFontBuf, text, color, textDx, textDy, fontSize, mtx);

    // let yOff = fontSize / 2 + botPad;
    let lX = blk.x;
    let lY = blk.y + blk.dy;
    let lZ = blk.z + blk.dz + zOffset;
    let thickness = fontSize * 0.02;
    let n = new Vec3(0, 0, 1);

    if (tooSmall) {
        textPad = 0;

    }

    let base = new Vec3(lX, lY, lZ).withAddAt(offVecId, -mul * (fontSize / 2 + botPad));
    let vStart = base.withSetAt(vecId, start);
    let vEnd = base.withSetAt(vecId, end);
    let vMid1 = base.withSetAt(vecId, mid - textPad);
    let vMid2 = base.withSetAt(vecId, mid + textPad);

    addLine(render.lineRender, thickness, color, vStart, vMid1, n);
    addLine(render.lineRender, thickness, color, vEnd  , vMid2, n);
    addLine(render.lineRender, thickness, color, vStart.withAddAt(offVecId, edgeH2), vStart.withAddAt(offVecId, -edgeH2), n);
    addLine(render.lineRender, thickness, color, vEnd.withAddAt(offVecId, edgeH2), vEnd.withAddAt(offVecId, -edgeH2), n);
}

export function blockIndex(state: IRenderState, layout: IModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, idx: number, cellOffset: number, t: number) {
    if (t === 0) return;

    let fontSize = 2;
    let text = DimStyle[style] + '=' + Math.round(idx).toFixed(0);
    let font = '';

    let tw = measureTextWidth(state.modelFontBuf, text, fontSize, font);

    let cellL = cellPosition(layout, blk, dim, Math.floor(idx)) + layout.cell / 2;
    let cellR = cellPosition(layout, blk, dim, Math.ceil(idx)) + layout.cell / 2;
    let pos = lerp(cellL, cellR, idx - Math.floor(idx)) + lerpSmoothstep(0, cellOffset, Math.min(idx, 1));
    let botPad = fontSize * 0.5;

    let color = dimStyleColor(style).mul(t);

    let mtx = Mat4f.fromTranslation(new Vec3(pos, blk.y - botPad, blk.z + blk.dz));

    writeTextToBuffer(state.modelFontBuf, text, color, -tw / 2, -fontSize, fontSize, mtx, font);
}

interface IDimConst {
    vecId: number;
    xName: string;
    dxName: string;
    cxName: string;
    offXName: string;
    sizeXName: string;
}

let dimConstX: IDimConst = { vecId: 0, xName: 'x', dxName: 'dx', cxName: 'cx', offXName: 'offX', sizeXName: 'sizeX' };
let dimConstY: IDimConst = { vecId: 1, xName: 'y', dxName: 'dy', cxName: 'cy', offXName: 'offY', sizeXName: 'sizeY' };
let dimConstZ: IDimConst = { vecId: 2, xName: 'z', dxName: 'dz', cxName: 'cz', offXName: 'offZ', sizeXName: 'sizeZ' };

export function dimConsts(dim: Dim) {
    return dim === Dim.X ? dimConstX : dim === Dim.Y ? dimConstY : dimConstZ;
}

export function dimProps(blk: IBlkDef, dim: Dim) {
    switch (dim) {
        case Dim.X: return { x: blk.x, cx: blk.cx, dx: blk.dx, rangeOffsets: blk.rangeOffsetsX, offX: blk.offX ?? 0, sizeX: blk.sizeX ?? blk.cx };
        case Dim.Y: return { x: blk.y, cx: blk.cy, dx: blk.dy, rangeOffsets: blk.rangeOffsetsY, offX: blk.offY ?? 0, sizeX: blk.sizeY ?? blk.cy };
        case Dim.Z: return { x: blk.z, cx: blk.cz, dx: blk.dz, rangeOffsets: blk.rangeOffsetsZ, offX: blk.offZ ?? 0, sizeX: blk.sizeZ ?? blk.cz };
    }
}

export function duplicateGrid(layout: IModelLayout, blk: IBlkDef): IBlkDef {
    let newBlk = { ...blk, access: blk.access ? { ...blk.access } : undefined };
    newBlk.name = '';
    layout.cubes.push(newBlk);
    return newBlk;
}

export function splitGridForHighlight(layout: IModelLayout, blk: IBlkDef, dim: Dim, xSplit: number) {
    let { x, cx, rangeOffsets } = dimProps(blk, dim);

    if (cx <= 1) {
        return blk;
    }

    // if there exists some rangeOffsets in our dim, then we iter over the sub-blocks, and split them
    if (rangeOffsets && blk.subs) {
        for (let s of blk.subs) {
            let res = splitGrid(layout, s, dim, xSplit, 0);
            if (res) {
                return res;
            }
        }
    }

    return splitGrid(layout, blk, dim, xSplit, 0);
}

export function splitGrid(layout: IModelLayout, blk: IBlkDef, dim: Dim, xSplit: number, splitAmt: number) {
    // generate several new blocks (let's say up to 5) that are neighbouring the zSplit point

    // main-left, left, center, right, main-right

    // choose center as floor(zSplit), left is floor(zSplit) - 1, right is floor(zSplit) + 1
    // main-left and main-right are the remaining
    // only create those if there's space

    // The splitAmt governs the overall gap between blocks
    // Want a rotating-block-under-examination effect. When zSplit is right down the center (x + 0.5),
    // have max seperation, and effectively join left & right with their main
    // For non 0.5 zSplits, will show 2 gaps

    let { offX, sizeX } = dimProps(blk, dim);

    // if (cxSub <= 1 && ) {
    //     return blk;
    // }

    let blocks: IBlkDef[] = [];
    let rangeOffsets: [number, number][] = [];

    let colX = Math.floor(xSplit) - offX;
    if (colX < 0 || colX >= sizeX) {
        return null;
    }

    if (sizeX <= 1) {
        return blk;
    }

    function addSubBlockLocal(iStart: number, iEnd: number, xOffset: number) {
        let res = addSubBlock(layout, blk, dim, iStart, iEnd, xOffset);
        if (res) {
            blocks.push(res.subBlock);
            rangeOffsets.push(res.rangeOffset);
        }
        return res?.subBlock ?? null;
    }

    let midBlock: IBlkDef | null;
    if (splitAmt === 0) {
        addSubBlockLocal(0, colX, 0.0);
        midBlock = addSubBlockLocal(colX, colX + 1, 0.0);
        addSubBlockLocal(colX + 1, sizeX, 0.0);

    } else {
        let scale = 0.5;
        let fract = (xSplit - colX - 0.5) * scale + 0.5;

        let addMidBlockBefore = fract + scale < 1.0;
        let addMidBlockAfter = fract - scale > 0.0;
        let offset = lerpSmoothstep(-splitAmt, 0, (xSplit - 0.5) * scale + 0.5);

        addSubBlockLocal(0     , colX - (addMidBlockBefore ? 1 : 0), offset + 0.0);

        if (addMidBlockBefore) {
            addSubBlockLocal(colX - 1, colX    , offset + lerpSmoothstep(splitAmt, 0, fract + scale));
        }

        midBlock = addSubBlockLocal(colX    , colX + 1, offset + lerpSmoothstep(splitAmt, 0, fract));

        if (addMidBlockAfter) {
            addSubBlockLocal(colX + 1, colX + 2, offset + lerpSmoothstep(splitAmt, 0, fract - scale));
        }

        addSubBlockLocal(colX + (addMidBlockAfter ? 2 : 1), sizeX, offset + splitAmt);
    }

    if (blocks.length > 0) {
        if (dim === Dim.X) blk.rangeOffsetsX = rangeOffsets;
        if (dim === Dim.Y) blk.rangeOffsetsY = rangeOffsets;
        if (dim === Dim.Z) blk.rangeOffsetsZ = rangeOffsets;
        blk.subs = blocks;
        return midBlock;

    } else {
        return null;
    }
}

interface ISubBlockInfo {
    subBlock: IBlkDef;
    rangeOffset: [number, number];
}

function addSubBlock(layout: IModelLayout, blk: IBlkDef, dim: Dim, iStart: number, iEnd: number, xOffset: number): ISubBlockInfo | null {
    let { x, cx, sizeX, offX } = dimProps(blk, dim);
    let { vecId, xName, dxName, offXName, sizeXName } = dimConsts(dim);

    if (iStart >= iEnd || iEnd <= 0 || iStart >= sizeX) {
        return null;
    }

    let scale = (iEnd - iStart) / sizeX;
    let translate = iStart / sizeX;

    let mtx = Mat4f.fromScaleTranslation(new Vec3(1,1,1).setAt(vecId, scale), new Vec3().setAt(vecId, translate));

    let subBlock: IBlkDef = { ...blk,
        [dxName]: (iEnd - iStart) * layout.cell,
        // [cxName]: iEnd - iStart,
        access: blk.access && { ...blk.access },
        localMtx: (blk.localMtx ?? new Mat4f()).mul(mtx),
        [xName]: x + (iStart * layout.cell + xOffset),
        [offXName]: iStart + offX,
        [sizeXName]: iEnd - iStart,
    };
    return { subBlock, rangeOffset: [iEnd, xOffset] };
}


export function splitGridAll(layout: IModelLayout, blk: IBlkDef, dim: Dim) {
    let { dx } = dimProps(blk, dim);

    let nCells = Math.ceil(dx / layout.cell);

    let blocks: IBlkDef[] = [];
    let rangeOffsets: [number, number][] = [];

    for (let i = 0; i < nCells; i += 1) {
        let res = addSubBlock(layout, blk, dim, i, i + 1, 0)!;
        blocks.push(res.subBlock);
        rangeOffsets.push(res.rangeOffset);
    }

    if (dim === Dim.X) blk.rangeOffsetsX = rangeOffsets;
    if (dim === Dim.Y) blk.rangeOffsetsY = rangeOffsets;
    if (dim === Dim.Z) blk.rangeOffsetsZ = rangeOffsets;
    blk.subs = blocks;

    return blocks;
}

export interface IColorMix {
    color1?: Vec4;
    color2: Vec4;
    mixes: number[];
}

export function renderIndexes(state: IRenderState, layout: IModelLayout, blk: IBlkDef, color: Vec4, t: number, count: number = 4, offset: number = 0, data: Float32Array | null = null, mix?: IColorMix) {
    let { modelFontBuf: fontBuf, lineRender } = state;

    // Just rendering the 0, 1, 2 tokens, with plans to advance to the GPT text model etc

    count = count || 3;

    if (!data) {
        data = new Float32Array(count);
        for (let i = 0; i < count; i += 1) {
            data[i] = i + offset;
        }
    }

    // may scale with view
    let em = layout.cell * 1;

    let yLower = blk.y - em - layout.cell;// layout.cell * 2;

    let strParts = [];
    let textOffset = 0;
    let i = 0;
    for (let a of data) {
        if (i >= count) {
            break;
        }
        let w = measureTextWidth(fontBuf, '' + a, em);
        let space = Math.max(layout.cell, w);
        strParts.push({ val: a, textOffset, w, i, space });
        textOffset += space;
        i += 1;
    }

    let leftPos = cellPosition(layout, blk, Dim.X, offset);

    let mtxRes = Mat4f.fromTranslation(new Vec3(0, yLower, 0));
    let totalOffset = leftPos - textOffset / 2 + layout.cell * count / 2;
    color = color.mul(t);

    for (let a of strParts) {
        let x = totalOffset + a.textOffset + a.space / 2 - a.w / 2;

        let drawColor = color;
        if (mix) {
            let val = mix.mixes[a.i];
            if (val > 0.0) {
                drawColor = Vec4.lerp(color, mix.color2, val);
            }
        }

        writeTextToBuffer(fontBuf, '' + a.val, drawColor, x, 0, em, mtxRes);

        let tx = x + a.w / 2;
        let bx = cellPosition(layout, blk, Dim.X, a.i + offset) + layout.cell * 0.5;
        let top = yLower + em;
        let delta = 0.1 * em;
        let bot = Math.max(blk.y - 0.3, top);
        let thick = em * 0.02;
        // addLine(lineRender, thick, color, new Vec3(tx, 0, top), new Vec3(tx, 0, top - delta));
        addLine(lineRender, thick, drawColor, new Vec3(tx, top + delta, 0), new Vec3(bx, bot - delta, 0), new Vec3(0, 0, 1));
        // addLine(lineRender, thick, color, new Vec3(bx, 0, bot + delta), new Vec3(bx, 0, bot));
    }
}

export function indexMappingLines(state: IRenderState, layout: IModelLayout, blkSrc: IBlkDef, blkDest: IBlkDef, color: Vec4, srcPad: number, destPad: number, srcIdx: number, destIdx: number, lineFract: number) {

    // assume all in x-y plane, and idx's are in x, and src is above dest

    let top = blkSrc.y + blkSrc.dy + srcPad;
    let bot = blkDest.y - destPad;
    let midY = lerp(top, bot, lineFract);
    let z = 0; // blkSrc.z + blkSrc.dz;

    let srcX = cellPosition(layout, blkSrc, Dim.X, srcIdx) + layout.cell * 0.5;
    let destX = cellPosition(layout, blkDest, Dim.X, destIdx) + layout.cell * 0.5;

    // dogleg line, using only horizontal and vertical lines

    let n = new Vec3(0, 0, 1);
    let thick = layout.cell * 0.025;
    addLine(state.lineRender, thick, color, new Vec3(srcX, top, z), new Vec3(srcX, midY, z), n);
    addLine(state.lineRender, thick, color, new Vec3(srcX, midY, z), new Vec3(destX, midY, z), n);
    addLine(state.lineRender, thick, color, new Vec3(destX, midY, z), new Vec3(destX, bot, z), n);
}

/* Returns all subblocks along a given dimension that overlap the provided range

Used in combination with splitGrid. To find all blocks up to, but not including the target idx 3, use:

    findSubBlocks(blk, Dim.X, null, 3)

To find the exact block at idx 3, use:

    findSubBlocks(blk, Dim.X, 3, 3)

To find all blocks after idx 3, use:

    findSubBlocks(blk, Dim.X, 4, null)

*/
export function findSubBlocks(blk: IBlkDef, dim: Dim, idxLow: number | null, idxHi: number | null) {
    if (!blk.subs) {
        return [];
    }

    let offsets = dim === Dim.X ? blk.rangeOffsetsX : dim === Dim.Y ? blk.rangeOffsetsY : blk.rangeOffsetsZ;
    idxLow = idxLow === null ? null : Math.floor(idxLow);
    idxHi = idxHi === null ? null : Math.floor(idxHi);

    let subBlocks: IBlkDef[] = [];
    let startIdx = 0;
    for (let i = 0; i < blk.subs.length; i += 1) {
        let endIdx = offsets?.[i]?.[0];
        if (isNil(endIdx)) {
            break;
        }
        if ((idxLow === null || idxLow < endIdx) && (idxHi === null || idxHi >= startIdx)) {
            subBlocks.push(blk.subs[i]);
        }
        startIdx = endIdx;
    }
    return subBlocks;
}

export enum TextAlignVert {
    Top,
    Middle,
    Bottom,
}

export enum TextAlignHoriz {
    Left,
    Center,
    Right,
}

export interface IFontConfig {
    color?: Vec4; // default black
    align?: TextAlignHoriz; // default left
    valign?: TextAlignVert; // default top
    size?: number; // default 1
    face?: string; // default 'Roboto-Regular'
}

export function drawTextOnModel(state: IRenderState, text: string, pos: Vec3, cfg: IFontConfig) {
    let { modelFontBuf: fontBuf } = state;

    let color = cfg.color || new Vec4(0, 0, 0, 1);
    let align = cfg.align || TextAlignHoriz.Left;
    let valign = cfg.valign || TextAlignVert.Top;
    let size = cfg.size || 1;
    let face = cfg.face;

    let w = measureTextWidth(fontBuf, text, size);
    let h = size;

    let x = pos.x;
    let y = pos.y;
    let z = pos.z;

    if (align === TextAlignHoriz.Center) {
        x -= w / 2;
    } else if (align === TextAlignHoriz.Right) {
        x -= w;
    }

    if (valign === TextAlignVert.Middle) {
        y -= h / 2;
    } else if (valign === TextAlignVert.Bottom) {
        y -= h;
    }

    let mtxRes = Mat4f.fromTranslation(new Vec3(x, y, 0));

    writeTextToBuffer(fontBuf, text, color, 0, 0, size, mtxRes, face);
}


export function addSourceDestCurveLine(state: IRenderState, layout: IModelLayout, srcBlk: IBlkDef, destBlk: IBlkDef, srcIdx: Vec3, destIdx: Vec3, color: Vec4) {
    // assume always sampling in x-y plane
    // so ignoring the z component of the idx's

    let srcX = cellPosition(layout, srcBlk, Dim.X, srcIdx.x) + layout.cell * 0.5;
    let srcY = cellPosition(layout, srcBlk, Dim.Y, srcIdx.y) + layout.cell * 0.5;
    let srcZ = cellPosition(layout, srcBlk, Dim.Z, srcBlk.cz - 1) + layout.cell;

    let destX = cellPosition(layout, destBlk, Dim.X, destIdx.x) + layout.cell * 0.5;
    let destY = cellPosition(layout, destBlk, Dim.Y, destIdx.y) + layout.cell * 0.5;
    let destZ = cellPosition(layout, destBlk, Dim.Z, destBlk.cz - 1) + layout.cell;

    // want the curve to start & end at about 45deg from the x-y plane, and rise up in z
    // projected along the x-y plane, the curve should be straight line
    // we'll go for a circular arc, where the center of the circle is at the midpoint of the line, and at a fixed z height

    // may have to deal with different z heights of the src & dest blocks
    let srcPos = new Vec3(srcX, srcY, srcZ);
    let destPos = new Vec3(destX, destY, destZ);
    let midPos = srcPos.add(destPos).mul(0.5);

    let cVec = Vec3.cross(srcPos.sub(destPos), new Vec3(1.2, 1, 0)).normalize().mul(10);
    if (cVec.z > srcZ) {
        cVec = cVec.mul(-1);
    }
    let circleCenter = cVec.add(midPos);


    let radius = srcPos.dist(circleCenter);

    let theta = Math.asin(srcPos.dist(midPos) / radius) * 2.0;

    let n = Vec3.cross(circleCenter.sub(srcPos), circleCenter.sub(destPos)).normalize();

    let rotateVec = srcPos.sub(circleCenter);

    let count = 20;
    let prevP = srcPos;
    for (let i = 0; i <= count; i++) {
        let t = i / count;
        let p1 = circleCenter.add(rotateVec.rotateAbout(n, t * theta));
        addLine(state.lineRender, 3, color, prevP, p1);
        prevP = p1;
    }
    // arc from src to dest around circleCenter



}
