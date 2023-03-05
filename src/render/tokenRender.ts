import { IColorMix } from "../Annotations";
import { cellPosition, IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../utils/font";
import { Mat4f } from "../utils/matrix";
import { Vec3, Vec4 } from "../utils/vector";
import { Dim } from "../Walkthrough";
import { addLine } from "./lineRender";
import { IRenderState } from "./modelRender";

export function renderTokens(renderState: IRenderState, layout: IGptModelLayout, data?: Float32Array, count?: number, mix?: IColorMix) {
    let { modelFontBuf: fontBuf, lineRender } = renderState;

    // Just rendering the 0, 1, 2 tokens, with plans to advance to the GPT text model etc

    data = data ?? layout.model?.inputBuf ?? new Float32Array([0, 1, 2]);
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

    let color = new Vec4(0.5, 0.6, 0.5, 1);

    for (let a of strParts) {

        let drawColor = color;
        if (mix) {
            let val = mix.mixes[a.i];
            if (val > 0.0) {
                drawColor = Vec4.lerp(color, mix.color2, val);
            }
        }

        writeTextToBuffer(fontBuf, a.str, drawColor, totalOffset + a.offset, yUpper, upperFontSize, mtxRes);

        let x = totalOffset + a.offset + a.w / 2 - a.w2 / 2;

        writeTextToBuffer(fontBuf, '' + a.val, drawColor, x, yLower, lowerFontSize, mtxRes);


        let tx = x + a.w2 / 2;
        let bx = cellPosition(layout, target, Dim.X, a.i) + layout.cell * 0.5;
        let top = -4;
        let delta = 0.6;
        let bot = -0.3;
        let thick = 4;
        addLine(lineRender, thick, drawColor, new Vec3(tx, top, 0), new Vec3(tx, top + delta, 0));
        addLine(lineRender, thick, drawColor, new Vec3(tx, top + delta, 0), new Vec3(bx, bot - delta, 0));
        addLine(lineRender, thick, drawColor, new Vec3(bx, bot - delta, 0), new Vec3(bx, bot, 0));
    }
}
