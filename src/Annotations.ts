import { cellPositionX, IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { addLine } from "./render/lineRender";
import { IRenderState } from "./render/modelRender";
import { measureTextWidth, writeTextToBuffer } from "./utils/font";
import { lerp, lerpSmoothstep } from "./utils/math";
import { Mat4f } from "./utils/matrix";
import { Vec3, Vec4 } from "./utils/vector";
import { Dim, DimStyle, dimStyleColor } from "./Walkthrough";

export function blockDimension(state: IRenderState, layout: IGptModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, t: number) {

    // Render |----- T ------| along the appropriate dimension

    let textPad = 1;
    let fontSize = 2;
    let text = DimStyle[style];

    let tw = measureTextWidth(state.modelFontBuf, text, fontSize);

    let start = cellPositionX(layout, blk, 0);
    let end = cellPositionX(layout, blk, blk.cx - 1) + layout.cell;
    let mid = (end + start) / 2;
    let botPad = fontSize * 0.2;
    let yOff = fontSize / 2 + botPad;
    let edgeH2 = fontSize / 2 * 0.5;

    let color = dimStyleColor(style).mul(t);

    let mtx = Mat4f.fromTranslation(new Vec3(mid, blk.y - botPad, blk.z + blk.dz));

    let textZOff = 0;
    let tooSmall = tw > end - start - textPad * 2;
    if (tooSmall) {
        textZOff = fontSize;
    }

    writeTextToBuffer(state.modelFontBuf, text, color, -tw / 2, -fontSize - textZOff, fontSize, mtx);

    let lY = blk.y - yOff;
    let lZ = blk.z + blk.dz;
    let thickness = fontSize * 0.02;
    let n = new Vec3(0, 0, 1);

    if (tooSmall) {
        textPad = 0;

    }

    addLine(state.lineRender, thickness, color, new Vec3(start, lY,          lZ), new Vec3(mid - textPad, lY,          lZ), n);
    addLine(state.lineRender, thickness, color, new Vec3(end,   lY,          lZ), new Vec3(mid + textPad, lY,          lZ), n);
    addLine(state.lineRender, thickness, color, new Vec3(start, lY + edgeH2, lZ), new Vec3(start,         lY - edgeH2, lZ), n);
    addLine(state.lineRender, thickness, color, new Vec3(end,   lY + edgeH2, lZ), new Vec3(end,           lY - edgeH2, lZ), n);
}

export function blockIndex(state: IRenderState, layout: IGptModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, idx: number, cellOffset: number, t: number) {
    if (t === 0) return;

    let fontSize = 2;
    let text = DimStyle[style] + '=' + Math.round(idx).toFixed(0);
    let font = '';

    let tw = measureTextWidth(state.modelFontBuf, text, fontSize, font);

    let cellL = cellPositionX(layout, blk, Math.floor(idx)) + layout.cell / 2;
    let cellR = cellPositionX(layout, blk, Math.ceil(idx)) + layout.cell / 2;
    let pos = lerp(cellL, cellR, idx - Math.floor(idx)) + lerpSmoothstep(0, cellOffset, Math.min(idx, 1));
    let botPad = fontSize * 0.5;

    let color = dimStyleColor(style).mul(t);

    let mtx = Mat4f.fromTranslation(new Vec3(pos, blk.y - botPad, blk.z + blk.dz));

    writeTextToBuffer(state.modelFontBuf, text, color, -tw / 2, -fontSize, fontSize, mtx, font);
}

export function dimProps(blk: IBlkDef, dim: Dim) {
    switch (dim) {
        case Dim.X: return { x: blk.x, cx: blk.cx, vecId: 0, xName: 'x', dxName: 'dx', mul: 1 };
        case Dim.Y: return { x: blk.y, cx: blk.cy, vecId: 1, xName: 'y', dxName: 'dy', mul: 1 };
        case Dim.Z: return { x: blk.z, cx: blk.cz, vecId: 2, xName: 'z', dxName: 'dz', mul: -1 };
    }
}

export function splitGridX(layout: IGptModelLayout, blk: IBlkDef, dim: Dim, xSplit: number, splitAmt: number) {
    // generate several new blocks (let's say up to 5) that are neighbouring the zSplit point

    // main-left, left, center, right, main-right

    // choose center as floor(zSplit), left is floor(zSplit) - 1, right is floor(zSplit) + 1
    // main-left and main-right are the remaining
    // only create those if there's space

    // The splitAmt governs the overall gap between blocks
    // Want a rotating-block-under-examination effect. When zSplit is right down the center (x + 0.5),
    // have max seperation, and effectively join left & right with their main
    // For non 0.5 zSplits, will show 2 gaps

    let { x, cx, vecId, xName, dxName, mul } = dimProps(blk, dim);

    let blocks: IBlkDef[] = [];
    let rangeOffsets: [number, number][] = [];

    function addSubBlock(iStart: number, iEnd: number, xOffset: number) {
        if (iStart >= iEnd || iEnd <= 0 || iStart >= cx) {
            return;
        }

        let scale = (iEnd - iStart) / cx;
        let translate = iStart / cx;

        let mtx = Mat4f.fromScaleTranslation(new Vec3(1,1,1).setAt(vecId, scale), new Vec3().setAt(vecId, translate));

        blocks.push({ ...blk,
            localMtx: mtx.mul(blk.localMtx ?? new Mat4f()),
            [xName]: x + (iStart * layout.cell + xOffset) * mul,
            [dxName]: (iEnd - iStart) * layout.cell,
        });
        rangeOffsets.push([iEnd, xOffset]);
    }

    let xc = Math.floor(xSplit);
    let scale = 0.5;
    let fract = (xSplit - xc - 0.5) * scale + 0.5;

    // let offset = smoothstepAlt(-w2, 0, xSplit / blk.cx);
    let offset = lerpSmoothstep(-splitAmt, 0, (xSplit - 0.5) * scale + 0.5);

    addSubBlock(0     , xc - 1, offset + 0.0);
    addSubBlock(xc - 1, xc    , offset + lerpSmoothstep(splitAmt, 0, fract + scale));
    addSubBlock(xc    , xc + 1, offset + lerpSmoothstep(splitAmt, 0, fract));
    addSubBlock(xc + 1, xc + 2, offset + lerpSmoothstep(splitAmt, 0, fract - scale));
    addSubBlock(xc + 2, cx, offset + splitAmt);

    if (blocks.length > 0) {
        if (dim === Dim.X) blk.rangeOffsetsX = rangeOffsets;
        if (dim === Dim.Y) blk.rangeOffsetsY = rangeOffsets;
        if (dim === Dim.Z) blk.rangeOffsetsZ = rangeOffsets;
        blk.subs = blocks;
    }
}

export interface IColorMix {
    color2: Vec4;
    mixes: number[];
}

export function renderIndexes(state: IRenderState, layout: IGptModelLayout, blk: IBlkDef, color: Vec4, t: number, count: number = 4, offset: number = 0, data: Float32Array | null = null, mix?: IColorMix) {
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

    let leftPos = cellPositionX(layout, blk, offset);

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
        let bx = cellPositionX(layout, blk, a.i + offset) + layout.cell * 0.5;
        let top = yLower + em;
        let delta = 0.1 * em;
        let bot = Math.max(blk.y - 0.3, top);
        let thick = em * 0.02;
        // addLine(lineRender, thick, color, new Vec3(tx, 0, top), new Vec3(tx, 0, top - delta));
        addLine(lineRender, thick, drawColor, new Vec3(tx, top + delta, 0), new Vec3(bx, bot - delta, 0), new Vec3(0, 0, 1));
        // addLine(lineRender, thick, color, new Vec3(bx, 0, bot + delta), new Vec3(bx, 0, bot));
    }
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

    let subBlocks: IBlkDef[] = [];
    let startIdx = 0;
    for (let i = 0; i < blk.subs.length; i += 1) {
        let endIdx = offsets![i][0];
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
