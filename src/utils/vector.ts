
/* Design decisions for Vec2/Vec3/Vec4

Methods have immutable behavior (rather than in-place) for less error-prone usage, but that naturally
means a drop in perf. Happy with this trade.
All methods only have at most 1 new Vec*, even if it means a bit more repetition.

Fact-check: false:
    Inheriting from Array<number> seems to give good structure in V8. In particular, the number array
    elements (as doubles) are inline in the array, and the initialization with the size means the array
    is actually that size. It looks like there's an extra pointer hop from this class to get to the
    actual array data which is not strictly ideal, but better than both Float64Array and 3 pointer hops
    in the case of { x: number, y: number, z: number } (V8 doesn't do double de-boxing :( ).

Probably due to inhieriting from Array<number>, the constructor is painfully slow, showing up in
stack traces.

Back to simple objects, on the idea that ones that live on the stack will get jitted away anyway.

V8 shows Vec3 & Vec4 as having an 24 byte overhead, which... isn't toooo bad

*/

export enum Dim {
    X = 0,
    Y = 1,
    Z = 2,
}

export class Vec2 {
    x: number;
    y: number;
    constructor(x: number = 0.0, y: number = 0.0) {
        this.x = +x;
        this.y = +y;
    }

    add(a: Vec2): Vec2 { return new Vec2(this.x + a.x, this.y + a.y); }
    sub(a: Vec2): Vec2 { return new Vec2(this.x - a.x, this.y - a.y); }
    dot(a: Vec2): number { return this.x * a.x + this.y * a.y; }
    mul(a: number): Vec2 { return new Vec2(this.x * a, this.y * a); }
    mulAdd(a: Vec2, b: number): Vec2 { return new Vec2(this.x + a.x * b, this.y + a.y * b); }
    lenSq(): number { return this.x * this.x + this.y * this.y; }
    distSq(a: Vec2): number {
        let dx = this.x - a.x;
        let dy = this.y - a.y;
        return dx * dx + dy * dy;
    }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(a: Vec2): number { return Math.sqrt(this.distSq(a)); }
    normalize(): Vec2 { return this.mul(1.0 / Math.sqrt(this.lenSq())); }
    mid(a: Vec2): Vec2 { return new Vec2((this.x + a.x) * 0.5, (this.y + a.y) * 0.5); }
    abs() { return new Vec2(Math.abs(this.x), Math.abs(this.y)); }
    clone(): Vec2 { return new Vec2(this.x, this.y); }
    toVec3(): Vec3 { return new Vec3(this.x, this.y, 1.0); }
    round(): Vec2 { return new Vec2(Math.round(this.x), Math.round(this.y)); }
    floor(): Vec2 { return new Vec2(Math.floor(this.x), Math.floor(this.y)); }
    round_(): Vec2 { this.x = Math.round(this.x); this.y = Math.round(this.y); return this; }
    copy_(a: Vec2) { this.x = a.x; this.y = a.y; }
    writeToBuf(buf: Float32Array, offset: number) {
        buf[offset + 0] = this.x;
        buf[offset + 1] = this.y;
    }
    static fromArray(a: ArrayLike<number>, offset: number = 0): Vec2 {
        return new Vec2(a[offset + 0], a[offset + 1]);
    }
    setAt(i: number, v: number) {
        switch (i) {
        case 0: this.x = v; break;
        case 1: this.y = v; break;
        }
        return this;
    }
    addAt(i: number, v: number) {
        switch (i) {
        case 0: this.x += v; break;
        case 1: this.y += v; break;
        }
        return this;
    }
    getAt(i: number): number {
        return i === 0 ? this.x : i === 1 ? this.y : 0.0;
    }
    withSetAt(i: number, v: number): Vec2 { return this.clone().setAt(i, v); }
    withAddAt(i: number, v: number): Vec2 { return this.clone().addAt(i, v); }
    toString(dp: number = 3): string {
        return `Vec2(${numMaxDp(this.x, dp)}, ${numMaxDp(this.y, dp)})`;
    }
    rotate(thetaRad: number) {
        // https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula
        // k must have unit length
        let c = Math.cos(thetaRad);
        let s = Math.sin(thetaRad);
        let kCrossV = new Vec2(-this.y, this.x);
        return this.mul(c).add(kCrossV.mul(s));
    }
    lerp(a: Vec2, t: number): Vec2 {
         return new Vec2(
            a.x * t + this.x * (1 - t),
            a.y * t + this.y * (1 - t),
         );
    }
    static zero = new Vec2(0, 0);
    static one = new Vec2(1, 1);
}

export class Vec3 {
    x: number;
    y: number;
    z: number;
    constructor(x: number = 0.0, y: number = 0.0, z: number = 0.0) {
        this.x = +x;
        this.y = +y;
        this.z = +z;
    }

