


import { IFontOpts, measureText, drawText } from "../render/fontRender";
import { ILineOpts, makeLineOpts, addLine2 } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { addQuad } from "../render/triRender";
import { isNotNil, isNil } from "@/src/utils/data";
import { lerp } from "@/src/utils/math";
import { Mat4f } from "@/src/utils/matrix";
import { Vec3, Vec4 } from "@/src/utils/vector";
import { drawRoundedRect } from "./DataFlow";
import { drawLineRect } from "./ModelCard";
import { TextAlignHoriz } from "../Annotations";

/*

We make a simple text/math layout engine!

We can't do direct rendering since things need to be layed out first, and information propagates upwards.

Let's first define a simple text block, and see where that leads. We're going to do a sqrt()
*/

export interface ITextBlock {
    type: TextBlockType;
    id?: string;
    text?: string;
    align?: TextAlignHoriz;
    opts: IFontOpts;
    size: Vec3;
    offset: Vec3;
    subs?: ITextBlock[];
    cellX?: number;
    cellY?: number;
    rectOpts?: ILineOpts;
    draw?: (blk: ITextBlock, render: IRenderState) => void;
}

export interface ITextBlockArgs {
    type?: TextBlockType;
    id?: string;
    text?: string;
    align?: TextAlignHoriz;
    opts?: IFontOpts;
    rectOpts?: ILineOpts;
    color?: Vec4;
    size?: Vec3;
    offset?: Vec3;
    draw?: (blk: ITextBlock, render: IRenderState) => void;
    subs?: (ITextBlockArgs | null)[];
    cellX?: number;
    cellY?: number;
}

export enum TextBlockType {
    Line,
    Text,
    Sqrt,
    Divide,
    Cells,
    Custom,
}

export function lineHeight(fontOpts: IFontOpts) {
    return fontOpts.size * 1.2;
}

export function mkTextBlock(args: ITextBlockArgs): ITextBlock {
    let type = args.type ?? (
        args.text ? TextBlockType.Text :
        args.subs ? TextBlockType.Line :
        (isNotNil(args.cellX) && isNotNil(args.cellY)) ? TextBlockType.Cells :
        null);

    if (isNil(type)) {
        throw new Error('Unknown text block type');
    }

    let opts = args.opts;
    if (opts && args.color) {
        opts = { ...opts, color: args.color };
    }

    if (!opts) {
        throw new Error('No font opts');
    }

    return {
        type: type,
        id: args.id,
        text: args.text,
        align: args.align,
        opts: opts!,
        size: args.size ?? new Vec3(0, 0, 0),
        offset: args.offset ?? new Vec3(0, 0, 0),
        subs: args.subs?.filter(isNotNil).map(a => mkTextBlock({ ...a, opts: a.opts ?? opts })),
        rectOpts: args.rectOpts,
        draw: args.draw,
        cellX: args.cellX,
        cellY: args.cellY,
    };
}


function sqrtSpacing(opts: IFontOpts, inner: ITextBlock) {
    return {
        tl: new Vec3(inner.size.y * 0.9, inner.size.y * 0.2),
        br: new Vec3(inner.size.y * 0.1, 0.0),
    };
}

function divideSpacing(opts: IFontOpts, inner: ITextBlock) {
    return {
        padX: 0,
        padInnerY: inner.size.y * 0.5,
    };
}

let cellSize = 7.0;

function cellSizing(blk: ITextBlock) {
    return {
        size: new Vec3(blk.cellX! * cellSize, blk.cellY! * cellSize),
        pad: cellSize * 1.0,
    };
}

export function sizeBlock(render: IRenderState, blk: ITextBlock) {
    let opts = blk.opts;
    switch (blk.type) {

    case TextBlockType.Line: {
        let x = 0;
        // middle-align all the sub-blocks
        // so height is the max height
        let maxH = 0;
        for (let sub of blk.subs!) {
            sizeBlock(render, sub);
            x += sub.size.x;
            maxH = Math.max(maxH, sub.size.y);
        }
        blk.size = new Vec3(x, maxH, 0);
        if (blk.rectOpts) {
            blk.size.x += cellSize * 0.5;
            blk.size.y += cellSize * 0.5;
        }
        break;
    }
    case TextBlockType.Text: {
        if (isNil(blk.text)) {
            throw new Error('Text block has no text');
        }
        blk.size = new Vec3(
            Math.max(blk.size.x, measureText(render.modelFontBuf, blk.text!, opts)),
            lineHeight(opts),
        );
        break;
    }
    case TextBlockType.Sqrt: {
        let sub = blk.subs![0];
        sizeBlock(render, sub);
        let spacing = sqrtSpacing(opts, sub);
        blk.size = sub.size.add(spacing.tl).add(spacing.br);
        break;
    }
    case TextBlockType.Divide: {
        let subA = blk.subs![0];
        let subB = blk.subs![1];
        sizeBlock(render, subA);
        sizeBlock(render, subB);
        let spacing = divideSpacing(opts, subA);
        blk.size = new Vec3(Math.max(subA.size.x, subB.size.x) + spacing.padX, subA.size.y + subB.size.y + spacing.padInnerY, 0);
        break;
    }
    case TextBlockType.Cells: {
        let spacing = cellSizing(blk);
        blk.size = new Vec3(spacing.size.x + spacing.pad, spacing.size.y);
        break;
    }
    case TextBlockType.Custom: {
        // already sized
        break;
    }
    default: { let _exhaustCheck: never = blk.type; }
    }
}

