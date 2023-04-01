import { dimProps } from "../Annotations";
import { BlKDepSpecial, cellPosition, IBlkCellDep, IBlkDef } from "../GptModelLayout";
import { getDepDotLen, getDepSrcIdx } from "../Interaction";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText } from "../render/fontRender";
import { addLine, addLine2, drawLineSegs, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { RenderPhase } from "../render/sharedRender";
import { addPrimitiveRestart, addQuad, addVert } from "../render/triRender";
import { isNotNil } from "../utils/data";
import { lerp } from "../utils/math";
import { Mat4f } from "../utils/matrix";
import { BoundingBox3d, Dim, Vec3, Vec4 } from "../utils/vector";
import { Colors, DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { drawLineRect } from "./ModelCard";
import { ITextBlock, sizeBlock, layoutBlock, drawBlock, mkTextBlock, TextBlockType } from "./TextLayout";

export function drawDataFlow(state: IProgramState, blk: IBlkDef, destIdx: Vec3, pinIdx?: Vec3) {
    if (!blk.deps) {
        return;
    }
    state.render.sharedRender.activePhase = RenderPhase.Overlay2D;

    // the point where we draw the overlay
    pinIdx = pinIdx ?? destIdx;

    let cellPos = new Vec3(
        cellPosition(state.layout, blk, Dim.X, pinIdx.x) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Y, pinIdx.y) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Z, pinIdx.z) + state.layout.cell * 1.1,
    );

    let scale = 1.0;

    let resMtx = new Mat4f();

    let screenPos = projectToScreen(state, cellPos).round_();
    let center = screenPos.add(new Vec3(0, -50));

    let bb = new BoundingBox3d();

    if (blk.deps.lowerTri && destIdx.x > destIdx.y) {
        drawZeroSymbol(state, center, resMtx);
        return;
    }

    if (blk.deps.special === BlKDepSpecial.InputEmbed) {
        drawOLAddSymbol(state, center, scale, resMtx);
        drawOLIndexLookup(state, center, scale, resMtx);
        drawOLPosEmbedLookup(state, center, scale, resMtx);
    }
    else if (blk.deps.special === BlKDepSpecial.LayerNorm) {
        bb = drawLayerNorm(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.LayerNormMu) {
        bb = drawLayerNormMuAgg(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.LayerNormSigma) {
        bb = drawLayerNormSigmaAgg(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggMax) {
        bb = drawSoftmaxAggMax(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggExp) {
        bb = drawSoftmaxAggExp(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.Softmax) {
        bb = drawSoftmax(state, center, resMtx);

    } else if (blk.deps.special === BlKDepSpecial.Attention) {
        bb = drawAttention(state, center, resMtx, blk);

    } else if (blk.deps.special === BlKDepSpecial.Gelu) {
        bb = drawGeluActivation(state, center, resMtx);

    // Standard ones
    } else if (blk.deps.dot) {
        bb = drawOLMatrixMul(state, center, resMtx, blk);

    } else if (blk.deps.add && blk.deps.add.length === 2) {
        bb = drawResidualAdd(state, center, resMtx);
    }

    if (!bb.empty) {
        drawDepArrows(state, center, bb, resMtx, blk, destIdx);
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


export function drawOLMatrixMul(state: IProgramState, center: Vec3, mtx: Mat4f, blk: IBlkDef) {
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
            hasAdd ? { text: ' + dot(' } : { text: 'dot(' },
            cellSizeAndColor(dotA),
            { text: ',' },
            cellSizeAndColor(dotB),
            { text: ')' },
        ].filter(isNotNil),
    });

    return drawMaths(state, center, mtx, textBlk);
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

    let padX = 4;
    let padY = 4;

    let tl = blk.offset.sub(new Vec3(padX, padY));
    let br = blk.offset.add(blk.size).add(new Vec3(padX * 2, padY));
    drawRoundedRect(state.render, tl, br, backWhiteColor, mtx, 4);

    drawBlock(state.render, blk);
    return new BoundingBox3d(tl, br);
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

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
}

function drawZeroSymbol(state: IProgramState, center: Vec3, mtx: Mat4f) {
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let blk = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: '-' },
        ],
    });

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
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

    return drawMaths(state, center, mtx, blk);
}

