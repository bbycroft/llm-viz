import { BlKDepSpecial, cellPosition, IBlkDef } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText } from "../render/fontRender";
import { addLine2, drawLineSegs, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { addPrimitiveRestart, addQuad, addVert } from "../render/triRender";
import { Mat4f } from "../utils/matrix";
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { drawLineRect } from "./ModelCard";

export function drawDataFlow(state: IProgramState, blk: IBlkDef, destIdx: Vec3) {
    if (!blk.deps) {
        return;
    }

    let cellPos = new Vec3(
        cellPosition(state.layout, blk, Dim.X, destIdx.x) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Y, destIdx.y) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Z, destIdx.z) + state.layout.cell * 1.1,
    );

    // let screenPos = projectToScreen(state, cellPos);

    let mtx = new Mat4f();
    // let mtx = Mat4f.fromColMajor(state.camera.lookAtMtx);
    // mtx[12] = 0.0;
    // mtx[13] = 0.0;
    // mtx[14] = 0.0;
    let mtxT = Mat4f.fromTranslation(cellPos);
    let mtxTInv = Mat4f.fromTranslation(cellPos.mul(-1));
    // mtx = mtx.invert();
    // console.log(mtx.toString());

    let camPosModel = state.camera.modelMtx.invert().mulVec3Affine(state.camera.camPos);

    let camDir = cellPos.sub(camPosModel).normalize();
    let camDist = cellPos.dist(camPosModel);
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

    let scale = camDist / 140.0;

    let scaleMtx = Mat4f.fromScale(new Vec3(1, 1, 1).mul(scale));
    let translateMtx = Mat4f.fromTranslation(new Vec3(0, 0, -20 + cellPos.z));

    let resMtx = mtxT.mul(mtx).mul(scaleMtx).mul(mtxTInv).mul(translateMtx);

    let center = cellPos.add(new Vec3(0, -5, -cellPos.z));

    if (blk.deps.special === BlKDepSpecial.InputEmbed) {
        drawOLAddSymbol(state, center, scale, resMtx);
        drawOLIndexLookup(state, center, scale, resMtx);
        drawOLPosEmbedLookup(state, center, scale, resMtx);
    }
    if (blk.deps.dot) {
        drawOLMatrixMul(state, center, scale, resMtx, blk);
    }
}

export function drawOLAddSymbol(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {

    let color = opColor;
    let innerColor = new Vec4(1.0, 1.0, 1.0, 1).mul(0.6);
    let width = 0.1;
    let radius = 1.5;
    drawCircle(state.render, center, radius, width * scale, color, mtx);
    drawCirclePlane(state.render, center, radius, innerColor, mtx);

    let textOpts: IFontOpts = { color: color, mtx, size: 4 };
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
        ndc.z);
}

let weightSrcColor = new Vec4(0.3, 0.3, 0.7, 1);
let workingSrcColor = new Vec4(0.3, 0.7, 0.3, 1);

let opColor = new Vec4(0.7, 0.3, 0.3, 1);
let backWhiteColor = new Vec4(0.0, 0.0, 0.0, 1).mul(1.0);
let embedBlockHeight = 3;
let tokEmbedBlockWidth = 4.0;
let posEmbedBlockWidth = 3.5;

export function drawOLIndexLookup(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {

    let pos = center.add(new Vec3(-5, 0, 0));
    let color = new Vec4(0.3, 0.3, 0.7, 1);

    let tl = pos.add(new Vec3(-tokEmbedBlockWidth/2, -embedBlockHeight/2));
    let br = pos.add(new Vec3(tokEmbedBlockWidth/2,  embedBlockHeight/2));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.05 * scale }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 0.8;
    let colTl = new Vec3(tl.x + 1.0, tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + 0.8);
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let lineColor = dimStyleColor(DimStyle.TokenIdx);
    let lineEndX = colTl.x + colW / 2;
    let lineEndY = colTl.y - 0.5;
    let lineStartX = center.x;
    let lineHeight = 2.0;

    let pts = new Float32Array([
        lineStartX, lineEndY - 2 * lineHeight, 0,
        lineStartX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY, 0,
    ]);
    let lineOpts = makeLineOpts({ color: lineColor, mtx, n: new Vec3(0, 0, 1), thick: 0.15 * scale });
    drawLineSegs(state.render.lineRender, pts, lineOpts);
}

