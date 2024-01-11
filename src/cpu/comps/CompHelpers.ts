import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, ICompPort, IEditContext, IEditorState, IRenderStyles, RectSide } from "../CpuModel";
import { StateSetter, assignImm } from "@/src/utils/data";
import { editCompConfig } from "../Editor";
import { CSSProperties } from "react";

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
    let px = port.pos.x;
    let py = port.pos.y;
    let r = comp.rotation;
    if (r === 0) { x += px; y += py; }
    if (r === 1) { x -= py; y += px; }
    if (r === 2) { x -= px; y -= py; }
    if (r === 3) { x += py; y -= px; }
    return new Vec3(x, y);
}

export function rotateCompPortInnerPos(comp: IComp, port: ICompPort): Vec3 {
    let x = comp.pos.x;
    let y = comp.pos.y;
    let px = port.pos.x;
    let py = port.pos.y;

    if (px === 0) {
        px += 0.5;
    }
    if (py === 0) {
        py += 0.5;
    }
    if (px === comp.size.x) {
        px -= 0.5;
    }
    if (py === comp.size.y) {
        py -= 0.5;
    }

    let r = comp.rotation;
    if (r === 0) { x += px; y += py; }
    if (r === 1) { x -= py; y += px; }
    if (r === 2) { x -= px; y -= py; }
    if (r === 3) { x += py; y -= px; }
    return new Vec3(x, y);
}

export function rotateCompIsHoriz(comp: IComp, isHoriz: boolean): boolean {
    let r = comp.rotation;
    return r === 0 || r === 2;
}

export function rotateRectSide(r: number, side: RectSide) {
    return (side + r) % 4;
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

export function signExtend8Bit(x: number) {
    return ((x & 0x80) !== 0) ? x - 0x100 : x;
}

export function signExtend12Bit(x: number) {
    return ((x & 0x800) !== 0) ? x - 0x1000 : x;
}

export function signExtend16Bit(x: number) {
    return ((x & 0x8000) !== 0) ? x - 0x10000 : x;
}

export function signExtend20Bit(x: number) {
    return (x & (1 << 19)) ? x - (1 << 20) : x;
}

export function signExtend32Bit(x: number) {
    return ((x & 0x80000000) !== 0) ? x - 0x100000000 : x;
}

let u32Arr = new Uint32Array(1);
let s32Arr = new Int32Array(1);

export function ensureSigned32Bit(x: number) {
    s32Arr[0] = x;
    return s32Arr[0];
}

export function ensureUnsigned32Bit(x: number) {
    u32Arr[0] = x;
    return u32Arr[0];
}


export function regValToStr(val: number, signed: boolean = true) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = signed ? ensureSigned32Bit(val) : valU32;
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(8, "0");
    if (Math.abs(valS32) < 100000) {
        let pcValStr = valS32.toString().padStart(2, "0");
        return pcValStr + ' ' + pcHexStr;
    }
    return pcHexStr;
}

export function aluValToStr(val: number, hexChars: number = 8, signed: boolean = true) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = signed ? ensureSigned32Bit(val) : valU32;
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(hexChars, "0");
    if (Math.abs(valS32) < 100000) {
        let pcValStr = valS32.toString().padStart(2, "0");
        return pcHexStr + ' (' + pcValStr + ')';
    }
    return pcHexStr;
}

export const registerOpts = {
    innerPadX: 0.4,
}

const scalePerCell = 15;

export function createCanvasDivStyle(comp: IComp): CSSProperties {

    let scale = scalePerCell;
    let pos = comp.bb.min;
    let size = comp.bb.size();

    return {
        width: size.x * scale,
        height: size.y * scale,
        transform: `translate(${pos.x}px, ${pos.y}px) scale(${1/scale})`,
    };
}

export function makeEditFunction<T, A>(setEditorState: StateSetter<IEditorState>, editCtx: IEditContext, comp: IComp<T>, updateFn: (value: A, prev: T) => Partial<T>) {
    return (end: boolean, value: A) => {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, updateFn(value, a))));
    };
}

export function transformCanvasToRegion(cvs: ICanvasState, styles: IRenderStyles, comp: IComp, bb: BoundingBox3d) {
    let ctx = cvs.ctx;

    let targetSize = comp.size;
    let bbSize = bb.size();
    ctx.translate(bb.min.x, bb.min.y);
    let scale = Math.min(bbSize.x / targetSize.x, bbSize.y / targetSize.y);
    ctx.scale(scale, scale);

    if (bbSize.x < comp.bb.size().x) {
        ctx.save();
        ctx.filter = `blur(4px)`;
        ctx.strokeStyle = styles.fillColor;
        ctx.lineWidth = 8 * cvs.scale;
        ctx.strokeRect(0, 0, targetSize.x, targetSize.y);
        ctx.restore();
        ctx.fillStyle = styles.fillColor;
        ctx.fillRect(0, 0, targetSize.x, targetSize.y);
    }
}
