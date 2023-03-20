
/* Design decisions for Mat4

With 16 floats, Float32Array is the obvious choice, and means it maps to WebGL nicely.
Note that there's limited precision with floats, if we're ever computing js-side.

The matrix is in column-major order, also to match WebGL.
*/

import { IArr, Vec3, Vec4 } from "./vector";

/** Column-major, 16-element float32 matrix, extending a Float32Array.
Methods will return a copy unless otherwise noted.
*/
export class Mat4f extends Float32Array {
    constructor(
    ) {
        super(16);
        this[0] = this[5] = this[10] = this[15] = 1.0;
    }

    static identity = new Mat4f();

    g(r: number, c: number) { return this[c * 4 + r]; }
    s(r: number, c: number, v: number) { this[c * 4 + r] = v; }

    add(a: Mat4f): Mat4f {
        let res = new Mat4f();
        for (let i = 0; i < 16; i++) {
            res[i] = this[i] + a[i];
        }
        return res;
    }

    sub(a: Mat4f): Mat4f {
        let res = new Mat4f();
        for (let i = 0; i < 16; i++) {
            res[i] = this[i] - a[i];
        }
        return res;
    }

    mul(a: Mat4f): Mat4f {
        let res = new Mat4f();
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                let v = 0.0;
                for (let k = 0; k < 4; k++) {
                     v += this[k * 4 + y] * a[x * 4 + k];
                }
                res[x * 4 + y] = v;
            }
        }
        return res;
    }

    mulVec4(a: Vec4): Vec4 {
        let x = this[0] * a.x + this[4] * a.y + this[8] * a.z + this[12] * a.w;
        let y = this[1] * a.x + this[5] * a.y + this[9] * a.z + this[13] * a.w;
        let z = this[2] * a.x + this[6] * a.y + this[10] * a.z + this[14] * a.w;
        let w = this[3] * a.x + this[7] * a.y + this[11] * a.z + this[15] * a.w;
        return new Vec4(x, y, z, w);
    }

    mulVec3Proj(a: Vec3): Vec3 {
        let v4 = this.mulVec4(new Vec4(a.x, a.y, a.z, 1.0));
        let wInv = 1.0 / v4.w;
        return new Vec3(v4.x * wInv, v4.y * wInv, v4.z * wInv);
    }

    mulVec3ProjVec(a: Vec3): Vec3 {
        let v4 = this.mulVec4(new Vec4(a.x, a.y, a.z, 0.0));
        return new Vec3(v4.x, v4.y, v4.z);
    }

    mulVec3Affine(a: Vec3) {
        let o = new Vec3();
        this.mulVec3Affine_(a, o);
        return o;
    }

    mulVec3Affine_(a: Vec3, o: Vec3) {
        let x = this[0] * a.x + this[4] * a.y + this[8] * a.z + this[12];
        let y = this[1] * a.x + this[5] * a.y + this[9] * a.z + this[13];
        let z = this[2] * a.x + this[6] * a.y + this[10] * a.z + this[14];
        o.x = x;
        o.y = y;
        o.z = z;
    }

    mulVec3AffineArr_(a: IArr, aOff: number, out: IArr, outOff: number) {
        let ax = a[aOff];
        let ay = a[aOff + 1];
        let az = a[aOff + 2];
        out[outOff + 0] = this[0] * ax + this[4] * ay + this[8] * az + this[12];
        out[outOff + 1] = this[1] * ax + this[5] * ay + this[9] * az + this[13];
        out[outOff + 2] = this[2] * ax + this[6] * ay + this[10] * az + this[14];
    }

    mulVec3AffineVec_(a: Vec3, o: Vec3) {
        let x = this[0] * a.x + this[4] * a.y + this[8] * a.z;
        let y = this[1] * a.x + this[5] * a.y + this[9] * a.z;
        let z = this[2] * a.x + this[6] * a.y + this[10] * a.z;
        o.x = x;
        o.y = y;
        o.z = z;
    }

    static fromRowMajor(a: ArrayLike<number> | number[][]) {
        if (a.length > 0 && Array.isArray(a[0])) {
            a = (a as number[][]).flatMap(x => x);
        }
        let flatArr = a as ArrayLike<number>;
        if (flatArr.length !== 16) {
            console.log('need 16 elements');
        }

        let res = new Mat4f();
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                res[i * 4 + j] = flatArr[j * 4 + i];
            }
        }
        return res;
    }

    static fromColMajor(flatArr: ArrayLike<number>, offset: number = 0) {
        if (flatArr.length - offset < 16) {
            console.log('need 16 elements');
        }
        let res = new Mat4f();
        for (let i = 0; i < 16; i++) {
            res[i] = flatArr[offset + i];
        }
        return res;
    }

    static fromTranslation(a: Vec3) {
        let res = new Mat4f();
        res[12] = a.x;
        res[13] = a.y;
        res[14] = a.z;
        return res;
    }

    static fromScaleTranslation(s: Vec3, t: Vec3) {
        let res = new Mat4f();
        res[0] = s.x;
        res[5] = s.y;
        res[10] = s.z;
        res[12] = t.x;
        res[13] = t.y;
        res[14] = t.z;
        return res;
    }

    static fromAxisAngle(axis: Vec3, angleRad: number) {
        let res = new Mat4f();
        fromAxisAngle(axis, angleRad, res, 4);
        return res;
    }

    static fromQuat(q: Vec4) {
        let res = new Mat4f();
        fromQuat(q, res, 4);
        return res;
    }

    static fromScale(s: Vec3) {
        let res = new Mat4f();
        res[0] = s.x;
        res[5] = s.y;
        res[10] = s.z;
        return res;
    }

    static fromLookAt(eye: Vec3, center: Vec3, up: Vec3) {
        let f = eye.sub(center).normalize();
        let u = up.normalize();
        let r = Vec3.cross(u, f).normalize();
        u = Vec3.cross(f, r);

        let res = new Mat4f();
        res[ 0] = r.x;
        res[ 1] = u.x;
        res[ 2] = f.x;
        res[ 4] = r.y;
        res[ 5] = u.y;
        res[ 6] = f.y;
        res[ 8] = r.z;
        res[ 9] = u.z;
        res[10] = f.z;
        res[12] = -eye.dot(r);
        res[13] = -eye.dot(u);
        res[14] = -eye.dot(f);
        return res;
    }

    static fromPersp(fovDeg: number, aspect: number, near: number, far: number) {
        let h = near * Math.tan(fovDeg / 2 * Math.PI / 180) * 2;
        let w = h * aspect;

        let res = new Mat4f();
        res[0] = 2 * near / w;
        res[5] = 2 * near / h;
        res[10] = - far / (far - near);
        res[11] = -1;
        res[14] = - far * near / (far - near);
        res[15] = 0;

        return res;
    }

    static fromOrtho(left: number, right: number, bottom: number, top: number, near: number, far: number) {
        let res = new Mat4f();
        res[0] = 2 / (right - left);
        res[5] = 2 / (top - bottom);
        res[10] = -2 / (far - near);
        res[12] = -(right + left) / (right - left);
        res[13] = -(top + bottom) / (top - bottom);
        res[14] = -(far + near) / (far - near);
        return res;
    }

    static zeros() {
        let res = new Mat4f();
        res[0] = 0.0;
        res[5] = 0.0;
        res[10] = 0.0;
        res[15] = 0.0;
        return res;
    }

    // creates Translation, Rotation, Scale, such that this matrix is the result of multipling
    // the equivalent matrix forms, as in
    //
    // M = T * R * S
    //
    // Note that we assume that there is no skew or projective components.
    // The rotation is given as a quaternion
    decomposeToTRS(): [Vec3, Vec4, Vec3] {
        let T = Vec3.fromArray(this, 12);
        let S = new Vec3(
            Vec3.fromArray(this, 0).len(),
            Vec3.fromArray(this, 4).len(),
            Vec3.fromArray(this, 8).len());

        let tr = this[0] + this[5] + this[10];
        let R: Vec4;
        if (tr > 0.0) {
            let r = Math.sqrt(1 + tr);
            let s = 0.5 / r;
            R = new Vec4(
                (this[6] - this[9]) * s,
                (this[8] - this[2]) * s,
                (this[1] - this[4]) * s,
                0.5 * r,
            );
        } else if (this[0] > this[5] && this[0] > this[10]) {
            let r = Math.sqrt(1.0 + this[0] - this[5] - this[10]);
            let s = 0.5 / r;
            R = new Vec4(
                0.5 * r,
                (this[1] + this[4]) * s,
                (this[8] + this[2]) * s,
                (this[6] - this[9]) * s,
            );
        } else if (this[5] > this[10]) {
            let r = Math.sqrt(1.0 + this[5] - this[0] - this[10]);
            let s = 0.5 / r;
            R = new Vec4(
                (this[4] + this[1]) * s,
                0.5 * r,
                (this[9] + this[6]) * s,
                (this[8] - this[2]) * s,
            );
        } else {
            let r = Math.sqrt(1.0 + this[10] - this[0] - this[5]);
            let s = 0.5 / r;
            R = new Vec4(
                (this[8] + this[2]) * s,
                (this[9] + this[6]) * s,
                0.5 * r,
                (this[1] - this[4]) * s,
            );
        }
        return [T, R, S];
    }

    invertTRS(): Mat4f {
        let res = new Mat4f();

        let u = Vec3.fromArray(this, 0);
        let v = Vec3.fromArray(this, 4);
        let w = Vec3.fromArray(this, 8);
        let t = Vec3.fromArray(this, 12);

        res[0] = this[0];
        res[1] = this[4];
        res[2] = this[8];

        res[4] = this[1];
        res[5] = this[5];
        res[6] = this[9];

        res[8] = this[2];
        res[9] = this[6];
        res[10] = this[10];

        res[12] = -u.dot(t);
        res[13] = -v.dot(t);
        res[14] = -w.dot(t);

        return res;
    }

    determinant(): number {
        let A = new Float64Array(this);
        let P = new Int32Array(5);
        luDecomp(A, P, 4);
        return luDeterminant(A, P, 4);
    }

    invert(): Mat4f {
        let A = new Float64Array(this);
        let P = new Int32Array(5);
        luDecomp(A, P, 4);
        let res = new Mat4f();
        luInvert(A, P, 4, res);
        return res;
    }

    toString(): string {
        let s = '\n';
        for (let i = 0; i < 4; i++) {
            s += i === 0 ? '[[' : ' [';
            for (let j = 0; j < 4; j++) {
                let v = this.g(i, j);
                s += (v < 0 ? '' : ' ') + v.toFixed(3) + (j === 3 ? ']' : ', ');
            }
            s += i === 3 ? ']' : '\n';
        }
        return s;
    }
}

