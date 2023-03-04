import { cellPositionX, IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../utils/font";
import { Mat4f } from "../utils/matrix";
import { Vec3, Vec4 } from "../utils/vector";
import { addLine } from "./lineRender";
import { IRenderState } from "./modelRender";

export function renderTokens(renderState: IRenderState, layout: IGptModelLayout, data?: Float32Array, count?: number) {
    let { modelFontBuf: fontBuf, lineRender } = renderState;

    // Just rendering the 0, 1, 2 tokens, with plans to advance to the GPT text model etc

    data = data ?? layout.model?.inputBuf ?? new Float32Array([0, 1, 2]);
    count = count || 6;

    // may scale with view
    let em = layout.cell * 2;

    let lowerFontSize = em * 1;
    let upperFontSize = em * 2;

    let zLower = layout.idxObj.z - lowerFontSize - layout.cell * 3;
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
        strParts.push({ str, val: a, w, offset: strOffset, w2, idxOffset, i });
        strOffset += w;
        idxOffset += w2;
        i += 1;
    }

    let target = layout.idxObj;
    let mtx3 = Mat4f.fromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    let mtx2 = Mat4f.fromTranslation(new Vec3(0, 0, 0));
    let mtxRes = mtx2.mul(mtx3);
    let totalOffset = -strOffset / 2 - layout.cell / 2 * (count - 1);

    let color = new Vec4(0.5, 0.6, 0.5, 1);

    for (let a of strParts) {
        writeTextToBuffer(fontBuf, a.str, color, totalOffset + a.offset, zUpper, upperFontSize, mtxRes);

        let x = totalOffset + a.offset + a.w / 2 - a.w2 / 2;

        writeTextToBuffer(fontBuf, '' + a.val, color, x, zLower, lowerFontSize, mtxRes);


        let tx = x + a.w2 / 2;
        let bx = cellPositionX(layout, target, a.i) + layout.cell * 0.5;
        let top = 4;
        let delta = 0.6;
        let bot = 0.3;
        let thick = 4;
        addLine(lineRender, thick, color, new Vec3(tx, 0, top), new Vec3(tx, 0, top - delta));
        addLine(lineRender, thick, color, new Vec3(tx, 0, top - delta), new Vec3(bx, 0, bot + delta));
        addLine(lineRender, thick, color, new Vec3(bx, 0, bot + delta), new Vec3(bx, 0, bot));
    }
}
