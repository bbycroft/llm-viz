import { camScaleToScreen } from "../Camera";
import { BlKDepSpecial, cellPosition, IBlkDef } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText } from "../render/fontRender";
import { addLine2, drawLineSegs, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { RenderPhase } from "../render/sharedRender";
import { addPrimitiveRestart, addQuad, addVert } from "../render/triRender";
import { isNil, isNotNil, makeArray } from "../utils/data";
import { lerp } from "../utils/math";
import { Mat4f } from "../utils/matrix";
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { drawLineRect } from "./ModelCard";

export function drawDataFlow(state: IProgramState, blk: IBlkDef, destIdx: Vec3) {
    if (!blk.deps) {
        return;
    }
    state.render.sharedRender.activePhase = RenderPhase.Overlay2D;

    let cellPos = new Vec3(
        cellPosition(state.layout, blk, Dim.X, destIdx.x) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Y, destIdx.y) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Z, destIdx.z) + state.layout.cell * 1.1,
    );

    // let cellPos = new Vec3(
    //     (cellPosition(state.layout, blk, Dim.X, 0) + cellPosition(state.layout, blk, Dim.X, blk.cx - 1)) * 0.5,
    //     cellPosition(state.layout, blk, Dim.Y, 0) - state.layout.cell * 0.5,
    //     cellPosition(state.layout, blk, Dim.Z, 0) + state.layout.cell * 0.5,
    // );

    // let screenPos = projectToScreen(state, cellPos);

    let mtx = new Mat4f();
    // let mtx = Mat4f.fromColMajor(state.camera.lookAtMtx);
    // mtx[12] = 0.0;
    // mtx[13] = 0.0;
    // mtx[14] = 0.0;
    // let mtxT = Mat4f.fromTranslation(cellPos);
    // let mtxTInv = Mat4f.fromTranslation(cellPos.mul(-1));
    // mtx = mtx.invert();
    // console.log(mtx.toString());

    let camDir = cellPos.sub(state.camera.camPosModel).normalize();
    let camUp = new Vec3(0, 1, 0);
    let camRight = Vec3.cross(camDir, camUp).normalize();
    let camUp2 = Vec3.cross(camRight, camDir).normalize();

    mtx[0] = camRight.x;
    mtx[1] = camRight.y;
    mtx[2] = camRight.z;
    mtx[4] = camUp2.x;
    mtx[5] = camUp2.y;
    mtx[6] = camUp2.z;
    mtx[8] = camDir.x;
    mtx[9] = camDir.y;
    mtx[10] = camDir.z;

    let scale = camScaleToScreen(state, cellPos);
    scale = 1.0; // Math.min(scale, 1);

    let screenPos = projectToScreen(state, cellPos);
    screenPos.x = Math.round(screenPos.x);
    screenPos.y = Math.round(screenPos.y);
    let mtxT = Mat4f.fromTranslation(screenPos);
    let mtxTInv = Mat4f.fromTranslation(screenPos.mul(-1));

    let scaleMtx = Mat4f.fromScale(new Vec3(1, 1, 1).mul(scale));
    // let translateMtx = Mat4f.fromTranslation(new Vec3(0, 0, -20 + cellPos.z));

    let resMtx = mtxT.mul(scaleMtx).mul(mtxTInv); //.mul(translateMtx);

    // console.log(resMtx.toString());

    let center = screenPos.add(new Vec3(0, -50)); // cellPos.add(new Vec3(0, -3, -cellPos.z));

    if (blk.deps.special === BlKDepSpecial.InputEmbed) {
        drawOLAddSymbol(state, center, scale, resMtx);
        drawOLIndexLookup(state, center, scale, resMtx);
        drawOLPosEmbedLookup(state, center, scale, resMtx);
    }
    else if (blk.deps.dot) {
        drawOLMatrixMul(state, center, scale, resMtx, blk);
    }
    else if (blk.deps.special === BlKDepSpecial.LayerNorm) {
        drawLayerNorm(state, center, resMtx);
    } else if (blk.deps.special === BlKDepSpecial.LayerNormMu) {
        drawLayerNormMuAgg(state, center, resMtx);
    } else if (blk.deps.special === BlKDepSpecial.LayerNormSigma) {
        drawLayerNormSigmaAgg(state, center, resMtx);
    } else if (blk.deps.add && blk.deps.add.length === 2) {
        drawResidualAdd(state, center, resMtx);
    }
}