/** Column-major, 9-element float32 matrix, extending a Float32Array.
Methods will return a copy unless otherwise noted.
*/
export class Mat3f extends Float32Array {
    constructor(
    ) {
        super(9);
        this[0] = this[4] = this[8] = 1.0;
    }

    g(r: number, c: number) { return this[c * 3 + r]; }
    s(r: number, c: number, v: number) { this[c * 3 + r] = v; }

    add(a: Mat3f): Mat3f {
        let res = new Mat3f();
        for (let i = 0; i < 9; i++) {
            res[i] = this[i] + a[i];
        }
        return res;
    }

    sub(a: Mat3f): Mat3f {
        let res = new Mat3f();
        for (let i = 0; i < 9; i++) {
            res[i] = this[i] - a[i];
        }
        return res;
    }

    mul(a: Mat3f): Mat3f {
        let res = new Mat3f();
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                let v = 0.0;
                for (let k = 0; k < 3; k++) {
                     v += this[k * 3 + y] * a[x * 3 + k];
                }
                res[x * 3 + y] = v;
            }
        }
        return res;
    }

    mulVec3(a: Vec3): Vec3 {
        let x = this[0] * a.x + this[3] * a.y + this[6] * a.z;
        let y = this[1] * a.x + this[4] * a.y + this[7] * a.z;
        let z = this[2] * a.x + this[5] * a.y + this[8] * a.z;
        return new Vec3(x, y, z);
    }

    transpose(): Mat3f {
        let res = new Mat3f();
        res[0] = this[0];
        res[1] = this[3];
        res[2] = this[6];
        res[3] = this[1];
        res[4] = this[4];
        res[5] = this[7];
        res[6] = this[2];
        res[7] = this[5];
        res[8] = this[8];
        return res;
    }

    static fromRowMajor(a: ArrayLike<number> | number[][]) {
        if (a.length > 0 && Array.isArray(a[0])) {
            a = (a as number[][]).flatMap(x => x);
        }
        let flatArr = a as ArrayLike<number>;
        if (flatArr.length !== 9) {
            console.log('need 9 elements');
        }

        let res = new Mat3f();
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                res[i * 3 + j] = flatArr[j * 3 + i];
            }
        }
        return res;
    }

    static fromColMajor(flatArr: ArrayLike<number>, offset: number = 0) {
        if (flatArr.length - offset < 9) {
            console.log('need 9 elements');
        }
        let res = new Mat3f();
        for (let i = 0; i < 9; i++) {
            res[i] = flatArr[offset + i];
        }
        return res;
    }

    static fromAxisAngle(axis: Vec3, angleRad: number) {
        let res = new Mat3f();
        fromAxisAngle(axis, angleRad, res, 3);
        return res;
    }

    static fromQuat(q: Vec4) {
        let res = new Mat3f();
        fromQuat(q, res, 3);
        return res;
    }

    static fromScale(s: Vec3) {
        let res = new Mat4f();
        res[0] = s.x;
        res[4] = s.y;
        res[8] = s.z;
        return res;
    }

    determinant(): number {
        let A = new Float64Array(this);
        let P = new Int32Array(4);
        luDecomp(A, P, 3);
        return luDeterminant(A, P, 3);
    }

    invert(): Mat3f {
        let A = new Float64Array(this);
        let P = new Int32Array(4);
        luDecomp(A, P, 3);
        let res = new Mat3f();
        luInvert(A, P, 3, res);
        return res;
    }

    toString(): string {
        let s = '\n';
        for (let i = 0; i < 3; i++) {
            s += i === 0 ? '[[' : ' [';
            for (let j = 0; j < 3; j++) {
                let v = this.g(i, j);
                s += (v < 0 ? '' : ' ') + v.toFixed(3) + (j === 2 ? ']' : ', ');
            }
            s += i === 2 ? ']' : '\n';
        }
        return s;
    }
}

