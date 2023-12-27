import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { Vec3 } from "@/src/utils/vector";
import { IComp } from "../CpuModel";


export function rotateAffineInt(r: number) {
    switch (r) {
        case 0: return new AffineMat2d(1, 0, 0, 1, 0, 0);
        case 1: return new AffineMat2d(0, 1, -1, 0, 0, 0);
        case 2: return new AffineMat2d(-1, 0, 0, -1, 0, 0);
        case 3: return new AffineMat2d(0, -1, 1, 0, 0, 0);
        default: return new AffineMat2d();
    }
}

export function rotateAboutAffineInt(r: number, size: Vec3) {
    let center: Vec3 = Vec3.zero;

    if (r === 0 || r === 2) {
        center = size.mul(0.5);
    } else {
        let maxDim = Math.max(size.x, size.y);
        let minDim = Math.min(size.x, size.y);

        if (r === 1) {
            center = new Vec3(maxDim / 2, maxDim / 2);
        } else if (r === 3) {
            center = new Vec3(minDim / 2, minDim / 2);
        }
    }

    return AffineMat2d.multiply(
        AffineMat2d.translateVec(center),          // 3) translate back
        rotateAffineInt(r),                        // 2) rotate
        AffineMat2d.translateVec(center.mul(-1))); // 1) translate to origin
}

export function rotatePortsInPlace(comp: IComp<any>, r: number, baseSize: Vec3) {
    // size: (width, height)
    // want to switch width and height if r is 1 or 3

    let mat = rotateAboutAffineInt(r, comp.size);
    comp.ports = comp.ports.map(p => {
        return { ...p, pos: mat.mulVec3(p.pos) }
    });
    if (r === 1 || r === 3) {
        comp.size = new Vec3(comp.size.y, comp.size.x);
    }
}

export function createBitWidthMask(width: number) {
    if (width === 32) return 0xffffffff;
    return (1 << width) - 1;
}