export function layoutBlock(blk: ITextBlock) {
    switch (blk.type) {
    case TextBlockType.Line: {
        let x = blk.offset.x + cellSize * 0.25;
        let midY = blk.offset.y + blk.size.y / 2;
        for (let sub of blk.subs!) {
            sub.offset = new Vec3(x, midY - sub.size.y / 2).round_();
            layoutBlock(sub);
            x += sub.size.x;
        }
        break;
    }
    case TextBlockType.Sqrt: {
        let sub = blk.subs![0];
        sub.offset = blk.offset.add(sqrtSpacing(blk.opts, sub).tl).round_();
        layoutBlock(sub);
        break;
    }
    case TextBlockType.Divide: {
        let subA = blk.subs![0];
        let subB = blk.subs![1];
        let midX = blk.size.x / 2;
        subA.offset = blk.offset.add(new Vec3(midX - subA.size.x / 2, 0)).round_();
        subB.offset = blk.offset.add(new Vec3(midX - subB.size.x / 2, blk.size.y - subB.size.y)).round_();
        layoutBlock(subA);
        layoutBlock(subB);
        break;
    }
    case TextBlockType.Text: {
        break;
    }
    case TextBlockType.Cells: {
        break;
    }
    case TextBlockType.Custom: {
        break;
    }
    default: { let _exhaustCheck: never = blk.type; }
    }
}

export function drawBlock(render: IRenderState, blk: ITextBlock) {

    switch (blk.type) {
    case TextBlockType.Line: {
        for (let sub of blk.subs!) {
            drawBlock(render, sub);
        }
        if (blk.rectOpts) {
            let rectOpts = makeLineOpts(blk.rectOpts);
            let tl = blk.offset.round().add(new Vec3(0.5, 0.5));
            let br = blk.offset.add(blk.size).round().add(new Vec3(0.5, 0.5));
            drawRoundedRect(render, tl, br, rectOpts.color.mul(0.24), rectOpts.mtx, 2);
            drawLineRect(render, tl, br, rectOpts);
        }
        break;
    }
    case TextBlockType.Text: {
        let xPos = blk.offset.x;
        if (blk.align === TextAlignHoriz.Right) {
            xPos = blk.offset.x + blk.size.x - measureText(render.modelFontBuf, blk.text!, blk.opts);
        }
        drawText(render.modelFontBuf, blk.text!, xPos, blk.offset.y + blk.opts.size * 0.1, blk.opts);
        break;
    }
    case TextBlockType.Sqrt: {
        let sub = blk.subs![0];

        let subY = sub.size.y;

        let sqrtX = blk.offset.x;
        let sqrtY = blk.offset.y - subY * 0.9;
        let sqrtSize = subY * 1.8;

        let mathOpts: IFontOpts = { ...blk.opts, faceName: 'cmsy10', size: sqrtSize };

        let lineOpts = makeLineOpts({ color: blk.opts.color, n: new Vec3(0,0,1), mtx: blk.opts.mtx, thick: 0.4 });
        let lineX = sqrtX + sqrtSize * 0.5;
        let lineY = sqrtY + sqrtSize * 0.5;
        addLine2(render.lineRender, new Vec3(lineX, lineY).round_(), new Vec3(sub.offset.x + sub.size.x, lineY).round_(), lineOpts);

        drawText(render.modelFontBuf, '\u0070', sqrtX, sqrtY, mathOpts);
        drawBlock(render, sub);
        break;
    }
    case TextBlockType.Divide: {
        let subA = blk.subs![0];
        let subB = blk.subs![1];

        let lineOpts = makeLineOpts({ color: blk.opts.color, n: new Vec3(0,0,1), mtx: blk.opts.mtx, thick: 0.4 });
        let lineY = lerp(subA.offset.y + subA.size.y, subB.offset.y, 0.5) + 1.0;
        addLine2(render.lineRender, new Vec3(blk.offset.x, lineY), new Vec3(blk.offset.x + blk.size.x, lineY), lineOpts);

        drawBlock(render, blk.subs![0]);
        drawBlock(render, blk.subs![1]);
        break;
    }
    case TextBlockType.Cells: {
        let center = blk.offset.add(new Vec3(blk.size.x / 2, blk.size.y / 2));
        let spacing = cellSizing(blk);

        drawCells(render, new Vec3(blk.cellX!, blk.cellY!), center, spacing.size, blk.opts.color, blk.opts.mtx);

        break;
    }
    case TextBlockType.Custom: {
        blk.draw?.(blk, render);
        break;
    }
    default: { let _exhaustCheck: never = blk.type; }
    }
}

export function drawCells(render: IRenderState, nCells: Vec3, center: Vec3, size: Vec3, color: Vec4, mtx?: Mat4f) {
        let thick = 0.4;
        let tl = center.mulAdd(size, -0.5).add(new Vec3(0.5, 0.5));
        let br = center.mulAdd(size, 0.5).add(new Vec3(0.5, 0.5));
        let lineOpts = makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick });

        drawLineRect(render, tl, br, lineOpts);
        addQuad(render.triRender, tl, br, color.mul(0.3), mtx);

        for (let i = 1; i < nCells.x; i++) {
            let lineX = tl.x + i * cellSize;
            addLine2(render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        for (let i = 1; i < nCells.y; i++) {
            let lineY = tl.y + i * cellSize;
            addLine2(render.lineRender, new Vec3(tl.x, lineY, 0), new Vec3(br.x, lineY, 0), lineOpts);
        }
}