    add(a: Vec3): Vec3 { return new Vec3(this.x + a.x, this.y + a.y, this.z + a.z); }
    sub(a: Vec3): Vec3 { return new Vec3(this.x - a.x, this.y - a.y, this.z - a.z); }
    dot(a: Vec3): number { return this.x * a.x + this.y * a.y + this.z * a.z; }
    mul(a: number): Vec3 { return new Vec3(this.x * a, this.y * a, this.z * a); }
    mulAdd(a: Vec3, b: number): Vec3 { return new Vec3(this.x + a.x * b, this.y + a.y * b, this.z + a.z * b); }
    lenSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
    distSq(a: Vec3): number {
        let dx = this.x - a.x;
        let dy = this.y - a.y;
        let dz = this.z - a.z;
        return dx * dx + dy * dy + dz * dz;
    }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(a: Vec3): number { return Math.sqrt(this.distSq(a)); }
    normalize(): Vec3 { return this.mul(1.0 / Math.sqrt(this.lenSq())); }
    mid(a: Vec3): Vec3 { return new Vec3((this.x + a.x) * 0.5, (this.y + a.y) * 0.5, (this.z + a.z) * 0.5); }
    abs() { return new Vec3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z)); }
    clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
    toVec4(): Vec4 { return new Vec4(this.x, this.y, this.z, 1.0); }
    round(): Vec3 { return new Vec3(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }
    floor(): Vec3 { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
    round_(): Vec3 { this.x = Math.round(this.x); this.y = Math.round(this.y); this.z = Math.round(this.z); return this; }
    copy_(a: Vec3) { this.x = a.x; this.y = a.y; this.z = a.z; }
    static cross(a: Vec3, b: Vec3): Vec3 { return new Vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x); }
    writeToBuf(buf: Float32Array, offset: number) {
        buf[offset + 0] = this.x;
        buf[offset + 1] = this.y;
        buf[offset + 2] = this.z;
    }
    static fromArray(a: ArrayLike<number>, offset: number = 0): Vec3 {
        return new Vec3(a[offset + 0], a[offset + 1], a[offset + 2]);
    }
    setAt(i: number, v: number) {
        switch (i) {
        case 0: this.x = v; break;
        case 1: this.y = v; break;
        case 2: this.z = v; break;
        }
        return this;
    }
    addAt(i: number, v: number) {
        switch (i) {
        case 0: this.x += v; break;
        case 1: this.y += v; break;
        case 2: this.z += v; break;
        }
        return this;
    }
    getAt(i: number): number {
        switch (i) {
        case 0: return this.x;
        case 1: return this.y;
        case 2: return this.z;
        }
        return 0.0;
    }
    withSetAt(i: number, v: number): Vec3 { return this.clone().setAt(i, v); }
    withAddAt(i: number, v: number): Vec3 { return this.clone().addAt(i, v); }
    toString(dp: number = 3): string {
        return `Vec3(${numMaxDp(this.x, dp)}, ${numMaxDp(this.y, dp)}, ${numMaxDp(this.z, dp)})`;
    }
    rotateAbout(k: Vec3, thetaRad: number) {
        // https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula
        // k must have unit length
        let c = Math.cos(thetaRad);
        let s = Math.sin(thetaRad);
        let kCrossV = Vec3.cross(k, this);
        let kDotV = k.dot(this);
        return this.mul(c).add(kCrossV.mul(s)).add(k.mul(kDotV * (1 - c)));
    }
    lerp(a: Vec3, t: number): Vec3 {
         return new Vec3(
            a.x * t + this.x * (1 - t),
            a.y * t + this.y * (1 - t),
            a.z * t + this.z * (1 - t),
         );
    }
    static zero = new Vec3(0, 0, 0);
    static one = new Vec3(1, 1, 1);
}


