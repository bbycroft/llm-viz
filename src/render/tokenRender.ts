import { IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../utils/font";
import { Mat4f } from "../utils/matrix";
import { IGLContext } from "../utils/shader";
import { Vec3 } from "../utils/vector";
import { IRenderState } from "./modelRender";

export function renderTokens(ctx: IGLContext, renderState: IRenderState, layout: IGptModelLayout, data?: Float32Array, count?: number) {
    let { modelFontBuf: fontBuf } = renderState;

    // Just rendering the 0, 1, 2 tokens, with plans to advance to the GPT text model etc

    data = data || new Float32Array([0, 1, 2, 1, 2, 1, 0, 0, 0, 0, 0]);
    count = count || 6;

    // may scale with view
    let em = layout.cell * 2;

    let lowerFontSize = em * 1;
    let upperFontSize = em * 2;

    let zLower = layout.idxObj.z - lowerFontSize - layout.cell * 2;
    let zUpper = zLower - upperFontSize;

    function tokenIndexToString(a: number) {
        return '' + a; // just 0, 1, 2 supported!
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
        strParts.push({ str, val: a, w, offset: strOffset, w2, idxOffset });
        strOffset += w;
        idxOffset += w2;
        i += 1;
    }

    let target = layout.idxObj;
    let mtx3 = Mat4f.fromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    let mtx2 = Mat4f.fromTranslation(new Vec3(0, 0, 0));
    let mtxRes = mtx2.mul(mtx3);
    let totalOffset = -strOffset / 2;

    for (let a of strParts) {
        writeTextToBuffer(fontBuf, a.str, totalOffset + a.offset, zUpper, upperFontSize, mtxRes);

        let x = totalOffset + a.offset + a.w / 2 - a.w2 / 2;

        writeTextToBuffer(fontBuf, '' + a.val, x, zLower, lowerFontSize, mtxRes);
    }
}