function fromQuat(q: Vec4, res: Float32Array, stride: number) {
    let n = q.lenSq();
    let s = n === 0.0 ? 0.0 : 2.0 / n;
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;

    let o = 0;
    res[o+0] = 1 - s*(y*y + z*z);
    res[o+1] = s*(x*y + w*z);
    res[o+2] = s*(x*z - w*y);

    o = stride;
    res[o+0] = s*(x*y - w*z);
    res[o+1] = 1 - s*(x*x + z*z);
    res[o+2] = s*(y*z + w*x);

    o = stride * 2;
    res[o+0] = s*(x*z + w*y);
    res[o+1] = s*(y*z - w*x);
    res[o+2] = 1 - s*(x*x + y*y);
}

function fromAxisAngle(axis: Vec3, angleRad: number, res: Float32Array, stride: number) {
    let u = axis.normalize();
    let c = Math.cos(angleRad);
    let s = Math.sin(angleRad)
    let x = u.x;
    let y = u.y;
    let z = u.z;
    let c2 = 1 - c;

    let o = 0;
    res[o+0] = x*x*c2 + c;
    res[o+1] = y*x*c2 + z*s;
    res[o+2] = z*x*c2 - y*s;

    o = stride;
    res[o+0] = x*y*c2 - z*s;
    res[o+1] = y*y*c2 + c;
    res[o+2] = z*y*c2 + x*s;

    o = stride * 2;
    res[o+0] = x*z*c2 + y*s;
    res[o+1] = y*z*c2 - x*s;
    res[o+2] = z*z*c2 + c;
}