export class Vec4 {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x: number = 0.0, y: number = 0.0, z: number = 0.0, w: number = 1.0) {
        this.x = +x;
        this.y = +y;
        this.z = +z;
        this.w = +w;
    }

    getIdx(i: number): number {
        switch (i) {
        case 0: return this.x;
        case 1: return this.y;
        case 2: return this.z;
        case 3: return this.w;
        default: throw new Error(`Invalid index ${i}`);
        }
    }
    add(a: Vec4): Vec4 { return new Vec4(this.x + a.x, this.y + a.y, this.z + a.z, this.w + a.w); }
    sub(a: Vec4): Vec4 { return new Vec4(this.x - a.x, this.y - a.y, this.z - a.z, this.w - a.w); }
    dot(a: Vec4): number { return this.x*a.x + this.y*a.y + this.z*a.z + this.w+a.w; }
    mul(a: number): Vec4 { return new Vec4(this.x * a, this.y * a, this.z * a, this.w * a); }
    lenSq(): number { return this.x*this.x + this.y*this.y + this.z*this.z + this.w*this.w; }
    distSq(a: Vec4): number {
        let dx = this.x - a.x;
        let dy = this.y - a.y;
        let dz = this.z - a.z;
        let dw = this.w - a.w;
        return dx * dx + dy * dy + dz * dz + dw * dw;
    }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(a: Vec4): number { return Math.sqrt(this.distSq(a)); }
    normalize(): Vec4 { return this.mul(1.0 / Math.sqrt(this.lenSq())); }
    projToVec3(): Vec3 { return new Vec3(this.x / this.w, this.y / this.w, this.z / this.w); }
    static lerp(a: Vec4, b: Vec4, t: number): Vec4 {
        return a.add(b.sub(a).mul(t));
    }
    writeToBuf(buf: Float32Array, offset: number) {
        buf[offset + 0] = this.x;
        buf[offset + 1] = this.y;
        buf[offset + 2] = this.z;
        buf[offset + 3] = this.w;
    }
    static fromArray(a: ArrayLike<number>, offset: number = 0): Vec4 {
        return new Vec4(a[offset + 0], a[offset + 1], a[offset + 2], a[offset + 3]);
    }
    static fromVec3(v: Vec3, w: number = 1.0): Vec4 {
        return new Vec4(v.x, v.y, v.z, w);
    }
    toArray(): ArrayLike<number> {
        return [this.x, this.y, this.z, this.w];
    }
    static fromHexColor(s: string, alpha: number = 1.0): Vec4 {
        if (s.startsWith('#')) s = s.slice(1);
        let hexVal = parseInt(s, 16);
        let x = (hexVal >> 16) & 0xFF;
        let y = (hexVal >> 8) & 0xFF;
        let z = hexVal & 0xFF;
        return new Vec4(x / 255.0 * alpha, y / 255.0 * alpha, z / 255.0 * alpha, alpha);
    }
    toHexColor(): string {
        let toPair = (v: number) => Math.floor(v * 255).toString(16).padStart(2, '0');
        return `#${toPair(this.x)}${toPair(this.y)}${toPair(this.z)}${toPair(this.w)}`;
    }
    toString(): string {
        return `Vec4(${numMaxDp(this.x)}, ${numMaxDp(this.y)}, ${numMaxDp(this.z)}, ${numMaxDp(this.w)})`;
    }
}

function numMaxDp(x: number, dp: number = 3) {
    return parseFloat(x.toFixed(dp)).toString();
}

export class BoundingBox3d {
    public min: Vec3 = new Vec3();
    public max: Vec3 = new Vec3();
    public empty: boolean = true;

    constructor(...args: Array<Vec3>) {
        for (let v of args)
            this.addInPlace(v);
    }

    addInPlace(v: Vec3) {
        if (this.empty) {
            this.min.x = v.x;
            this.min.y = v.y;
            this.min.z = v.z;
            this.max.x = v.x;
            this.max.y = v.y;
            this.max.z = v.z;
            this.empty = false;
        } else {
            this.min.x = Math.min(this.min.x, v.x);
            this.min.y = Math.min(this.min.y, v.y);
            this.min.z = Math.min(this.min.z, v.z);
            this.max.x = Math.max(this.max.x, v.x);
            this.max.y = Math.max(this.max.y, v.y);
            this.max.z = Math.max(this.max.z, v.z);
        }
        return this;
    }

    combineInPlace(v: BoundingBox3d) {
        return v.empty ? this : this.addInPlace(v.min).addInPlace(v.max);
    }

    center(): Vec3 {
        let a = this.max;
        let b = this.min;
        return new Vec3(
            a.x + 0.5 * (b.x - a.x),
            a.y + 0.5 * (b.y - a.y),
            a.z + 0.5 * (b.z - a.z));
    }

    size(): Vec3 {
        return this.max.sub(this.min);
    }

    contains(p: Vec3) {
        return !this.empty &&
            p.x >= this.min.x && p.x <= this.max.x &&
            p.y >= this.min.y && p.y <= this.max.y &&
            p.z >= this.min.z && p.z <= this.max.z;
    }

    intersects(b: BoundingBox3d) {
        return !this.empty && !b.empty &&
            this.max.x >= b.min.x && this.min.x <= b.max.x &&
            this.max.y >= b.min.y && this.min.y <= b.max.y &&
            this.max.z >= b.min.z && this.min.z <= b.max.z;
    }

