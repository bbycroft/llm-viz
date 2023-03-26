import { camScaleToScreen } from "../Camera";
import { BlKDepSpecial, cellPosition, IBlkCellDep, IBlkDef } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText } from "../render/fontRender";
import { addLine2, drawLineSegs, ILineOpts, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { RenderPhase } from "../render/sharedRender";
import { addPrimitiveRestart, addQuad, addVert } from "../render/triRender";
import { isNil, isNotNil, makeArray } from "../utils/data";
import { lerp } from "../utils/math";
import { Mat4f } from "../utils/matrix";
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { Colors, DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { drawLineRect } from "./ModelCard";
import { ITextBlock, sizeBlock, layoutBlock, drawBlock, mkTextBlock, TextBlockType } from "./TextLayout";

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

    if (blk.deps.lowerTri && destIdx.x > destIdx.y) {
        drawZeroSymbol(state, center, resMtx);
        return;
    }

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

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggMax) {
        drawSoftmaxAggMax(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggExp) {
        drawSoftmaxAggExp(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.Softmax) {
        drawSoftmax(state, center, resMtx);
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

let weightSrcColor = new Vec4(0.4, 0.4, 0.9, 1);
let workingSrcColor = new Vec4(0.3, 0.7, 0.3, 1);

let opColor = new Vec4(0.9, 0.9, 0.9, 1);
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
    let fontOpts = { color: opColor, mtx, size: 16 };

    let hasAdd = !!blk.deps!.add;
    let dotA = blk.deps!.dot![0];
    let dotB = blk.deps!.dot![1];

    function cellSizeAndColor(dep: IBlkCellDep) {
        let isRow = dep.srcIdxMtx.g(0, 3) === 1.0;
        return {
            cellX: isRow ? 4 : 1,
            cellY: isRow ? 1 : 4,
            color: dep.src.t === 'w' ? weightSrcColor : workingSrcColor,
         };
    }

    let textBlk = mkTextBlock({
        opts: fontOpts,
        subs: [
            hasAdd ? { cellX: 1, cellY: 1, color: weightSrcColor } : null,
            hasAdd ? { text: '+ dot(' } : { text: 'dot(' },
            cellSizeAndColor(dotA),
            { text: ',' },
            cellSizeAndColor(dotB),
            { text: ')' },
        ].filter(isNotNil),
    });

    drawMaths(state, center, mtx, textBlk);
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

    let blk = mkTextBlock({
        opts: fontOpts,
        color: workingSrcColor,
        subs: [
            { text: 'E[' },
            { cellX: 1, cellY: 3 },
            { text: ']' },

        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawLayerNormSigmaAgg(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [{
            type: TextBlockType.Divide,
            subs: [
                { text: '1' },
                {
                    type: TextBlockType.Sqrt,
                    subs: [
                        { type: TextBlockType.Line, subs: [
                            { text: 'Var[', color: workingSrcColor },
                            { cellX: 1, cellY: 3, color: workingSrcColor },
                            { text: ']', color: workingSrcColor },
                            { text: ' + ε' },
                        ]},
                    ],
                }],
            },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawLayerNorm(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [{
            type: TextBlockType.Divide,
            subs: [
                { subs: [
                        { cellX: 1, cellY: 1, color: workingSrcColor },
                        { text: ' \— ' },
                        {
                            type: TextBlockType.Line,
                            rectOpts: { color: Colors.Aggregates.mul(0.8), mtx, thick: 1.0, dash: 6 },
                            subs: [
                                { text: 'E[', color: workingSrcColor },
                                { cellX: 1, cellY: 3, color: workingSrcColor },
                                { text: ']', color: workingSrcColor },
                            ],
                        },
                    ],
                },
                {
                    type: TextBlockType.Line,
                    rectOpts: { color: Colors.Aggregates.mul(0.8), mtx, thick: 1.0, dash: 6 },
                    subs: [{
                        type: TextBlockType.Sqrt,
                        subs: [
                            { type: TextBlockType.Line, subs: [
                                { text: 'Var[', color: workingSrcColor },
                                { cellX: 1, cellY: 3, color: workingSrcColor },
                                { text: ']', color: workingSrcColor },
                                { text: ' + ε' },
                            ]},
                        ],
                    }],
                }]
            },
            { text: '  ‧ ' },
            { text: 'γ', color: weightSrcColor },
            { text: ' + ' },
            { text: 'β', color: weightSrcColor },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawResidualAdd(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
            { text: ' + ' },
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawZeroSymbol(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: '-' },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawSoftmaxAggMax(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: 'max(' },
            { cellX: 3, cellY: 1, color: workingSrcColor },
            { text: ')' },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawSoftmaxAggExp(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: 'Σ', opts: { ...fontOpts, size: fontOpts.size * 1.5 } },
            { text: 'exp(' },
            { cellX: 1, cellY: 1, color: workingSrcColor },
            { text: ' - ' },
            {
                type: TextBlockType.Line,
                rectOpts: { color: Colors.Aggregates.mul(0.8), mtx, thick: 1.0, dash: 6 },
                subs: [
                    { text: 'max(' },
                    { cellX: 3, cellY: 1, color: workingSrcColor },
                    { text: ')' },
                ],
            },
            { text: ')' },
        ],
    });

    drawMaths(state, center, mtx, blk);
}

function drawSoftmax(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        type: TextBlockType.Divide,
        subs: [{
            subs: [
                { text: 'exp(' },
                { cellX: 1, cellY: 1, color: workingSrcColor },
                { text: ' - ' },
                {
                    rectOpts: { color: Colors.Aggregates.mul(0.8), mtx, thick: 1.0, dash: 6 },
                    subs: [
                        { text: 'max(' },
                        { cellX: 3, cellY: 1, color: workingSrcColor },
                        { text: ')' },
                    ],
                },
                { text: ')' },
            ],
        }, {
            type: TextBlockType.Line,
            rectOpts: { color: Colors.Aggregates.mul(0.8), mtx, thick: 1.0, dash: 6 },
            subs: [
                { text: 'Σ', opts: { ...fontOpts, size: fontOpts.size * 1.5 } },
                { text: 'exp(' },
                { cellX: 1, cellY: 1, color: workingSrcColor },
                { text: ' - ' },
                {
                    type: TextBlockType.Line,
                    subs: [
                        { text: 'max(' },
                        { cellX: 3, cellY: 1, color: workingSrcColor },
                        { text: ')' },
                    ],
                },
                { text: ')' },
            ],
        }],
    });

    drawMaths(state, center, mtx, blk);
}