import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { IEditSnapshot } from "./CpuModel";


export function computeModelBoundingBox(model: IEditSnapshot): BoundingBox3d {
    let modelBbb = new BoundingBox3d();

    for (let c of model.comps) {
        modelBbb.addInPlace(c.pos);
        modelBbb.addInPlace(c.pos.add(c.size));
    }
    for (let w of model.wires) {
        for (let n of w.nodes) {
            modelBbb.addInPlace(n.pos);
        }
    }
    if (model.compBbox) {
        modelBbb.combineInPlace(model.compBbox);
    }

    return modelBbb;
}

export function computeZoomExtentMatrix(modelBb: BoundingBox3d, viewBb: BoundingBox3d, expandFraction: number): AffineMat2d {
    let bb = new BoundingBox3d(modelBb.min, modelBb.max);
    bb.expandInPlace(modelBb.size().mul(expandFraction).len());

    let modelSize = bb.size();
    let viewSize = viewBb.size();

    let mtx = AffineMat2d.multiply(
        AffineMat2d.translateVec(viewBb.center()),
        AffineMat2d.scale1(Math.min(viewSize.x / modelSize.x, viewSize.y / modelSize.y)),
        AffineMat2d.translateVec(bb.center().mul(-1)),
    );

    return mtx;
}
