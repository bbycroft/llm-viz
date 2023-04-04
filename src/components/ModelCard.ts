import { cameraToMatrixView } from "../Camera";
import { cellPosition, IGptModelLayout } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { drawText, IFontOpts, measureText, measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import { addLine, addLine2 as drawLine, drawLineSegs, ILineOpts, makeLineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { addQuad } from "../render/triRender";
import { lerp } from "../utils/math";
import { Mat4f } from "../utils/matrix";
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";

export function drawModelCard(state: IProgramState) {

    // a rectangle with rounded corners (how to do the rounded corners?)
    // the title of the model
    // num weights & other params
    // goal of the weights/model
    // the input/output

    /*
    Probably won't do rounded corners for now, since need to break up the quad into triangles
    that are all inside the rounded corners.

    Not tooo bad actually, but not worth it for now.
    */

    let { render, layout } = state;
    let { camPos } = cameraToMatrixView(state.camera);
    let dist = camPos.dist(new Vec3(0, 0, -30));

    let scale = Math.max(dist / 500.0, 1.0);

    let mtx = Mat4f.fromScaleTranslation(new Vec3(scale, scale, scale), new Vec3(0, -30, 0))
        .mul(Mat4f.fromTranslation(new Vec3(0, 30, 0)));

    let thick = 1.0 / 10.0 * scale;
    let borderColor = Vec4.fromHexColor("#555599", 0.8);
    let backgroundColor = Vec4.fromHexColor("#9999ee", 0.3);
    let titleColor = Vec4.fromHexColor("#000000", 1.0);
    let n = new Vec3(0, 0, 1);

    let lineOpts: ILineOpts = { color: borderColor, mtx, thick, n };

    let tl = new Vec3(-110, -97, 0);
    let br = new Vec3( 110, -30, 0);
    drawLineRect(render, tl, br, lineOpts);

    addQuad(render.triRender, new Vec3(tl.x, tl.y, -0.1), new Vec3(br.x, br.y, -0.1), backgroundColor, mtx);

    let title = "nano-gpt";

    // let w = measureTextWidth(state.modelFontBuf, title, .0);
    let pad = 1;

    let { B, C, T, A, nBlocks, nHeads, vocabSize } = layout.shape;

    let paramLeft = br.x - 50;
    let paramOff = tl.y + 2;

    let paramLineHeight = 1.3;
    let paramFontScale = 4;
    let numWidth = paramFontScale * 0.6;
    let allNums = [B, C, T, A, nBlocks, nHeads];
    let maxLen = Math.max(...allNums.map(n => n.toString().length));
    let paramHeight = 2 + paramLineHeight * paramFontScale * 3 + 1;

    let titleFontScale = 13;
    let titleW = measureTextWidth(render.modelFontBuf, title, titleFontScale);
    writeTextToBuffer(render.modelFontBuf, title, titleColor, tl.x + 2, tl.y + paramHeight / 2 - titleFontScale / 2 - 1, titleFontScale, mtx);

    // layout.weightCount = 150000000000;
    let weightSize = 8;
    let weightTitleW = measureTextWidth(render.modelFontBuf, `n_params = `, paramFontScale);
    let weightOffX = 80;
    let weightCountText = numberToCommaSep(layout.weightCount);
    writeTextToBuffer(render.modelFontBuf, `n_params = `, titleColor, tl.x + weightOffX - weightTitleW, tl.y + paramHeight / 2 - paramFontScale / 2, paramFontScale, mtx);
    writeTextToBuffer(render.modelFontBuf, weightCountText, titleColor, tl.x + weightOffX, tl.y + paramHeight / 2 - weightSize / 2, weightSize, mtx);
    let infoText = "goal: sort 6 letters from { A, B, C } into ascending order";
    writeTextToBuffer(render.modelFontBuf, infoText, titleColor, tl.x + 2, tl.y + paramHeight + 2, 4, mtx);

    paramOff = tl.y + 2;
    addParam("C (channels) = ", C.toString(), dimStyleColor(DimStyle.C));
    addParam("T (time) = ", T.toString(), dimStyleColor(DimStyle.T));
    addParam("B (batches) = ", B.toString(), dimStyleColor(DimStyle.B));
    paramOff = tl.y + 2;
    paramLeft += 35;
    addParam("n_vocab = ", vocabSize.toString(), dimStyleColor(DimStyle.n_vocab));
    addParam("n_layers = ", nBlocks.toString(), dimStyleColor(DimStyle.n_layers));
    addParam("n_heads = ", nHeads.toString(), dimStyleColor(DimStyle.n_heads));

    function addParam(name: string, value: string, color: Vec4 = borderColor) {
        let y = paramOff;
        let w = measureTextWidth(render.modelFontBuf, name, paramFontScale);
        let numW = measureTextWidth(render.modelFontBuf, value, paramFontScale);
        let left = paramLeft;
        writeTextToBuffer(render.modelFontBuf, name, color,  left - w        , y, paramFontScale, mtx);
        writeTextToBuffer(render.modelFontBuf, value, color, left + maxLen * numWidth - numW, y, paramFontScale, mtx);
        paramOff += paramFontScale * paramLineHeight;
    }

    addLine(render.lineRender, thick, borderColor, new Vec3(tl.x, tl.y + paramHeight), new Vec3(br.x, tl.y + paramHeight), n, mtx);

    renderInputOutput(state, layout, new Vec3(tl.x, tl.y + paramHeight + 8, 0), new Vec3(br.x, br.y, 0), lineOpts);

    renderOutputAtBottom(state);
}

export function renderInputOutput(state: IProgramState, layout: IGptModelLayout, tl: Vec3, br: Vec3, lineOpts: ILineOpts) {
    // rect with n cells
    // each cell is a rect with a letter & number in it, the number is smaller & below the letter

    // gray out ones in the future
    // potentially cut off the ones too far in the past

    // draw rectangle
    // iter through boxes; draw each one, sampling from the input data

    let render = state.render;

    lineOpts = { ...lineOpts, thick: lineOpts.thick * 0.8 };

    let titleTextOpts: IFontOpts = { color: Vec4.fromHexColor("#666666", 1.0), mtx: lineOpts.mtx, size: 3 };

    let tokTextOpts: IFontOpts = { color: Vec4.fromHexColor("#000000", 1.0), mtx: lineOpts.mtx, size: 5 };
    let idxTextOpts: IFontOpts = { color: Vec4.fromHexColor("#666666", 1.0), mtx: lineOpts.mtx, size: 3 };


    let { T, vocabSize } = layout.shape;

    let cellW = 12;
    let inCellH = 9;

    let pad = 2;
    let inTl = new Vec3(tl.x + pad, tl.y + titleTextOpts.size + 1);
    let inBr = new Vec3(inTl.x + cellW * T, inTl.y + inCellH, 0);

    let inputTitle = "Input";
    drawText(render.modelFontBuf, inputTitle, inTl.x, tl.y, titleTextOpts);
    let tokens = layout.model?.inputBuf;
    drawLineRect(render, inTl, inBr, lineOpts);

    for (let i = 0; i < T; i++) {

        if (i > 0) {
            let lineX = inTl.x + i * cellW;
            drawLine(render.lineRender, new Vec3(lineX, inTl.y, 0), new Vec3(lineX, inBr.y, 0), lineOpts);
        }

        if (tokens && i < layout.model!.activeCount) {
            let cx = inTl.x + (i + 0.5) * cellW;

            let tokStr = sortABCInputTokenToString(tokens[i]);
            let tokW = measureText(render.modelFontBuf, tokStr, tokTextOpts);
            let idxW = measureText(render.modelFontBuf, tokens[i].toString(), idxTextOpts);
            let totalH = tokTextOpts.size + idxTextOpts.size;
            let top = inTl.y + (inCellH - totalH) / 2;

            drawText(render.modelFontBuf, tokStr, cx - tokW / 2, top, tokTextOpts);
            drawText(render.modelFontBuf, tokens[i].toString(),  cx - idxW / 2, top + tokTextOpts.size, idxTextOpts);
        }

    }

    let outputTitle = "Output";
    drawText(render.modelFontBuf, outputTitle, inTl.x, inBr.y + 1, titleTextOpts);

    let outCellH = 20;
    let outFontSize = 5;
    let outTl = new Vec3(inTl.x, inBr.y + 1 + titleTextOpts.size + 1);
    let outBr = new Vec3(inBr.x, outTl.y + outCellH, 0);
    renderOutputBoxes(state, layout, outTl, outBr, cellW, outFontSize, lineOpts);
}

export function sortABCInputTokenToString(a: number) {
    return String.fromCharCode('A'.charCodeAt(0) + a); // just A, B, C supported!
}

export function renderOutputBoxes(state: IProgramState, layout: IGptModelLayout, tl: Vec3, br: Vec3, cellW: number, fontSize: number, lineOpts: ILineOpts) {
    let render = state.render;
    let { T, vocabSize } = layout.shape;
    let outCellH = br.y - tl.y;

    let tokTextOpts: IFontOpts = { color: Vec4.fromHexColor("#000000", 1.0), mtx: lineOpts.mtx, size: fontSize };
    let idxTextOpts: IFontOpts = { color: Vec4.fromHexColor("#666666", 1.0), mtx: lineOpts.mtx, size: fontSize * 0.6 };

    let dimmedTokTextOpts: IFontOpts = { ...tokTextOpts, color: tokTextOpts.color.mul(0.3) };
    let dimmedIdxTextOpts: IFontOpts = { ...idxTextOpts, color: idxTextOpts.color.mul(0.3) };

    drawLineRect(render, tl, br, lineOpts);

    let sortedOutput = layout.model?.sortedBuf;

    for (let i = 0; i < T; i++) {
        if (i > 0) {
            let lineX = tl.x + i * cellW;
            drawLine(render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        if (sortedOutput && i < layout.model!.activeCount) {
            let usedSoFar = 0.0;
            let cx = tl.x + (i + 0.5) * cellW;

            for (let j = 0; j < vocabSize; j++) {
                let tokIdx = sortedOutput[(i * vocabSize + j) * 2 + 0];
                let tokProb = sortedOutput[(i * vocabSize + j) * 2 + 1];

                let partTop = tl.y + usedSoFar * outCellH;
                let partH = tokProb * outCellH;

                let dimmed = i < layout.model!.activeCount - 1;
                let tokOpts = dimmed ? dimmedTokTextOpts : tokTextOpts;
                let idxOpts = dimmed ? dimmedIdxTextOpts : idxTextOpts;

                let tokStr = sortABCInputTokenToString(tokIdx);
                let tokW = measureText(render.modelFontBuf, tokStr, tokOpts);
                let idxW = measureText(render.modelFontBuf, tokIdx.toString(), idxOpts);
                let textH = tokOpts.size + idxOpts.size;
                let top = partTop + (partH - textH) / 2;

                if (partH > textH) {
                    drawText(render.modelFontBuf, tokStr, cx - tokW / 2, top, tokOpts);
                    drawText(render.modelFontBuf, tokIdx.toString(),  cx - idxW / 2, top + tokOpts.size, idxOpts);
                }

                usedSoFar += tokProb;

                drawLine(render.lineRender, new Vec3(cx - cellW/2, partTop + partH, 0), new Vec3(cx + cellW/2, partTop + partH, 0), lineOpts);
                if (usedSoFar >= 1.0 - 1e-4) {
                    break;
                }
            }
        }
    }
}

let _lineRectArr = new Float32Array(3 * 4);
export function drawLineRect(render: IRenderState, tl: Vec3, br: Vec3, opts: ILineOpts) {

    _lineRectArr[0] = tl.x;
    _lineRectArr[1] = tl.y;
    _lineRectArr[2] = 0;
    _lineRectArr[3] = br.x;
    _lineRectArr[4] = tl.y;
    _lineRectArr[5] = 0;
    _lineRectArr[6] = br.x;
    _lineRectArr[7] = br.y;
    _lineRectArr[8] = 0;
    _lineRectArr[9] = tl.x;
    _lineRectArr[10] = br.y;
    _lineRectArr[11] = 0;

    drawLineSegs(render.lineRender, _lineRectArr, makeLineOpts({ ...opts, closed: true }));
}

function numberToCommaSep(a: number) {
    let s = a.toString();
    let out = "";
    for (let i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 == 0) {
            out += ",";
        }
        out += s[i];
    }
    return out;
}


function renderOutputAtBottom(state: IProgramState) {
    let layout = state.layout;

    let softmax = layout.logitsSoftmax;


    let topMid = new Vec3(softmax.x + softmax.dx/2, softmax.y + softmax.dy + layout.margin);

    let outCellH = 10;
    let outCellW = 6;

    let nCells = layout.shape.T;
    let tl = new Vec3(topMid.x - outCellW * nCells / 2, topMid.y);
    let br = new Vec3(topMid.x + outCellW * nCells / 2, topMid.y + outCellH);

    let lineOpts = makeLineOpts({ color: Vec4.fromHexColor("#000000", 0.2), mtx: new Mat4f(), thick: 1.5 });

    renderOutputBoxes(state, layout, tl, br, outCellW, 4, lineOpts);

    for (let i = 0; i < nCells; i++) {
        let tx = cellPosition(layout, softmax, Dim.X, i) + 0.5 * layout.cell;
        let ty = softmax.y + softmax.dy + 0.5 * layout.cell;
        let bx = tl.x + (i + 0.5) * outCellW;
        let by = tl.y - layout.cell;

        let midY1 = lerp(ty, by, 1/6);
        let midY2 = lerp(ty, by, 3/4);

        drawLine(state.render.lineRender, new Vec3(tx, ty), new Vec3(tx, midY1), lineOpts);
        drawLine(state.render.lineRender, new Vec3(tx, midY1), new Vec3(bx, midY2), lineOpts);
        drawLine(state.render.lineRender, new Vec3(bx, midY2), new Vec3(bx, by), lineOpts);

        let arrLen = 0.6;
        let arrowLeft = new Vec3(bx - arrLen, by - arrLen);
        let arrowRight = new Vec3(bx + arrLen, by - arrLen);
        drawLine(state.render.lineRender, arrowLeft, new Vec3(bx, by), lineOpts);
        drawLine(state.render.lineRender, arrowRight, new Vec3(bx, by), lineOpts);
    }

}