    expandInPlace(border: number) {
        if (!this.empty) {
            this.min.x -= border;
            this.min.y -= border;
            this.min.z -= border;
            this.max.x += border;
            this.max.y += border;
            this.max.z += border;
        }
        return this;
    }

    shrinkInPlaceXY(inset: number) {
        if (!this.empty) {
            this.min.x += inset;
            this.min.y += inset;
            this.max.x -= inset;
            this.max.y -= inset;
            if (this.min.x > this.max.x || this.min.y > this.max.y) {
                this.empty = true;
                this.min = new Vec3();
                this.max = new Vec3();
            }
        }
        return this;
    }

    tl(): Vec3 { return new Vec3(this.min.x, this.min.y, this.min.z); }
    tr(): Vec3 { return new Vec3(this.max.x, this.min.y, this.min.z); }
    br(): Vec3 { return new Vec3(this.max.x, this.max.y, this.min.z); }
    bl(): Vec3 { return new Vec3(this.min.x, this.max.y, this.min.z); }

    clone(): BoundingBox3d {
        let b = new BoundingBox3d();
        b.min = this.min.clone();
        b.max = this.max.clone();
        b.empty = this.empty;
        return b;
    }

    toString(): string {
        return `BoundingBox3d(${this.min}, ${this.max})`;
    }
}

// static functions that operate on Float32Arrays (or Float64Arrays)
// all functions are in-place, and read/write from specified offsets
// safe to use with the same array for both input and output

export type IArr = Float32Array | Float64Array;

export class Vec3Buf {

    static add_(a: IArr, aOff: number, b: IArr, bOff: number, out: IArr, outOff: number) {
        out[outOff + 0] = a[aOff + 0] + b[bOff + 0];
        out[outOff + 1] = a[aOff + 1] + b[bOff + 1];
        out[outOff + 2] = a[aOff + 2] + b[bOff + 2];
    }

    static sub_(a: IArr, aOff: number, b: IArr, bOff: number, out: IArr, outOff: number) {
        out[outOff + 0] = a[aOff + 0] - b[bOff + 0];
        out[outOff + 1] = a[aOff + 1] - b[bOff + 1];
        out[outOff + 2] = a[aOff + 2] - b[bOff + 2];
    }

    static copy_(a: IArr, aOff: number, out: IArr, outOff: number) {
        out[outOff + 0] = a[aOff + 0];
        out[outOff + 1] = a[aOff + 1];
        out[outOff + 2] = a[aOff + 2];
    }

    static normalize_(a: IArr, aOff: number, out: IArr, outOff: number) {
        let x = a[aOff + 0];
        let y = a[aOff + 1];
        let z = a[aOff + 2];
        let lenInv = 1.0 / Math.sqrt(x * x + y * y + z * z);
        out[outOff + 0] = x * lenInv;
        out[outOff + 1] = y * lenInv;
        out[outOff + 2] = z * lenInv;
    }

    static len_(a: Float32Array, aOff: number): number {
        let x = a[aOff + 0];
        let y = a[aOff + 1];
        let z = a[aOff + 2];
        return Math.sqrt(x * x + y * y + z * z);
    }
}

export class Vec4Buf {
    static copy_(a: IArr, aOff: number, out: IArr, outOff: number) {
        out[outOff + 0] = a[aOff + 0];
        out[outOff + 1] = a[aOff + 1];
        out[outOff + 2] = a[aOff + 2];
        out[outOff + 3] = a[aOff + 3];
    }
}

export function segmentNearestPoint(p0: Vec3, p1: Vec3, x: Vec3) {
    let v = p1.sub(p0);
    let w = x.sub(p0);
    let t = clamp(w.dot(v) / v.dot(v), 0, 1);
    return p0.mulAdd(v, t);
}

export function segmentNearestT(p0: Vec3, p1: Vec3, x: Vec3) {
    let v = p1.sub(p0);
    let w = x.sub(p0);
    return clamp(w.dot(v) / v.dot(v), 0, 1);
}

// project x onto v
export function projectOntoVector(x: Vec3, v: Vec3) {
    return v.mul(x.dot(v) / v.dot(v));
}

export function pointInTriangle(x: Vec3, p0: Vec3, p1: Vec3, p2: Vec3) {
    let v0 = p2.sub(p0);
    let v1 = p1.sub(p0);
    let v2 = x.sub(p0);
    let dot00 = v0.dot(v0);
    let dot01 = v0.dot(v1);
    let dot02 = v0.dot(v2);
    let dot11 = v1.dot(v1);
    let dot12 = v1.dot(v2);
    let invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    let u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    let v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return u >= 0 && v >= 0 && u + v < 1;
}

function clamp(num: number, min: number, max: number) {
    return num < min ? min : num > max ? max : num;
}
