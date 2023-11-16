import { text } from "stream/consumers";
import { dimProps, TextAlignHoriz } from "../Annotations";
import { BlKDepSpecial, BlkSpecial, cellPosition, IBlkCellDep, IBlkDef } from "../GptModelLayout";
import { getDepDotLen, getDepSrcIdx } from "../Interaction";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText } from "../render/fontRender";
import { addLine2, drawLineSegs, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { RenderPhase } from "../render/sharedRender";
import { addPrimitiveRestart, addQuad, addVert } from "../render/triRender";
import { isNotNil } from "@/src/utils/data";
import { lerp } from "@/src/utils/math";
import { Mat4f } from "@/src/utils/matrix";
import { BoundingBox3d, Dim, Vec3, Vec4 } from "@/src/utils/vector";
import { Colors, DimStyle, dimStyleColor, dimStyleText, dimStyleTextShort } from "../walkthrough/WalkthroughTools";
import { drawLineRect } from "./ModelCard";
import { ITextBlock, sizeBlock, layoutBlock, drawBlock, mkTextBlock, TextBlockType, drawCells, ITextBlockArgs } from "./TextLayout";

interface IDataFlowArgs {
    state: IProgramState;
    center: Vec3;
    blk: IBlkDef;
    destIdx: Vec3;
    mtx: Mat4f;
}

export function drawDataFlow(state: IProgramState, blk: IBlkDef, destIdx: Vec3, pinIdx?: Vec3) {
    if (!blk.deps) {
        return;
    }
    let prevPhase = state.render.sharedRender.activePhase;
    state.render.sharedRender.activePhase = RenderPhase.Overlay2D;

    // the point where we draw the overlay
    pinIdx = pinIdx ?? destIdx;

    let cellPos = new Vec3(
        cellPosition(state.layout, blk, Dim.X, pinIdx.x) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Y, pinIdx.y) + state.layout.cell * 0.5,
        cellPosition(state.layout, blk, Dim.Z, pinIdx.z) + state.layout.cell * 1.1,
    );

    let resMtx = new Mat4f();

    let screenPos = projectToScreen(state, cellPos).round_();
    let center = screenPos.add(new Vec3(0, -50));

    let dataFlowArgs: IDataFlowArgs = {
        state,
        center,
        blk,
        destIdx,
        mtx: resMtx,
    }

    let bb = new BoundingBox3d();

    if (blk.deps.lowerTri && destIdx.x > destIdx.y) {
        drawZeroSymbol(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.InputEmbed) {
        bb = drawOLInputEmbed(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.LayerNorm) {
        bb = drawLayerNorm(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.LayerNormMu) {
        bb = drawLayerNormMuAgg(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.LayerNormSigma) {
        bb = drawLayerNormSigmaAgg(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggMax) {
        bb = drawSoftmaxAggMax(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.SoftmaxAggExp) {
        bb = drawSoftmaxAggExp(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.Softmax) {
        bb = drawSoftmax(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.Attention) {
        bb = drawAttention(dataFlowArgs);

    } else if (blk.deps.special === BlKDepSpecial.Gelu) {
        bb = drawGeluActivation(dataFlowArgs);

    // Standard ones
    } else if (blk.deps.dot) {
        bb = drawOLMatrixMul(dataFlowArgs);

    } else if (blk.deps.add && blk.deps.add.length === 2) {
        bb = drawResidualAdd(dataFlowArgs);
    }

    if (!bb.empty) {
        let cellIdxBb = drawCellIndexAndValue(dataFlowArgs, bb);
        let fullBB = new BoundingBox3d(bb.min, bb.max, cellIdxBb.min, cellIdxBb.max);
        drawDepArrows(dataFlowArgs, fullBB);
    }

    state.render.sharedRender.activePhase = prevPhase;
}

export function drawOLAddSymbol(args: IDataFlowArgs) {
    let { state, center, mtx } = args;

    let color = opColor;
    let innerColor = new Vec4(1.0, 1.0, 1.0, 1).mul(0.6);
    let width = 1;
    let radius = 15;
    drawCircle(state.render, center, radius, width, color, mtx);
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

export function drawOLInputEmbed(args: IDataFlowArgs) {
    let { center, mtx } = args;

    return drawMaths(args, center, mkTextBlock({
        opts: { color: nameColor, mtx, size: 16 },

        subs: [
            { type: TextBlockType.Custom, draw: (blk) => drawOLIndexLookup(args, blk.offset), size: new Vec3(tokEmbedBlockWidth, embedBlockHeight) },
            { text: ' + ' },
            { type: TextBlockType.Custom, draw: (blk) => drawOLPosEmbedLookup(args, blk.offset), size: new Vec3(posEmbedBlockWidth, embedBlockHeight) },
        ]

    }), [20, 0, 0, 0]);
}

export function getBlockValueAtIdx(blk: IBlkDef, blkIdx: Vec3) {
    let localBuffer = blk.access?.src.localBuffer;
    if (!blk.access || !localBuffer) {
        return null;
    }
    let bufferTex = blk.access.src;

    let bufferPos = blk.access.mat.mulVec4(new Vec4(blkIdx.x, blkIdx.y, blkIdx.z, 1));

    let channelIdx = blk.access.channel === 'r' ? 0 : blk.access.channel === 'g' ? 1 : blk.access.channel === 'b' ? 2 : 3;

    let idx = bufferPos.y * bufferTex.width * bufferTex.channels + bufferPos.x * bufferTex.channels + channelIdx;

    return localBuffer[idx];
}

export function drawOLIndexLookup(args: IDataFlowArgs, offset: Vec3) {
    let { state, center, destIdx, mtx } = args;
    let tokenIdx = getBlockValueAtIdx(state.layout.idxObj, new Vec3(destIdx.x, 0, destIdx.z));
    let tokenPct = isNotNil(tokenIdx) ? tokenIdx / (state.layout.tokEmbedObj.cx - 1) : 0.3;
    let heightPct = destIdx.y / (state.layout.residual0.cy - 1);

    let pos = center.add(new Vec3(-35, -20, 0));
    let color = Colors.Weights;

    // let tl = pos.add(new Vec3(-tokEmbedBlockWidth/2, -embedBlockHeight/2));
    // let br = pos.add(new Vec3(tokEmbedBlockWidth/2,  embedBlockHeight/2));
    let tl = offset;
    let br = tl.add(new Vec3(tokEmbedBlockWidth, embedBlockHeight));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.4 }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 8;
    let colTl = new Vec3(tl.x + lerp(0, br.x-tl.x-colW, tokenPct), tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + lerp(0, br.y-tl.y-colW, heightPct));
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let lineColor = Colors.Intermediates;
    let lineEndX = colTl.x + colW / 2;
    let lineEndY = colTl.y - 5;
    let lineStartX = br.x;
    let lineHeight = 10;

    let pts = new Float32Array([
        lineStartX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY - lineHeight, 0,
        lineEndX, lineEndY, 0,
    ]);
    let lineOpts = makeLineOpts({ color: lineColor, mtx, n: new Vec3(0, 0, 1), thick: 0.5 });
    drawLineSegs(state.render.lineRender, pts, lineOpts);

    drawCells(state.render, new Vec3(1, 1), new Vec3(lineStartX + 8, lineEndY - lineHeight), new Vec3(7, 7), Colors.Intermediates, mtx);
}

export function drawOLPosEmbedLookup(args: IDataFlowArgs, offset: Vec3) {
    let { state, center, destIdx, mtx } = args;
    let posPct = destIdx.x / (state.layout.posEmbedObj.cx - 1);
    let heightPct = destIdx.y / (state.layout.residual0.cy - 1);

    let pos = center.add(new Vec3(35, -20, 0));
    let color = Colors.Weights;

    // let tl = pos.add(new Vec3(-posEmbedBlockWidth/2, -embedBlockHeight/2));
    // let br = pos.add(new Vec3(posEmbedBlockWidth/2,  embedBlockHeight/2));
    let tl = offset;
    let br = tl.add(new Vec3(tokEmbedBlockWidth, embedBlockHeight));

    drawLineRect(state.render, tl, br, makeLineOpts({ color, mtx, n: new Vec3(0, 0, 1), thick: 0.4 }));

    addQuad(state.render.triRender, tl, br, backWhiteColor, mtx);

    let colW = 8;
    let colTl = new Vec3(tl.x + lerp(0, br.x-tl.x-colW, posPct), tl.y);
    let colBr = new Vec3(colTl.x + colW, br.y);

    let cellTl = new Vec3(colTl.x, colTl.y + lerp(0, br.y-tl.y-colW, heightPct));
    let cellBr = new Vec3(colBr.x, cellTl.y + colW);

    addQuad(state.render.triRender, colTl, colBr, color.mul(0.3), mtx);
    addQuad(state.render.triRender, cellTl, cellBr, color, mtx);

    let textOpts: IFontOpts = { color: new Vec4(1,1,1,1).mul(0.8), mtx, size: 20 };
    let tw = measureText(state.render.modelFontBuf, 't', textOpts);

    drawText(state.render.modelFontBuf, 't', (cellTl.x + cellBr.x) / 2 - tw / 2, colTl.y - 3 - textOpts.size, textOpts);
}


export function drawOLMatrixMul(args: IDataFlowArgs) {
    let { center, mtx, blk } = args;
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

    let textBlock = mkTextBlock({
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

    return drawMaths(args, center, textBlock);
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

function drawMaths(args: IDataFlowArgs, bottomMiddle: Vec3, textBlk: ITextBlock, pad?: number[] | number) {
    let { state, mtx } = args;

    let value = getBlockValueAtIdx(args.blk, args.destIdx);

    if (textBlk.type === TextBlockType.Line) {
        textBlk.subs!.push(
            mkTextBlock({ text: '  =  ', opts: textBlk.opts }),
        );
        if (isNotNil(value)) {
            textBlk.subs!.push(
                mkTextBlock({ text: value.toFixed(2), opts: textBlk.opts, size: new Vec3(35, 0), align: TextAlignHoriz.Right }),
            );
        }
    }

    sizeBlock(state.render, textBlk);

    textBlk.offset = new Vec3(bottomMiddle.x - textBlk.size.x / 2, bottomMiddle.y - textBlk.size.y);

    layoutBlock(textBlk);

    let padX = 4;
    let padY = 4;

    let tl = textBlk.offset.sub(new Vec3(padX + getPad(pad, 2), padY + getPad(pad, 0)));
    let br = textBlk.offset.add(textBlk.size).add(new Vec3(padX * 2 + getPad(pad, 1), padY + getPad(pad, 3)));
    drawRoundedRect(state.render, tl, br, backWhiteColor, mtx, 4);

    drawBlock(state.render, textBlk);
    return new BoundingBox3d(tl, br);
}

function getPad(pad: number[] | number | null | undefined, dir: number) {
    if (Array.isArray(pad)) {
        return pad[dir];
    } else if (typeof pad === 'number') {
        return pad;
    }
    return 0;
}

function drawLayerNormMuAgg(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: 'E[', color: workingSrcColor },
            { cellX: 1, cellY: 3, color: workingSrcColor },
            { text: ']', color: workingSrcColor },

        ],
    });

    return drawMaths(args, center, textBlock);
}

function drawLayerNormSigmaAgg(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
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
    });

    return drawMaths(args, center, textBlock);
}

function drawLayerNorm(args: IDataFlowArgs) {
    let { center, mtx } = args;
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

    return drawMaths(args, center, blk);
}

function drawResidualAdd(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
            { text: ' + ' },
            { cellX: 1, cellY: 1, opts: { ...fontOpts, color: workingSrcColor } },
        ],
    });

    return drawMaths(args, center, textBlock);
}

function drawZeroSymbol(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: '-' },
        ],
    });

    return drawMaths(args, center, textBlock);
}