export function drawOLAddSymbol(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {

    let color = opColor;
    let innerColor = new Vec4(1.0, 1.0, 1.0, 1).mul(0.6);
    let width = 1;
    let radius = 15;
    drawCircle(state.render, center, radius, width * scale, color, mtx);
    drawCirclePlane(state.render, center, radius, innerColor, mtx);

    let textOpts: IFontOpts = { color: color, mtx, size: 40 };
    let tw = measureText(state.render.modelFontBuf, '+', textOpts);

    drawText(state.render.modelFontBuf, '+', center.x - tw / 2, center.y - textOpts.size * 0.5, textOpts);
}

export function drawCircle(render: IRenderState, center: Vec3, radius: number, width: number, color: Vec4, mtx: Mat4f) {
    let nPoints = 30;

    let buf = new Float32Array(nPoints * 3);
    for (let i = 0; i < nPoints; i++) {
        let theta = i / nPoints * Math.PI * 2;
        buf[i * 3 + 0] = center.x + Math.cos(theta) * radius;
        buf[i * 3 + 1] = center.y + Math.sin(theta) * radius;
        buf[i * 3 + 2] = center.z;
    }

    drawLineSegs(render.lineRender, buf, makeLineOpts({ color, n: new Vec3(0, 0, 1), thick: width, closed: true, mtx }))
}

export function drawCirclePlane(render: IRenderState, center: Vec3, radius: number, color: Vec4, mtx: Mat4f) {
    let nPoints = 30;
    let n = new Vec3(0, 0, 1);

    for (let i = 0; i < nPoints + 1; i++) {
        let theta = i / nPoints * Math.PI * 2;
        let p = new Vec3(
            center.x + Math.cos(theta) * radius,
            center.y + Math.sin(theta) * radius,
            center.z,
        );

        addVert(render.triRender, center, color, n, mtx);
        addVert(render.triRender, p, color, n, mtx);
    }
    addPrimitiveRestart(render.triRender);
}

function projectToScreen(state: IProgramState, modelPos: Vec3) {
    let model = state.camera.modelMtx;
    let view = state.camera.viewMtx;

    let ndc = view.mulVec3Proj(model.mulVec3Affine(modelPos));

    return new Vec3(
        (ndc.x + 1) * 0.5 * state.render.size.x,
        (1 - ndc.y) * 0.5 * state.render.size.y,
        0);
}

let weightSrcColor = new Vec4(0.3, 0.3, 0.7, 1);
let workingSrcColor = new Vec4(0.3, 0.7, 0.3, 1);

let opColor = new Vec4(0.9, 0.5, 0.5, 1);
let backWhiteColor = new Vec4(0.0, 0.0, 0.0, 1).mul(1.0);
let nameColor = new Vec4(1.0, 1.0, 1.0, 1);
let embedBlockHeight = 30;
let tokEmbedBlockWidth = 40;
let posEmbedBlockWidth = 35;

export function drawOLIndexLookup(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {

    let pos = center.add(new Vec3(-50, 0, 0));
    let color = new Vec4(0.3, 0.3, 0.7, 1);

    let tl = pos.add(new Vec3(-tokEmbedBlockWidth/2, -embedBlockHeight/2));
    let br = pos.add(new Vec3(tokEmbedBlockWidth/2,  embedBlockHeight/2));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.5 * scale }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 8;
    let colTl = new Vec3(tl.x + 10, tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + 8);
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let lineColor = dimStyleColor(DimStyle.TokenIdx);
    let lineEndX = colTl.x + colW / 2;
    let lineEndY = colTl.y - 5;
    let lineStartX = center.x;
    let lineHeight = 20;

    let pts = new Float32Array([
        lineStartX, lineEndY - 2 * lineHeight, 0,
        lineStartX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY, 0,
    ]);
    let lineOpts = makeLineOpts({ color: lineColor, mtx, n: new Vec3(0, 0, 1), thick: 1.5 * scale });
    drawLineSegs(state.render.lineRender, pts, lineOpts);
}

export function drawOLPosEmbedLookup(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {
    let pos = center.add(new Vec3(50, 0, 0));
    let color = weightSrcColor;

    let tl = pos.add(new Vec3(-posEmbedBlockWidth/2, -embedBlockHeight/2)); 
    let br = pos.add(new Vec3(posEmbedBlockWidth/2,  embedBlockHeight/2));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.05 * scale }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 8;
    let colTl = new Vec3(tl.x + 15, tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + 8);
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let textOpts: IFontOpts = { color: color, mtx, size: 20 };
    let tw = measureText(state.render.modelFontBuf, 't', textOpts);

    drawText(state.render.modelFontBuf, 't', (cellTl.x + cellBr.x) / 2 - tw / 2, colTl.y - 3 - textOpts.size, textOpts);
}


export function drawOLMatrixMul(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f, blk: IBlkDef) {

    let cellSize = 7.0;

    function drawRowCol(pos: Vec3, color: Vec4, isRow: boolean, nCells: number) {

        let nCellsX = isRow ? nCells : 1;
        let nCellsY = isRow ? 1 : nCells;
        let thick = 0.4 * scale;

        let tl = pos.add(new Vec3(0                 , -cellSize * nCellsY / 2));
        let br = pos.add(new Vec3(cellSize * nCellsX,  cellSize * nCellsY / 2));
        let lineOpts = makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick });

        drawLineRect(state.render, tl, br, lineOpts);
        addQuad(state.render.triRender, tl, br, color.mul(0.3), mtx);

        for (let i = 1; i < nCellsX; i++) {
            let lineX = tl.x + i * cellSize;
            addLine2(state.render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        for (let i = 1; i < nCellsY; i++) {
            let lineY = tl.y + i * cellSize;
            addLine2(state.render.lineRender, new Vec3(tl.x, lineY, 0), new Vec3(br.x, lineY, 0), lineOpts);
        }
    }

    let dotA = blk.deps!.dot![0];
    let dotB = blk.deps!.dot![1];

    let dotAColor = dotA.src.t === 'w' ? weightSrcColor : workingSrcColor;
    let dotBColor = dotB.src.t === 'w' ? weightSrcColor : workingSrcColor;

    let dotAIsRow = dotA.srcIdxMtx.g(0, 3) === 1.0;
    let dotBIsRow = dotB.srcIdxMtx.g(0, 3) === 1.0;

    let dotAW = cellSize * (dotAIsRow ? 4 : 1);
    let dotBW = cellSize * (dotBIsRow ? 4 : 1);

    let pad = 4.0;

    let hasAdd = !!blk.deps!.add;
    let addW = hasAdd ? cellSize : -pad;

    let textOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textY = center.y - textOpts.size * 0.56;

    let commaText = ',';
    let commaTw = measureText(state.render.modelFontBuf, commaText, textOpts);

    let dotBeginText = hasAdd ? '+ dot(' : 'dot(';
    let dotBeginW = measureText(state.render.modelFontBuf, dotBeginText, textOpts);

    let dotEndText = ')';
    let dotEndW = measureText(state.render.modelFontBuf, dotEndText, textOpts);

    let { total, locs: [addX, dotBeginX, dotAX, commaTX, dotBX, dotEndX] } = layout1d({ pad, anchor: center.x, justify: LayoutAlign.Middle }, addW, dotBeginW, dotAW, commaTw, dotBW, dotEndW);

    let nameTextOpts = { color: nameColor, mtx, size: 2.0 };
    let nameW = measureText(state.render.modelFontBuf, blk.name, nameTextOpts);

    let h = 40;
    let halfW = Math.max(nameW, total) / 2 + pad * 2;
    // let nameHeight = nameTextOpts.size * 0.9;

    drawRoundedRect(state.render, center.add(new Vec3(-halfW, -h/2)), center.add(new Vec3(halfW, h/2)), backWhiteColor, mtx, 5.0);

    drawRowCol(new Vec3(dotAX, center.y), dotAColor, dotAIsRow, 4);
    drawRowCol(new Vec3(dotBX, center.y), dotBColor, dotBIsRow, 4);

    if (hasAdd) {
        drawRowCol(new Vec3(addX, center.y), weightSrcColor, false, 1);
    }

    drawText(state.render.modelFontBuf, dotBeginText, dotBeginX, textY, textOpts);
    drawText(state.render.modelFontBuf, commaText,    commaTX,   textY, textOpts);
    drawText(state.render.modelFontBuf, dotEndText,   dotEndX,   textY, textOpts);

    // drawText(state.render.modelFontBuf, blk.name, center.x - nameW / 2, center.y - h / 2 - nameHeight, nameTextOpts);
}

export function drawRoundedRect(state: IRenderState, tl: Vec3, br: Vec3, color: Vec4, mtx: Mat4f, radius: number) {

    if (radius === 0) {
        addQuad(state.triRender, tl, br, color, mtx);
        return;
    }

    radius = Math.min(radius, (br.x - tl.x) / 2, (br.y - tl.y) / 2);

    let n = new Vec3(0, 0, 1);
    let innerQuadTl = tl.add(new Vec3(radius, radius));
    let innerQuadBr = br.sub(new Vec3(radius, radius));

    // inner quad
    addQuad(state.triRender, innerQuadTl, innerQuadBr, color, mtx);

    // bottom right starting point
    addVert(state.triRender, new Vec3(innerQuadBr.x, br.y), color, n, mtx);
    addVert(state.triRender, new Vec3(innerQuadBr.x, innerQuadBr.y), color, n, mtx);

    for (let cIdx = 0; cIdx < 4; cIdx++) {
        let pivot = new Vec3(
            cIdx < 2 ? innerQuadTl.x : innerQuadBr.x,
            (cIdx + 1) % 4 < 2 ? innerQuadBr.y : innerQuadTl.y,
        );

        let startTheta = ((cIdx + 1) % 4) * Math.PI / 2;

        // pivot around each of the 4 corners
        let nRadiusVerts = 6;
        for (let i = 0; i < nRadiusVerts + 1; i++) {
            let pt = new Vec3(
                pivot.x + radius * Math.cos(startTheta + i * Math.PI / nRadiusVerts / 2),
                pivot.y + radius * Math.sin(startTheta + i * Math.PI / nRadiusVerts / 2),
            )
            addVert(state.triRender, pt, color, n, mtx);
            addVert(state.triRender, pivot, color, n, mtx);
        }
    }
    addPrimitiveRestart(state.triRender);
}


enum LayoutAlign {
    Start,
    Middle,
    End,
}

interface ILayout1dOpts {
    anchor?: number; // default 0
    pad?: number; // default 0
    justify?: LayoutAlign; // default: Start
}

interface ILayout1dRes {
    total: number;
    locs: number[];
}

function layout1d(opts: ILayout1dOpts, ...widths: number[]): ILayout1dRes {
    let pad = opts.pad || 0;
    let anchor = opts.anchor || 0;
    let justify = opts.justify || LayoutAlign.Start;

    let totalWidth = pad * (widths.length - 1);
    for (let i = 0; i < widths.length; i++) {
        totalWidth += widths[i];
    }

    let start = justify === LayoutAlign.Start ? anchor : justify === LayoutAlign.Middle ? anchor - totalWidth / 2 : anchor - totalWidth;

    let locs = makeArray(widths.length, 0.0);
    let xPos = start;

    for (let i = 0; i < widths.length; i++) {
        locs[i] = xPos;
        let w = widths[i];
        xPos += w + pad;
    }

    return { total: totalWidth, locs };
}




/*

We make a simple text/math layout engine!

We can't do direct rendering since things need to be layed out first, and information propagates upwards.

Let's first define a simple text block, and see where that leads. We're going to do a sqrt()
*/

interface ITextBlock {
    type: TextBlockType;
    text?: string;
    opts: IFontOpts;
    size: Vec3;
    offset: Vec3;
    subs?: ITextBlock[];
    cellX?: number;
    cellY?: number;
}

interface ITextBlockArgs {
    type?: TextBlockType;
    text?: string;
    opts?: IFontOpts;
    size?: Vec3;
    offset?: Vec3;
    subs?: ITextBlockArgs[];
    cellX?: number;
    cellY?: number;
}

enum TextBlockType {
    Line,
    Text,
    Sqrt,
    Divide,
    Cells,
}

function lineHeight(fontOpts: IFontOpts) {
    return fontOpts.size * 1.2;
}

function mkTextBlock(args: ITextBlockArgs): ITextBlock {
    let type = args.type ?? (
        args.text ? TextBlockType.Text :
        args.subs ? TextBlockType.Line :
        (isNotNil(args.cellX) && isNotNil(args.cellY)) ? TextBlockType.Cells :
        null);

    if (isNil(type)) {
        throw new Error('Unknown text block type');
    }

    return {
        type: type,
        text: args.text,
        opts: args.opts!,
        size: args.size ?? new Vec3(0, 0, 0),
        offset: args.offset ?? new Vec3(0, 0, 0),
        subs: args.subs?.map(a => mkTextBlock({ ...a, opts: a.opts ?? args.opts })),
        cellX: args.cellX,
        cellY: args.cellY,
    };
}


function sqrtSpacing(opts: IFontOpts, inner: ITextBlock) {
    return {
        tl: new Vec3(inner.size.y * 1.05, inner.size.y * 0.5),
        br: new Vec3(inner.size.y * 0.1, 0.0),
    };
}

function divideSpacing(opts: IFontOpts, inner: ITextBlock) {
    return {
        padX: 0,
        padInnerY: inner.size.y * 0.1,
    };
}

let cellSize = 7.0;

function cellSizing(blk: ITextBlock) {
    return {
        size: new Vec3(blk.cellX! * cellSize, blk.cellY! * cellSize),
        pad: cellSize * 1.0,
    };
}

function sizeBlock(render: IRenderState, blk: ITextBlock) {
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
        break;
    }
    case TextBlockType.Text: {
        blk.size = new Vec3(
            measureText(render.modelFontBuf, blk.text!, opts),
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
    default: { let _exhaustCheck: never = blk.type; }
    }
}

function layoutBlock(blk: ITextBlock) {
    switch (blk.type) {
    case TextBlockType.Line: {
        let x = blk.offset.x;
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
    default: { let _exhaustCheck: never = blk.type; }
    }
}

function drawBlock(render: IRenderState, blk: ITextBlock) {

    switch (blk.type) {
    case TextBlockType.Line: {
        for (let sub of blk.subs!) {
            drawBlock(render, sub);
        }
        break;
    }
    case TextBlockType.Text: {
        drawText(render.modelFontBuf, blk.text!, blk.offset.x, blk.offset.y, blk.opts);
        break;
    }
    case TextBlockType.Sqrt: {
        let sub = blk.subs![0];
        
        let subY = sub.size.y;

        let sqrtX = blk.offset.x;
        let sqrtY = blk.offset.y - subY * 0.6;
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
        let lineY = lerp(subA.offset.y + subA.size.y, subB.offset.y, 0.5) + 2.0;
        addLine2(render.lineRender, new Vec3(blk.offset.x, lineY), new Vec3(blk.offset.x + blk.size.x, lineY), lineOpts);

        drawBlock(render, blk.subs![0]);
        drawBlock(render, blk.subs![1]);
        break;
    }
    case TextBlockType.Cells: {
        let nCellsX = blk.cellX!;
        let nCellsY = blk.cellY!;
        let thick = 0.4;
        let center = blk.offset.add(new Vec3(blk.size.x / 2, blk.size.y / 2));
        let spacing = cellSizing(blk);

        let tl = center.mulAdd(spacing.size, -0.5).add(new Vec3(0.5, 0.5));
        let br = center.mulAdd(spacing.size, 0.5).add(new Vec3(0.5, 0.5));
        let lineOpts = makeLineOpts({ color: blk.opts.color, mtx: blk.opts.mtx, n: new Vec3(0, 0, 1), thick });

        drawLineRect(render, tl, br, lineOpts);
        addQuad(render.triRender, tl, br, blk.opts.color.mul(0.3), blk.opts.mtx);

        for (let i = 1; i < nCellsX; i++) {
            let lineX = tl.x + i * cellSize;
            addLine2(render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        for (let i = 1; i < nCellsY; i++) {
            let lineY = tl.y + i * cellSize;
            addLine2(render.lineRender, new Vec3(tl.x, lineY, 0), new Vec3(br.x, lineY, 0), lineOpts);
        }
        break;
    }
    default: { let _exhaustCheck: never = blk.type; }
    }
}

function drawMaths(state: IProgramState, bottomMiddle: Vec3, mtx: Mat4f, blk: ITextBlock) {
    sizeBlock(state.render, blk);

    blk.offset = new Vec3(bottomMiddle.x - blk.size.x / 2, bottomMiddle.y - blk.size.y);

    layoutBlock(blk);

    let pad = 4;

    drawRoundedRect(state.render, new Vec3(blk.offset.x - pad, blk.offset.y - pad), blk.offset.add(blk.size).add(new Vec3(pad, pad)), backWhiteColor, mtx, 4);

    drawBlock(state.render, blk);
}


function drawLayerNormMuAgg(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk: ITextBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: 'E[', opts: { ...fontOpts, color: workingSrcColor } },
            { cellX: 1, cellY: 3, opts: { ...fontOpts, color: workingSrcColor } },
            { text: ']', opts: { ...fontOpts, color: workingSrcColor } },

        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawLayerNormSigmaAgg(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk: ITextBlock = mkTextBlock({
        opts: fontOpts,
        subs: [{
            type: TextBlockType.Divide,
            subs: [
                { text: '1' },
                {
                    type: TextBlockType.Sqrt,
                    subs: [
                        { type: TextBlockType.Line, subs: [
                            { text: 'Var[', opts: { ...fontOpts, color: workingSrcColor } },
                            { cellX: 1, cellY: 3, opts: { ...fontOpts, color: workingSrcColor } },
                            { text: ']', opts: { ...fontOpts, color: workingSrcColor } },
                            { text: ' + ε' },
                        ]}
                    ],
                }]
            },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawLayerNorm(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk: ITextBlock = mkTextBlock({
        opts: fontOpts,
        subs: [{
            type: TextBlockType.Divide,
            subs: [
                { subs: [
                        { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
                        { text: ' \— ' },
                        { text: 'E[', opts: { ...fontOpts, color: workingSrcColor } },
                        { cellX: 1, cellY: 3, opts: { ...fontOpts, color: workingSrcColor } },
                        { text: ']', opts: { ...fontOpts, color: workingSrcColor } },
                    ],
                },
                {
                    type: TextBlockType.Sqrt,
                    subs: [
                        { type: TextBlockType.Line, subs: [
                            { text: 'Var[', opts: { ...fontOpts, color: workingSrcColor } },
                            { cellX: 1, cellY: 3, opts: { ...fontOpts, color: workingSrcColor } },
                            { text: ']', opts: { ...fontOpts, color: workingSrcColor } },
                            { text: ' + ε' },
                        ]}
                    ],
                }]
            },
            { text: '  ‧ ' },
            { text: 'γ', opts: { ...fontOpts, color: weightSrcColor } },
            { text: ' + ' },
            { text: 'β', opts: { ...fontOpts, color: weightSrcColor } },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawResidualAdd(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk: ITextBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
            { text: ' + ' },
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
        ],
    });

    drawMaths(state, center, mtx, blk);
}