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

export function rotateAboutAffineInt(r: number, center: Vec3) {
    return AffineMat2d.multiply(
        AffineMat2d.translateVec(center),          // 3) translate back
        rotateAffineInt(r),                        // 2) rotate
        AffineMat2d.translateVec(center.mul(-1))); // 1) translate to origin
}

export function rotatePortsInPlace(comp: IComp<any>, r: number, center: Vec3) {
    let mat = rotateAboutAffineInt(r, center);
    comp.ports = comp.ports.map(p => {
        return { ...p, pos: mat.mulVec3(p.pos) }
    });
    // if (r === 1 || r === 3) {
    //     comp.size = new Vec3(comp.size.y, comp.size.x);
    // }
}

export function createBitWidthMask(width: number) {
    if (width === 32) return 0xffffffff;
    return (1 << width) - 1;
}
