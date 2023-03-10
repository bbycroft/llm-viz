import { cameraToMatrixView } from "../Camera";
import { IGptModelLayout, IModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import { addLine } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { addQuad } from "../render/triRender";
import { Mat4f } from "../utils/matrix";
import { Vec3, Vec4 } from "../utils/vector";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";

export function renderModelCard(state: IRenderState, layout: IGptModelLayout) {

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

    let gl = state.gl;
    let { camPos } = cameraToMatrixView(state.camera);
    let dist = camPos.dist(new Vec3(0, 0, -30));

    let scale = Math.max(dist / 500.0, 1.0);

    let mtx = Mat4f.fromScaleTranslation(new Vec3(scale, scale, scale), new Vec3(0, -30, 0))
        .mul(Mat4f.fromTranslation(new Vec3(0, 30, 0)));

    let thick = 1.0 / 10.0 * scale;
    let borderColor = Vec4.fromHexColor("#555555", 0.8);
    let backgroundColor = Vec4.fromHexColor("#999999", 0.3);
    let titleColor = Vec4.fromHexColor("#000000", 1.0);
    let n = new Vec3(0, 0, 1);

    let tl = new Vec3(-110, -80, 0);
    let br = new Vec3( 110, -30, 0);
    let corners = [tl, new Vec3(br.x, tl.y, 0), br, new Vec3(tl.x, br.y, 0)];
    for (let i = 0; i < 4; i++) {
        let a = corners[i];
        let b = corners[(i + 1) % 4];

        addLine(state.lineRender, thick, borderColor, a, b, n, mtx);
    }

    addQuad(state.triRender, new Vec3(tl.x, tl.y, -0.1), new Vec3(br.x, br.y, -0.1), backgroundColor, mtx);

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
    let titleW = measureTextWidth(state.modelFontBuf, title, titleFontScale);
    writeTextToBuffer(state.modelFontBuf, title, titleColor, tl.x + 2, tl.y + paramHeight / 2 - titleFontScale / 2 - 1, titleFontScale, mtx);

    // layout.weightCount = 150000000000;
    let weightSize = 8;
    let weightTitleW = measureTextWidth(state.modelFontBuf, `n_params = `, paramFontScale);
    let weightOffX = 80;
    let weightCountText = numberToCommaSep(layout.weightCount);
    writeTextToBuffer(state.modelFontBuf, `n_params = `, titleColor, tl.x + weightOffX - weightTitleW, tl.y + paramHeight / 2 - paramFontScale / 2, paramFontScale, mtx);
    writeTextToBuffer(state.modelFontBuf, weightCountText, titleColor, tl.x + weightOffX, tl.y + paramHeight / 2 - weightSize / 2, weightSize, mtx);
    let infoText = "goal: sort 6 letters from { A, B, C } into ascending order";
    writeTextToBuffer(state.modelFontBuf, infoText, titleColor, tl.x + 2, tl.y + paramHeight + 2, 4, mtx);

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
        let w = measureTextWidth(state.modelFontBuf, name, paramFontScale);
        let numW = measureTextWidth(state.modelFontBuf, value, paramFontScale);
        let left = paramLeft;
        writeTextToBuffer(state.modelFontBuf, name, color,  left - w        , y, paramFontScale, mtx);
        writeTextToBuffer(state.modelFontBuf, value, color, left + maxLen * numWidth - numW, y, paramFontScale, mtx);
        paramOff += paramFontScale * paramLineHeight;
    }

    addLine(state.lineRender, thick, borderColor, new Vec3(tl.x, tl.y + paramHeight), new Vec3(br.x, tl.y + paramHeight), n, mtx);

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
