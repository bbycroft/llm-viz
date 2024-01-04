import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { IComp, ICompPort } from "../CpuModel";


export function rotateAffineInt(r: number) {
    switch (r) {
        case 0: return new AffineMat2d(1, 0, 0, 1, 0, 0);
        case 1: return new AffineMat2d(0, 1, -1, 0, 0, 0);
        case 2: return new AffineMat2d(-1, 0, 0, -1, 0, 0);
        case 3: return new AffineMat2d(0, -1, 1, 0, 0, 0);
        default: return new AffineMat2d();
    }
}

export function rotateBboxInt(r: number, pos: Vec3, size: Vec3): BoundingBox3d {
    let bb = new BoundingBox3d();
    bb.empty = false;

    if (r === 0) { // 0 (facing right)
        bb.min.x = pos.x;
        bb.min.y = pos.y;
        bb.max.x = pos.x + size.x;
        bb.max.y = pos.y + size.y;
    } else if (r === 1) { // 90 (facing down)
        bb.min.x = pos.x - size.y;
        bb.min.y = pos.y;
        bb.max.x = pos.x;
        bb.max.y = pos.y + size.x;
    } else if (r === 2) { // 180 (facing left)
        bb.min.x = pos.x - size.x;
        bb.min.y = pos.y - size.y;
        bb.max.x = pos.x;
        bb.max.y = pos.y;
    } else if (r === 3) { // 270 (facing up)
        bb.min.x = pos.x;
        bb.min.y = pos.y - size.x;
        bb.max.x = pos.x + size.y;
        bb.max.y = pos.y;
    }

    return bb;
}

export function rotatePos(r: number, pos: Vec3): Vec3 {
    if (r === 0) return pos;
    if (r === 1) return new Vec3(-pos.y, pos.x);
    if (r === 2) return new Vec3(-pos.x, -pos.y);
    if (r === 3) return new Vec3(pos.y, -pos.x);
    return pos;
}

export function rotatedBbPivotPoint(r: number, bb: BoundingBox3d): Vec3 {
    if (r === 0) return bb.min;
    if (r === 1) return new Vec3(bb.max.x, bb.min.y);
    if (r === 2) return bb.max;
    if (r === 3) return new Vec3(bb.min.x, bb.max.y);
    return Vec3.zero;
}

export function invertRotation(r: number): number {
    return (4 - (r % 4)) % 4;
}

export function rotateCompPortPos(comp: IComp, port: ICompPort): Vec3 {
    let x = comp.pos.x;
    let y = comp.pos.y;
    let r = comp.rotation;
    if (r === 0) { x += port.pos.x; y += port.pos.y; }
    if (r === 1) { x -= port.pos.y; y += port.pos.x; }
    if (r === 2) { x -= port.pos.x; y -= port.pos.y; }
    if (r === 3) { x += port.pos.y; y -= port.pos.x; }
    return new Vec3(x, y);
}

export function rotateCompIsHoriz(comp: IComp, isHoriz: boolean): boolean {
    let r = comp.rotation;
    return r === 0 || r === 2;
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

    return rotateAffineInt(r);

    // return AffineMat2d.multiply(
    //     AffineMat2d.translateVec(center),          // 3) translate back
    //     rotateAffineInt(r),                        // 2) rotate
    //     AffineMat2d.translateVec(center.mul(-1))); // 1) translate to origin
}

export function rotatePortsInPlace(comp: IComp<any>, r: number, baseSize: Vec3) {
    // size: (width, height)
    // want to switch width and height if r is 1 or 3
    // let r2 = comp.rotation;

    // let mat = rotateAboutAffineInt(r, comp.size);
    // comp.ports = comp.ports.map(p => {
    //     return { ...p, pos: rotatePos(r2, p.pos) }
    // });
    // comp.rotation = r;
    // if (r === 1 || r === 3) {
    //     comp.size = new Vec3(comp.size.y, comp.size.x);
    // }
}

export function createBitWidthMask(width: number) {
    if (width === 32) return 0xffffffff;
    return (1 << width) - 1;
}