export function drawOLPosEmbedLookup(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f) {
    let pos = center.add(new Vec3(5, 0, 0));
    let color = weightSrcColor;

    let tl = pos.add(new Vec3(-posEmbedBlockWidth/2, -embedBlockHeight/2)); 
    let br = pos.add(new Vec3(posEmbedBlockWidth/2,  embedBlockHeight/2));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.05 * scale }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 0.8;
    let colTl = new Vec3(tl.x + 1.5, tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + 0.8);
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let textOpts: IFontOpts = { color: color, mtx, size: 2 };
    let tw = measureText(state.render.modelFontBuf, 't', textOpts);

    drawText(state.render.modelFontBuf, 't', (cellTl.x + cellBr.x) / 2 - tw / 2, colTl.y - 0.3 - textOpts.size, textOpts);
}


export function drawOLMatrixMul(state: IProgramState, center: Vec3, scale: number, mtx: Mat4f, blk: IBlkDef) {

    let h = 5;
    let l = -12.5;
    let r = 6.5;

    addQuad(state.render.triRender, center.add(new Vec3(l, -h/2)), center.add(new Vec3(r, h/2)), backWhiteColor, mtx);

    function drawRowCol(pos: Vec3, color: Vec4, isRow: boolean, nCells: number) {

        let nCellsX = isRow ? nCells : 1;
        let nCellsY = isRow ? 1 : nCells;
        let cellSize = 0.8;
        let thick = 0.05 * scale;

        let tl = pos.add(new Vec3(-cellSize * nCellsX / 2, -cellSize * nCellsY / 2));
        let br = pos.add(new Vec3(cellSize * nCellsX / 2,  cellSize * nCellsY / 2));
        let lineOpts = makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick });

        drawLineRect(state.render, tl, br, lineOpts);
        addQuad(state.render.triRender, tl, br, color.mul(0.3), mtx);

        for (let i = 1; i < nCellsX; i++) {
            let lineX = tl.x + i * cellSize;
            addLine2(state.render.lineRender, new Vec3(lineX, tl.y + thick/2, 0), new Vec3(lineX, br.y - thick/2, 0), lineOpts);
        }

        for (let i = 1; i < nCellsY; i++) {
            let lineY = tl.y + i * cellSize;
            addLine2(state.render.lineRender, new Vec3(tl.x + thick/2, lineY, 0), new Vec3(br.x - thick/2, lineY, 0), lineOpts);
        }
    }

    let dotA = blk.deps!.dot![0];
    let dotB = blk.deps!.dot![1];

    let dotAColor = dotA.src.t === 'w' ? weightSrcColor : workingSrcColor;
    let dotBColor = dotB.src.t === 'w' ? weightSrcColor : workingSrcColor;

    let dotAIsCol = dotA.srcIdxMtx.g(0, 3) === 1.0;
    let dotBIsCol = dotB.srcIdxMtx.g(0, 3) === 1.0;

    let hasAdd = !!blk.deps!.add;

    drawRowCol(center.add(new Vec3(-2.5, 0, 0)), dotAColor, dotAIsCol, 4);
    drawRowCol(center.add(new Vec3(2.5, 0, 0)), dotBColor, dotBIsCol, 4);
    let textOpts: IFontOpts = { color: opColor, mtx, size: 2 };

    let textY = center.y - textOpts.size * 0.56;
    let commaTw = measureText(state.render.modelFontBuf, ',', textOpts);
    drawText(state.render.modelFontBuf, ',', center.x - commaTw / 2, textY, textOpts);


    let dotBeginText = hasAdd ? ' + dot(' : 'dot(';

    let dotBeginW = measureText(state.render.modelFontBuf, dotBeginText, textOpts);
    let dotBeginX = center.x - dotBeginW - 4.5;
    drawText(state.render.modelFontBuf, dotBeginText, dotBeginX, textY, textOpts);

    drawText(state.render.modelFontBuf, ')', center.x + 4.5, textY, textOpts);

    if (hasAdd) {
        drawRowCol(new Vec3(dotBeginX - 0.8, center.y), new Vec4(0.3, 0.3, 0.7, 1), false, 1);
    }
}

