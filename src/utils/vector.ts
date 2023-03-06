
/* Design decisions for Vec3/Vec4

Methods have immutable behavior (rather than in-place) for less error-prone usage, but that naturally
means a drop in perf. Happy with this trade.
All methods only have at most 1 new Vec*, even if it means a bit more repetition.

Inheriting from Array<number> seems to give good structure in V8. In particular, the number array
elements (as doubles) are inline in the array, and the initialization with the size means the array
is actually that size. It looks like there's an extra pointer hop from this class to get to the
actual array data which is not strictly ideal, but better than both Float64Array and 3 pointer hops
in the case of { x: number, y: number, z: number } (V8 doesn't do double de-boxing :( ).

V8 shows Vec3 & Vec4 as having an 24 byte overhead, which... isn't toooo bad

*/

export class Vec3A extends Array<number> {
    constructor(
        x: number = 0.0,
        y: number = 0.0,
        z: number = 0.0,
    ) {
        super();
        this[0] = +x;
        this[1] = +y;
        this[2] = +z;
    }

    get x() { return this[0]; }
    get y() { return this[1]; }
    get z() { return this[2]; }
    set x(value: number) { this[0] = +value; }
    set y(value: number) { this[1] = +value; }
    set z(value: number) { this[2] = +value; }

    add(a: Vec3A): Vec3A { return new Vec3A(this[0] + a[0], this[1] + a[1], this[2] + a[2]); }
    sub(a: Vec3A): Vec3A { return new Vec3A(this[0] - a[0], this[1] - a[1], this[2] - a[2]); }
    dot(a: Vec3A): number { return this[0] * a[0] + this[1] * a[1] + this[2] * a[2]; }
    mul(a: number): Vec3A { return new Vec3A(this[0] * a, this[1] * a, this[2] * a); }
    lenSq(): number { return this[0] * this[0] + this[1] * this[1] + this[2] * this[2]; }
    distSq(a: Vec3A): number {
        let dx = this[0] - a[0];
        let dy = this[1] - a[1];
        let dz = this[2] - a[2];
        return dx * dx + dy * dy + dz * dz;
    }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(a: Vec3A): number { return Math.sqrt(this.distSq(a)); }
    normalize(): Vec3A { return this.mul(1.0 / Math.sqrt(this.lenSq())); }
    clone(): Vec3A { return new Vec3A(this[0], this[1], this[2]); }
    toVec4(): Vec4 { return new Vec4(this[0], this[1], this[2], 1.0); }
    static cross(a: Vec3A, b: Vec3A): Vec3A { return new Vec3A(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x); }
    writeToBuf(buf: Float32Array, offset: number) {
        buf[offset + 0] = this[0];
        buf[offset + 1] = this[1];
        buf[offset + 2] = this[2];
    }
    static fromArray(a: ArrayLike<number>, offset: number = 0): Vec3A {
        return new Vec3A(a[offset + 0], a[offset + 1], a[offset + 2]);
    }
    toString(): string {
        return `Vec3A(${numMaxDp(this.x)}, ${numMaxDp(this.y)}, ${numMaxDp(this.z)})`;
    }
}

export class Vec3 {
    constructor(
        public x: number = 0.0,
        public y: number = 0.0,
        public z: number = 0.0,
    ) {}

    add(a: Vec3): Vec3 { return new Vec3(this.x + a.x, this.y + a.y, this.z + a.z); }
    sub(a: Vec3): Vec3 { return new Vec3(this.x - a.x, this.y - a.y, this.z - a.z); }
    dot(a: Vec3): number { return this.x * a.x + this.y * a.y + this.z * a.z; }
    mul(a: number): Vec3 { return new Vec3(this.x * a, this.y * a, this.z * a); }
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
    clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
    toVec4(): Vec4 { return new Vec4(this.x, this.y, this.z, 1.0); }
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
    withSetAt(i: number, v: number): Vec3 { return this.clone().setAt(i, v); }
    withAddAt(i: number, v: number): Vec3 { return this.clone().addAt(i, v); }
    toString(): string {
        return `Vec3(${numMaxDp(this.x)}, ${numMaxDp(this.y)}, ${numMaxDp(this.z)})`;
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
}


export class Vec4 extends Array<number> {
    constructor(
        x: number = 0.0,
        y: number = 0.0,
        z: number = 0.0,
        w: number = 1.0,
    ) {
        super(4);
        this[0] = +x;
        this[1] = +y;
        this[2] = +z;
        this[3] = +w;
    }

    get x() { return this[0]; }
    get y() { return this[1]; }
    get z() { return this[2]; }
    get w() { return this[3]; }
    set x(value: number) { this[0] = +value; }
    set y(value: number) { this[1] = +value; }
    set z(value: number) { this[2] = +value; }
    set w(value: number) { this[3] = +value; }

    add(a: Vec4): Vec4 { return new Vec4(this[0] + a[0], this[1] + a[1], this[2] + a[2], this[3] + a[3]); }
    sub(a: Vec4): Vec4 { return new Vec4(this[0] - a[0], this[1] - a[1], this[2] - a[2], this[3] - a[3]); }
    dot(a: Vec4): number { return this[0]*a[0] + this[1]*a[1] + this[2]*a[2] + this[3]+a[3]; }
    mul(a: number): Vec4 { return new Vec4(this[0] * a, this[1] * a, this[2] * a, this[3] * a); }
    lenSq(): number { return this[0]*this[0] + this[1]*this[1] + this[2]*this[2] + this[3]*this[3]; }
    distSq(a: Vec4): number {
        let dx = this[0] - a[0];
        let dy = this[1] - a[1];
        let dz = this[2] - a[2];
        let dw = this[3] - a[3];
        return dx * dx + dy * dy + dz * dz + dw * dw;
    }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(a: Vec4): number { return Math.sqrt(this.distSq(a)); }
    normalize(): Vec4 { return this.mul(1.0 / Math.sqrt(this.lenSq())); }
    projToVec3(): Vec3 { return new Vec3(this[0] / this[3], this[1] / this[3], this[2] / this[3]); }
    static lerp(a: Vec4, b: Vec4, t: number): Vec4 {
        return a.add(b.sub(a).mul(t));
    }

    static fromArray(a: ArrayLike<number>, offset: number = 0): Vec4 {
        return new Vec4(a[offset + 0], a[offset + 1], a[offset + 2], a[offset + 3]);
    }
    static fromHexColor(s: string, alpha: number = 1.0): Vec4 {
        if (s.startsWith('#')) s = s.slice(1);
        let hexVal = parseInt(s, 16);
        let x = (hexVal >> 16) & 0xFF;
        let y = (hexVal >> 8) & 0xFF;
        let z = hexVal & 0xFF;
        return new Vec4(x / 255.0, y / 255.0, z / 255.0, alpha);
    }
    toString(): string {
        return `Vec4(${numMaxDp(this.x)}, ${numMaxDp(this.y)}, ${numMaxDp(this.z)}, ${numMaxDp(this.w)})`;
    }
}

function numMaxDp(x: number, dp: number = 3) {
    return x.toFixed(dp);
}

export class BoundingBox3d {
    public min: Vec3 = new Vec3();
    public max: Vec3 = new Vec3();
    public empty: boolean = true;

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
}