/** From https://en.wikipedia.org/wiki/LU_decomposition */

// The col-major n x n matrix A is modified in-place, and P should have n + 1 elements
export function luDecomp(A: Float64Array, P: Int32Array, n: number) {
    for (let i = 0; i <= n; i++) {
        P[i] = i;
    }

    for (let i = 0; i < n; i++) {
        let maxA = 0.0;
        let imax = i;

        for (let k = i; k < n; k++) {
            let absA = Math.abs(A[k * n + i]);
            if (absA > maxA) {
                maxA = absA;
                imax = k;
            }
        }

        if (maxA < 1e-9) {
            return false;
        }

        if (imax !== i) {
            // pivot p
            let j = P[i];
            P[i] = P[imax];
            P[imax] = j;

            // pivot A rows
            for (let k = 0; k < n; k++) {
                let j = A[i * n + k];
                A[i * n + k] = A[imax * n + k];
                A[imax * n + k] = j;
            }

            P[n] += 1;
        }

        for (let j = i + 1; j < n; j++) {
            A[j * n + i] /= A[i * n + i];

            for (let k = i + 1; k < n; k++) {
                A[j * n + k] -= A[j * n + i] * A[i * n + k];
            }
        }
    }
}

export function luInvert(A: Float64Array, P: Int32Array, n: number, res: Float32Array | Float64Array) {
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            res[i * n + j] = P[i] === j ? 1.0 : 0.0;

            for (let k = 0; k < i; k++) {
                res[i * n + j] -= A[i * n + k] * res[k * n + j];
            }
        }

        for (let i = n - 1; i >= 0; i--) {
            for (let k = i + 1; k < n; k++) {
                res[i * n + j] -= A[i * n + k] * res[k * n + j];
            }
            res[i * n + j] /= A[i * n + i];
        }
    }
}

