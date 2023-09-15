import { TextAlignHoriz, TextAlignVert } from "../Annotations";
import { IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import { addLine } from "../render/lineRender";
import { IRenderState } from "../render/modelRender";
import { lerp } from "@/src/utils/math";
import { Mat4f } from "@/src/utils/matrix";
import { Vec3, Vec4 } from "@/src/utils/vector";

export function drawBlockLabels(state: IRenderState, layout: IGptModelLayout) {

    // probably should limit this to specific blocks (defined by walkthrough)
    // can configure this on the blocks themselves, or the layout object
    // either way, this runs after the walkthrough, for positioning, and the walkthrough
    // needs to configure this is some way

    let baseColor = new Vec4(0.4, 0.4, 0.4, 1.0);

    {
        let color = baseColor.mul(layout.embedLabel.visible);
        let tl = new Vec3(layout.tokEmbedObj.x - layout.margin * 2, layout.tokEmbedObj.y, 0);
        let br = new Vec3(layout.tokEmbedObj.x - layout.margin * 2, layout.tokEmbedObj.y + layout.tokEmbedObj.dy, 0);
        drawSectionLabel(state, "Embedding", tl, br, { color, fontSize: 6, pad: 4 });
    }

    let transformerIdx = 0;
    for (let block of layout.blocks) {
        let blockTop = block.ln1.lnResid.y - layout.margin / 2;
        let blockBottom = block.mlpResult.y + block.mlpResult.dy + layout.margin / 2;
        let mlpLeft = block.mlpProjBias.x - layout.margin * 3;
        let headLeft = block.projBias.x - layout.margin;
        let attnLabelLeft = headLeft - layout.margin * 3;
        let attnLeft = lerp(headLeft, mlpLeft, 0.6);

        let attnProjTop = block.attnOut.y - layout.margin / 2;
        let attnProjBot = block.attnOut.y + block.attnOut.dy + layout.margin / 2;
        let mlpTop = block.mlpFcBias.y - layout.margin / 2;

        let blockLeft = mlpLeft - layout.margin * 6;

        {
            let color = baseColor.mul(block.mlpResidual.opacity * block.transformerLabel.visible);
            let tl = new Vec3(blockLeft, blockTop, 0);
            let br = new Vec3(blockLeft, blockBottom, 0);
            drawSectionLabel(state, `Transformer ${transformerIdx}`, tl, br, { color, fontSize: 26 });
        }

        {
            let color = baseColor.mul(block.attnResidual.opacity * block.selfAttendLabel.visible);
            let tl = new Vec3(attnLeft, blockTop, 0);
            let br = new Vec3(attnLeft, attnProjBot, 0);
            drawSectionLabel(state, `Self-attention`, tl, br, { color, fontSize: 12 });
        }

        {
            let color = baseColor.mul(block.mlpAct.opacity * block.mlpLabel.visible);
            let tl = new Vec3(mlpLeft, mlpTop, 0);
            let br = new Vec3(mlpLeft, blockBottom, 0);
            drawSectionLabel(state, `MLP`, tl, br, { color, fontSize: 12 });
        }

        {
            let color = baseColor.mul(block.attnOut.opacity * block.projLabel.visible);
            let tl = new Vec3(attnLabelLeft, attnProjTop, 0);
            let br = new Vec3(attnLabelLeft, attnProjBot, 0);
            drawSectionLabel(state, `Projection`, tl, br, { color, fontSize: 10 });
        }

        let headIdx = 0;
        for (let head of block.heads) {

            {
                let color = baseColor.mul(head.attnMtx.opacity * head.headLabel.visible);
                let tl = new Vec3(attnLabelLeft, head.vBlock.y, head.vBlock.z + head.vBlock.dz / 2);
                let br = new Vec3(attnLabelLeft, head.qBlock.y + head.qBlock.dy, head.qBlock.z + head.qBlock.dz / 2);
                if (head.qBlock.y !== head.vBlock.y) {
                    tl = new Vec3(attnLabelLeft, head.vBlock.y, head.vOutBlock.z + head.vOutBlock.dz / 2);
                    br = new Vec3(attnLabelLeft, head.vOutBlock.y + head.vOutBlock.dy, head.vOutBlock.z + head.vOutBlock.dz / 2);
                }

                drawSectionLabel(state, `Head ${headIdx}`, tl, br, { color, fontSize: 10 });
            }


            {
                let color = baseColor.mul(head.qBlock.opacity * head.qLabel.visible);
                let tl = new Vec3(headLeft, head.qBlock.y, head.qBlock.z + head.qBlock.dz / 2);
                let br = new Vec3(headLeft, head.qBlock.y + head.qBlock.dy, head.qBlock.z + head.qBlock.dz / 2);
                drawSectionLabel(state, `Q`, tl, br, { color, fontSize: 6, pad: 4 });
            }

            {
                let color = baseColor.mul(head.kBlock.opacity * head.kLabel.visible);
                let tl = new Vec3(headLeft, head.kBlock.y, head.kBlock.z + head.kBlock.dz / 2);
                let br = new Vec3(headLeft, head.kBlock.y + head.kBlock.dy, head.kBlock.z + head.kBlock.dz / 2);
                drawSectionLabel(state, `K`, tl, br, { color, fontSize: 6, pad: 4 });
            }

            {
                let color = baseColor.mul(head.vBlock.opacity * head.vLabel.visible);
                let tl = new Vec3(headLeft, head.vBlock.y, head.vBlock.z + head.vBlock.dz / 2);
                let br = new Vec3(headLeft, head.vBlock.y + head.vBlock.dy, head.vBlock.z + head.vBlock.dz / 2);
                drawSectionLabel(state, `V`, tl, br, { color, fontSize: 6, pad: 4 });
            }

            headIdx++;
        }

        transformerIdx++;
    }

}

export interface ILabelOpts {
    color: Vec4;
    fontSize: number;
    textAlign?: TextAlignHoriz;
    textAlignV?: TextAlignVert;
    pad?: number;
}

function drawSectionLabel(state: IRenderState, text: string, tl: Vec3, br: Vec3, opts: ILabelOpts) {
    let mtx = new Mat4f();
    mtx[14] = (tl.z + br.z) / 2;

    let color = opts.color;
    let fontScale = opts.fontSize;
    let pad = opts.pad ?? 10;

    let textColor = color;
    let lineColor = color.mul(0.4);

    let tw = measureTextWidth(state.modelFontBuf, text, fontScale);

    writeTextToBuffer(state.modelFontBuf, text, textColor, tl.x - tw - 2 * pad, (tl.y + br.y) / 2 - fontScale / 2, fontScale, mtx);

    let p0 = new Vec3(tl.x, tl.y, (tl.z + br.z) / 2);
    let p1 = new Vec3(br.x, br.y, (tl.z + br.z) / 2);

    if (tl.z != br.z) {
        p0 = new Vec3(tl.x, (tl.y + br.y) / 2, tl.z);
        p1 = new Vec3(tl.x, (tl.y + br.y) / 2, br.z);
    }

    let inward = new Vec3(1, 0, 0);

    addLine(state.lineRender, 1.0, lineColor, p0.mulAdd(inward, -pad), p1.mulAdd(inward, -pad), undefined);

    addLine(state.lineRender, 1.0, lineColor, p0.mulAdd(inward, -pad), p0, undefined);
    addLine(state.lineRender, 1.0, lineColor, p1.mulAdd(inward, -pad), p1, undefined);

}
