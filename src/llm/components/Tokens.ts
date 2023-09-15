import { IColorMix } from "../Annotations";
import { cellPosition, IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import { Mat4f } from "@/src/utils/matrix";
import { Dim, Vec3, Vec4 } from "@/src/utils/vector";
import { addLine, addLine2, ILineOpts } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { IDisplayState } from "../Program";

export function drawTokens(renderState: IRenderState, layout: IGptModelLayout, display: IDisplayState, data?: Float32Array, count?: number) {
    let { modelFontBuf: fontBuf, lineRender } = renderState;

    // Just rendering the 0, 1, 2 tokens, with plans to advance to the GPT text model etc

    data = data ?? layout.model?.inputTokens?.localBuffer ?? new Float32Array([0, 1, 2]);
    count = count || 6;

    // may scale with view
    let em = layout.cell * 2;

    let lowerFontSize = em * 1;
    let upperFontSize = em * 2;

    let yLower = layout.idxObj.y - lowerFontSize - layout.cell * 3;
    let yUpper = yLower - upperFontSize;

    function tokenIndexToString(a: number) {
        return String.fromCharCode('A'.charCodeAt(0) + a); // just A, B, C supported!
    }

    let strParts = [];
    let strOffset = 0;
    let idxOffset = 0;
    let i = 0;
    for (let a of data) {
        if (i >= count) {
            break;
        }
        let str = tokenIndexToString(a);
        let w = measureTextWidth(fontBuf, str, upperFontSize);
        let w2 = measureTextWidth(fontBuf, '' + a, lowerFontSize);
        strParts.push({ str, val: a, w, offset: strOffset, w2, idxOffset, i });
        strOffset += w;
        idxOffset += w2;
        i += 1;
    }

    let target = layout.idxObj;
    let mtxRes = new Mat4f();
    let totalOffset = -strOffset / 2 - layout.cell / 2 * (count - 1);

    let tokColor = dimStyleColor(DimStyle.Token);
    let tokIdxColor = dimStyleColor(DimStyle.TokenIdx);

    for (let a of strParts) {
        let tokDrawColor = tokColor;
        if (display.tokenColors) {
            let val = display.tokenColors.mixes[a.i];
            if (val > 0.0) {
                tokDrawColor = Vec4.lerp(tokColor, display.tokenColors.color2, val);
            }
        }

        let tokIdxDrawColor = tokIdxColor;
        if (display.tokenIdxColors) {
            let val = display.tokenIdxColors.mixes[a.i];
            if (val > 0.0) {
                tokIdxDrawColor = Vec4.lerp(tokIdxColor, display.tokenIdxColors.color2, val);
            }
        }
        if (display.tokenIdxModelOpacity) {
            tokIdxDrawColor = tokIdxDrawColor.mul(display.tokenIdxModelOpacity[a.i]);
        }

        writeTextToBuffer(fontBuf, a.str, tokDrawColor, totalOffset + a.offset, yUpper, upperFontSize, mtxRes);

        let x = totalOffset + a.offset + a.w / 2 - a.w2 / 2;

        writeTextToBuffer(fontBuf, '' + a.val, tokIdxDrawColor, x, yLower, lowerFontSize, mtxRes);

        let tx = x + a.w2 / 2;
        let bx = cellPosition(layout, target, Dim.X, a.i) + layout.cell * 0.5;
        let top = -4;
        let delta = 0.6;
        let bot = -0.3;
        let thick = 0.03;
        let opts: ILineOpts = { color: tokIdxDrawColor, thick, n: new Vec3(0,0,1), mtx: new Mat4f() };
        addLine2(lineRender, new Vec3(tx, top, 0), new Vec3(tx, top + delta, 0), opts);
        addLine2(lineRender, new Vec3(tx, top + delta, 0), new Vec3(bx, bot - delta, 0), opts);
        addLine2(lineRender, new Vec3(bx, bot - delta, 0), new Vec3(bx, bot, 0), opts);
    }
}