export function drawAttention(state: IProgramState, center: Vec3, mtx: Mat4f, blk: IBlkDef) {
    let fontOpts = { color: opColor, mtx, size: 16 };

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
            { text: 'dot(' },
            cellSizeAndColor(dotA),
            { text: ',' },
            cellSizeAndColor(dotB),
            { text: ') / ' },
            {
                type: TextBlockType.Sqrt,
                subs: [{ text: 'A' }],
            },
        ],
    });

    return drawMaths(state, center, mtx, textBlk);
}

export function drawGeluActivation(state: IProgramState, center: Vec3, mtx: Mat4f) {

    // ugly
    // let fontOpts = { color: opColor, mtx, size: 16 };
    // let textBlk = mkTextBlock({
    //     opts: fontOpts,
    //     subs: [
    //         { text: '0.5' },
    //         { cellX: 1, cellY: 1, color: workingSrcColor },
    //         { text: '(1 + tanh(' },
    //         { type: TextBlockType.Sqrt, subs: [{ text: '2/π' }], },
    //         { text: '(' },
    //         { cellX: 1, cellY: 1, color: workingSrcColor },
    //         { text: ' + 0.044715' },
    //         { cellX: 1, cellY: 1, color: workingSrcColor },
    //         { text: '^3)' },
    //     ],
    // });
    // return drawMaths(state, center, mtx, textBlk);

    let geluX = (x: number) => x * 0.5 * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * x * x * x)))

    let w = 70;
    let h = 50;

    let tl = center.sub(new Vec3(w / 2, h, 0));
    let br = center.add(new Vec3(w / 2, 0, 0));

    drawRoundedRect(state.render, tl, br, backWhiteColor, mtx, 4);

    let halfW = 3;
    let halfH = halfW * h / w;
    let hOffset = 1.2;
    let mappingX = createMapping(tl.x, br.x, -halfW, halfW);
    let mappingY = createMapping(br.y, tl.y, -halfH + hOffset, halfH + hOffset);

    let nPts = 30;
    let pts = new Float32Array(nPts * 3);
    for (let i = 0; i < nPts; i++) {
        let x = -halfW + i * halfW * 2 / (nPts - 1);
        let y = geluX(x);
        pts[i * 3 + 0] = mappingX(x);
        pts[i * 3 + 1] = mappingY(y);
    }

    let axisLineOpts = makeLineOpts({ color: new Vec4(0.5,0.5,0.5,1), mtx, thick: 1.5 });
    addLine2(state.render.lineRender, new Vec3(tl.x, mappingY(0)), new Vec3(br.x, mappingY(0)), axisLineOpts);
    addLine2(state.render.lineRender, new Vec3(mappingX(0), tl.y), new Vec3(mappingX(0), br.y), axisLineOpts);

    let curveLineOpts = makeLineOpts({ color: Colors.Intermediates, mtx, thick: 3.5 });
    drawLineSegs(state.render.lineRender, pts, curveLineOpts);

    let bb = new BoundingBox3d(tl, br);

    return bb;
}

export function createMapping(range0: number, range1: number, domain0: number, domain1: number) {
    let m = (range1 - range0) / (domain1 - domain0);
    let b = range0 - m * domain0;
    return (x: number) => m * x + b;
}