export function luDeterminant(A: Float64Array, P: Int32Array, n: number) {
    let det = A[0];

    for (let i = 1; i < n; i++) {
        det *= A[i * n + i];
    }

    if ((P[n] - n) & 1) {
        return -det;
    } else {
        return det;
    }
}

export function luSolve(A: Float64Array, P: Int32Array, n: number, b: Float64Array) {
    let x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        x[i] = b[P[i]];

        for (let k = 0; k < i; k++) {
            x[i] -= A[i * n + k] * x[k];
        }
    }
    for (let i = n - 1; i >= 0; i--) {
        for (let k = i + 1; k < n; k++) {
            x[i] -= A[i * n + k] * x[k];
        }
        x[i] /= A[i * n + i];
    }
    return x;
}

function test() {
    console.log('Testing:', __filename);

    let m1 = Mat4f.fromRowMajor([
        -0.746, -0.982, -0.835,  0.752,
        -0.989,  0.813,  0.142, -0.276,
         0.553, -0.134, -0.457, -0.515,
        -0.332,  0.305, -0.131,  0.137]);

    let m2 = Mat4f.fromRowMajor([
        -0.392, -0.049, -0.413, -0.521,
         0.679, -0.482,  0.703, -0.223,
         0.014,  0.485,  0.370, -0.187,
        -0.294, -0.062, -0.203,  0.345]);

    console.log(`m1: ${m1}`);
    console.log(`m2: ${m2}`);
    console.log(`m3: ${m1.mul(m2)}`);

    let persp = Mat4f.fromPersp(30, 1.0, 1, 100);

    console.log('persp:', persp);
    let vals = [
        new Vec3(1, 1, -1),
        new Vec3(1, 1, -1.5),
        new Vec3(1, 1, -10),
        new Vec3(1, 1, -40),
        new Vec3(1, 1, -100)];

    for (let v of vals) {
        let near = 1;
        let far = 100;
        let proj = persp.mulVec3Proj(v);
        let unprojZ = near * far / ((near - far) * proj.z + far);
        console.log('proj', v, '=>', proj.z, 'and back? =>', unprojZ);
    }

    let lookAt = Mat4f.fromLookAt(new Vec3(0, 0, 4), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
    console.log(`lookAt: ${lookAt}`);

    for (let i = 0; i < 1; i++) {
        let input = new Vec4(Math.random(), Math.random(), Math.random(), Math.random()).normalize();
        let m = Mat4f.fromQuat(input);
        let [T, R, S] = m.decomposeToTRS();
        console.log(` in = ${input}\nout = ${R}`);
        console.log(`T = ${T}, S = ${S}`);
    }
}

if (__filename === 'asdf') {
    test();
}