function drawSoftmaxAggMax(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            { text: 'max(' },
            { cellX: 3, cellY: 1, color: workingSrcColor },
            { text: ')' },
        ],
    });

    return drawMaths(args, center, textBlock);
}

function drawSoftmaxAggExp(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
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

    return drawMaths(args, center, textBlock);
}

function drawSoftmax(args: IDataFlowArgs) {
    let { center, mtx } = args;
    let fontOpts: IFontOpts = { color: opColor, mtx, size: 16 };

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [{
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
        }],
    });

    return drawMaths(args, center, textBlock);
}

export function drawAttention(args: IDataFlowArgs) {
    let { center, mtx, blk } = args;
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

    let textBlock = mkTextBlock({
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

    return drawMaths(args, center, textBlock);
}

export function drawGeluActivation(args: IDataFlowArgs) {
    let { state, center, mtx, blk, destIdx } = args;

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

    let srcBlk = blk.deps!.add![0].src;
    let srcVal = getBlockValueAtIdx(srcBlk, destIdx);

    if (isNotNil(srcVal)) {
        let destVal = geluX(srcVal);
        drawCircle(state.render, new Vec3(mappingX(srcVal), mappingY(destVal)), 2, 1, Colors.Intermediates, mtx);
    }

    let bb = new BoundingBox3d(tl, br);

    return bb;
}

export function createMapping(range0: number, range1: number, domain0: number, domain1: number) {
    let m = (range1 - range0) / (domain1 - domain0);
    let b = range0 - m * domain0;
    return (x: number) => m * x + b;
}

function drawCellIndexAndValue(args: IDataFlowArgs, bb: BoundingBox3d): BoundingBox3d {
    let { center, mtx, blk, destIdx } = args;
    let fontOpts = { color: opColor, mtx, size: 14 };

    function mapDimToSub(dim: DimStyle, idx: number): ITextBlockArgs | null {
        if (dim === DimStyle.None) {
            return null;
        }
        let posValue = destIdx.getAt(idx);
        let color = dimStyleColor(dim);
        let text = `${dimStyleTextShort(dim)}: ${posValue}`;
        return { text, color };
    }

    let xDim = mapDimToSub(blk.dimX, 0);
    let yDim = mapDimToSub(blk.dimY, 1);

    let textBlock = mkTextBlock({
        opts: fontOpts,
        subs: [
            xDim,
            xDim && yDim && { text: ', ' },
            yDim,
        ],
    });

    let padX = 4;
    let padY = 4;

    sizeBlock(args.state.render, textBlock);
    textBlock.offset = new Vec3(args.center.x - textBlock.size.x/2, bb.min.y - fontOpts.size * 1.2 - padX, 0);
    layoutBlock(textBlock);

    let tl = textBlock.offset.sub(new Vec3(padX, padY));
    let br = textBlock.offset.add(textBlock.size).add(new Vec3(padX * 2, padY * 2));

    drawRoundedRect(args.state.render, tl, br, backWhiteColor, mtx, 4);

    drawBlock(args.state.render, textBlock);
    return new BoundingBox3d(tl, br);
}


function drawDepArrows(args: IDataFlowArgs, bb: BoundingBox3d) {
    let { state, mtx, blk, destIdx } = args;
    if (!blk.deps) {
        return;
    }

    function drawDepArrow(dep: IBlkCellDep, dotLen?: number | null) {
        let { srcIdx, otherDim, isDot } = getDepSrcIdx(dep, destIdx);

        if (dep.src.opacity === 0) {
            return;
        }

        if (isDot) {
            let { cx } = dimProps(dep.src, otherDim);
            srcIdx.setAt(otherDim, (dotLen ?? cx) / 2);
        }

        if (blk.deps?.special === BlKDepSpecial.InputEmbed && dep.src === args.state.layout.tokEmbedObj) {
            let tokenIdx = getBlockValueAtIdx(state.layout.idxObj, new Vec3(destIdx.x, 0, destIdx.z));
            srcIdx.setAt(Dim.X, tokenIdx ?? 0);
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