function drawDepArrows(state: IProgramState, center: Vec3, bb: BoundingBox3d, mtx: Mat4f, blk: IBlkDef, destIdx: Vec3) {
    if (!blk.deps) {
        return;
    }

    function drawDepArrow(dep: IBlkCellDep, dotLen?: number | null) {
        let { srcIdx, otherDim, isDot } = getDepSrcIdx(dep, destIdx);

        if (isDot) {
            let { cx } = dimProps(dep.src, otherDim);
            srcIdx.setAt(otherDim, (dotLen ?? cx) / 2);
        }

        let srcT = dep.src.t;
        let color = srcT === 'w' ? Colors.Weights : srcT === 'i' ? Colors.Intermediates : Colors.Aggregates;

        drawArrow(dep.src, srcIdx, color, false);
    }

    function drawFinalArrow() {
        drawArrow(blk, destIdx, new Vec4(0,0,0,1), true);
    }

    function drawArrow(blk: IBlkDef, idx: Vec3, color: Vec4, reverse?: boolean) {
        let cellPos = new Vec3(
            cellPosition(state.layout, blk, Dim.X, idx.x) + state.layout.cell * 0.5,
            cellPosition(state.layout, blk, Dim.Y, idx.y) + state.layout.cell * 0.5,
            cellPosition(state.layout, blk, Dim.Z, idx.z) + state.layout.cell * 1.1,
        );

        // let's just draw a straight line for now

        let lineOpts = makeLineOpts({ n: new Vec3(0,0,1), color, mtx, thick: 0.5, dash: 10 });

        let source = projectToScreen(state, cellPos);

        let center = bb.center();
        let dir = source.sub(center).normalize();
        let tVals = [
            (bb.min.x - center.x) / dir.x,
            (bb.max.x - center.x) / dir.x,
            (bb.min.y - center.y) / dir.y,
            (bb.max.y - center.y) / dir.y,
        ];

        let actualTarget: Vec3 | null = null;
        for (let t of tVals) {
            let p = center.mulAdd(dir, t);
            let eps = 0.00001;
            if (t > 0 && p.x > bb.min.x - eps && p.y > bb.min.y - eps && p.x < bb.max.x + eps && p.y < bb.max.y + eps) {
                actualTarget = center.mulAdd(dir, t + 4);
                break;
            }
        }

        if (actualTarget) {
            if (reverse) {
                let tmp = source;
                source = actualTarget;
                actualTarget = tmp;
            }
            drawArc(state, source, actualTarget, color, mtx, 1.0);
            // addLine2(state.render.lineRender, source, actualTarget, lineOpts);
        }
    }

    if (blk.deps.add) {
        for (let dep of blk.deps.add) {
            drawDepArrow(dep);
        }
    }
    if (blk.deps.dot) {
        let dotLen = getDepDotLen(blk, destIdx);
        for (let dep of blk.deps.dot) {
            drawDepArrow(dep, dotLen);
        }
    }
    drawFinalArrow();
}

// create clockwise arc from a to b
// have line from a to b, bisect it, and cross dir with z for direction
// scale bisection by distance
// this now marks the center of the circle
// grab radius (easy), and then figure out start/end angles

function drawArc(state: IProgramState, a: Vec3, b: Vec3, color: Vec4, mtx: Mat4f, thick: number) {
    let dir = b.sub(a).normalize();
    let bisect = Vec3.cross(dir, new Vec3(0,0,1)).normalize();
    let center = a.lerp(b, 0.5).add(bisect.mul(a.dist(b) * -2.0));

    let radius = a.dist(center);
    let endAngle = Math.atan2(b.y - center.y, b.x - center.x);
    let startAngle = Math.atan2(a.y - center.y, a.x - center.x);

    if (endAngle < startAngle) {
        endAngle += Math.PI * 2;
    }
    if (endAngle - startAngle > Math.PI) {
        endAngle -= Math.PI * 2;
    }

    let lineOpts = makeLineOpts({ color, mtx, thick, dash: 0 });

    let nPts = 32;
    let pts = new Float32Array(3 * nPts);

    for (let i = 0; i < nPts; i++) {
        let t = i / (nPts - 1);
        let angle = lerp(startAngle, endAngle, t);
        let x = center.x + radius * Math.cos(angle);
        let y = center.y + radius * Math.sin(angle);
        pts[i * 3 + 0] = x;
        pts[i * 3 + 1] = y;
    }

    drawLineSegs(state.render.lineRender, pts, lineOpts);

    let tangent = new Vec3(Math.sin(endAngle), -Math.cos(endAngle));

    let dirA = tangent.rotateAbout(new Vec3(0,0,1), -Math.PI * 0.25);
    let dirB = tangent.rotateAbout(new Vec3(0,0,1), Math.PI * 0.25);

    let arrowLen = 10;
    addLine2(state.render.lineRender, b, b.mulAdd(dirA, arrowLen), lineOpts);
    addLine2(state.render.lineRender, b, b.mulAdd(dirB, arrowLen), lineOpts);
}
