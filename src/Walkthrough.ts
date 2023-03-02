import { IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { IRenderState, IRenderView } from "./render/modelRender";
import { clamp } from "./utils/data";
import { Mat4f } from "./utils/matrix";
import { Vec3 } from "./utils/vector";

export interface IWalkthroughOutput {
    layout: IGptModelLayout;
}

export function modifyCells(state: IRenderState, view: IRenderView, layout: IGptModelLayout) {

    let idxObj = layout.idxObj;
    let residual0 = layout.residual0;

    let offset = ((view.time * 0.002) % (idxObj.cx + 2.0)) - 1.0;
    view.markDirty();

    let cubes = [...layout.cubes];

    let splitAmt = 2.0;
    let idxBlks = splitGridZ(idxObj, offset, splitAmt, layout.cell);
    let residBlks = splitGridZ(residual0, offset, splitAmt, layout.cell);

    cubes = [...layout.cubes.filter(a => a !== idxObj && a !== residual0), ...idxBlks, ...residBlks];

    return { layout: { ...layout, cubes } };
}

export function splitGridZ(blk: IBlkDef, xSplit: number, splitAmt: number, cell: number) {

    // generate several new blocks (let's say up to 5) that are neighbouring the zSplit point

    // main-left, left, center, right, main-right

    // choose center as floor(zSplit), left is floor(zSplit) - 1, right is floor(zSplit) + 1
    // main-left and main-right are the remaining
    // only create those if there's space

    // The splitAmt governs the overall gap between blocks
    // Want a rotating-block-under-examination effect. When zSplit is right down the center (x + 0.5)
    // Have max seperation, and effectively join left & right with their main
    // For partial zSplits, will show 3 gaps

    // Let's just split evenly for now

    let xCenter = Math.floor(xSplit);

    let blocks: IBlkDef[] = [];

    function addSubBlock(iStart: number, iEnd: number, xOffset: number) {
        if (iStart >= iEnd || iEnd <= 0 || iStart >= blk.cx) {
            return;
        }

        let mtx = Mat4f.fromScaleTranslation(new Vec3((iEnd - iStart) / blk.cx, 1, 1), new Vec3(iStart / blk.cx, 0, 0));

        blocks.push({ ...blk,
            localMtx: mtx,
            x: blk.x + iStart * cell + xOffset,
            dx: (iEnd - iStart) * cell,
            // z: blk.z - cell * 1.3
        });
    }

    let scale = 0.5;
    let fract = (xSplit - xCenter - 0.5) * scale + 0.5;

    // let offset = smoothstepAlt(-w2, 0, xSplit / blk.cx);
    let offset = smoothstepAlt(-splitAmt, 0, (xSplit - 0.5) * scale + 0.5);

    addSubBlock(0, xCenter - 1, offset + 0.0);
    addSubBlock(xCenter - 1, xCenter, offset + smoothstepAlt(splitAmt, 0, fract + scale));
    addSubBlock(xCenter, xCenter + 1, offset + smoothstepAlt(splitAmt, 0, fract));
    addSubBlock(xCenter + 1, xCenter + 2, offset + smoothstepAlt(splitAmt, 0, fract - scale));
    addSubBlock(xCenter + 2, blk.cx, offset + splitAmt);

    return blocks;
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * clamp(t, 0, 1);
}

// we lerp after running the smoothstep
function smoothstepAlt(a: number, b: number, t: number) {
    t = clamp(t, 0, 1);
    return lerp(a, b, t * t * (3 - 2 * t));
}
