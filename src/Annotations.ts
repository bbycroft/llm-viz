import { cellPositionX, IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { addLine } from "./render/lineRender";
import { IRenderState } from "./render/modelRender";
import { measureTextWidth, writeTextToBuffer } from "./utils/font";
import { lerp, lerpSmoothstep } from "./utils/math";
import { Mat4f } from "./utils/matrix";
import { Vec3 } from "./utils/vector";
import { Dim, DimStyle, dimStyleColor } from "./Walkthrough";

export function blockDimension(state: IRenderState, layout: IGptModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, t: number) {

    // Render |----- T ------| along the appropriate dimension

    let textPad = 1;
    let fontSize = 2;
    let text = DimStyle[style];

    let tw = measureTextWidth(state.modelFontBuf, text, fontSize);

    let bot = cellPositionX(layout, blk, 0);
    let top = cellPositionX(layout, blk, blk.cx - 1) + layout.cell;
    let mid = (top + bot) / 2;
    let botPad = fontSize * 0.2;
    let zOff = fontSize / 2 + botPad;
    let edgeH2 = fontSize / 2 * 0.5;

    let color = dimStyleColor(style);

    let mtx = Mat4f.fromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    mtx = Mat4f.fromTranslation(new Vec3(mid, blk.y, blk.z + botPad)).mul(mtx);

    writeTextToBuffer(state.modelFontBuf, text, color, -tw / 2, -fontSize, fontSize, mtx);

    let lY = blk.y;
    let lZ = blk.z + zOff;
    let thickness = fontSize * 0.02;
    let n = new Vec3(0, -1, 0);

    addLine(state.lineRender, thickness, color, new Vec3(bot, lY, lZ), new Vec3(mid - textPad, lY, lZ), n);
    addLine(state.lineRender, thickness, color, new Vec3(top, lY, lZ), new Vec3(mid + textPad, lY, lZ), n);
    addLine(state.lineRender, thickness, color, new Vec3(bot, lY, lZ + edgeH2), new Vec3(bot, lY, lZ - edgeH2), n);
    addLine(state.lineRender, thickness, color, new Vec3(top, lY, lZ + edgeH2), new Vec3(top, lY, lZ - edgeH2), n);
}

export function blockIndex(state: IRenderState, layout: IGptModelLayout, blk: IBlkDef, dim: Dim, style: DimStyle, idx: number, cellOffset: number, t: number) {

    // Render  T along the appropriate dimension

    let textPad = 1;
    let fontSize = 2;
    let text = DimStyle[style] + '=' + Math.round(idx).toFixed(0);
    let font = '';

    let tw = measureTextWidth(state.modelFontBuf, text, fontSize, font);

    let cellL = cellPositionX(layout, blk, Math.floor(idx)) + layout.cell / 2;
    let cellR = cellPositionX(layout, blk, Math.ceil(idx)) + layout.cell / 2;
    let pos = lerp(cellL, cellR, idx - Math.floor(idx)) + lerpSmoothstep(0, cellOffset, Math.min(idx, 1));
    let botPad = fontSize * 0.5;
    let zOff = fontSize / 2 + botPad;
    let edgeH2 = fontSize / 2 * 0.5;

    let color = dimStyleColor(style);

    let mtx = Mat4f.fromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    mtx = Mat4f.fromTranslation(new Vec3(pos, blk.y, blk.z + botPad)).mul(mtx);

    writeTextToBuffer(state.modelFontBuf, text, color, -tw / 2, -fontSize, fontSize, mtx, font);

    let lY = blk.y;
    let lZ = blk.z + zOff;
    let thickness = fontSize * 0.02;
    let n = new Vec3(0, -1, 0);

    // addLine(state.lineRender, thickness, color, new Vec3(bot, lY, lZ), new Vec3(mid - textPad, lY, lZ), n);
    // addLine(state.lineRender, thickness, color, new Vec3(top, lY, lZ), new Vec3(mid + textPad, lY, lZ), n);
    // addLine(state.lineRender, thickness, color, new Vec3(bot, lY, lZ + edgeH2), new Vec3(bot, lY, lZ - edgeH2), n);
    // addLine(state.lineRender, thickness, color, new Vec3(top, lY, lZ + edgeH2), new Vec3(top, lY, lZ - edgeH2), n);
}
