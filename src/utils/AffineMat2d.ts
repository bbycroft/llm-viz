import { BoundingBox3d, Vec3 } from "./vector";

export class AffineMat2d {
    constructor(
        public a: number = 1.0,
        public b: number = 0.0,
        public c: number = 0.0,
        public d: number = 1.0,
        public e: number = 0.0,
        public f: number = 0.0,
    ) {

    }

    mul(rhs: AffineMat2d) {
        return new AffineMat2d(
            this.a * rhs.a + this.c * rhs.b,
            this.b * rhs.a + this.d * rhs.b,
            this.a * rhs.c + this.c * rhs.d,
            this.b * rhs.c + this.d * rhs.d,
            this.a * rhs.e + this.c * rhs.f + this.e,
            this.b * rhs.e + this.d * rhs.f + this.f,
        );
    }

    inv() {
        let detInv = 1.0 / (this.a * this.d - this.b * this.c);
        return new AffineMat2d(
            this.d * detInv,
            -this.b * detInv,
            -this.c * detInv,
            this.a * detInv,
            (this.c * this.f - this.d * this.e) * detInv,
            (this.b * this.e - this.a * this.f) * detInv,
        );
    }

    mulVec3(v: Vec3) {
        return new Vec3(
            this.a * v.x + this.c * v.y + this.e,
            this.b * v.x + this.d * v.y + this.f,
            v.z,
        );
    }

    mulVec3Inv(v: Vec3) {
        let detInv = 1.0 / (this.a * this.d - this.b * this.c);
        let x = v.x - this.e;
        let y = v.y - this.f;
        return new Vec3(
            (this.d * x - this.b * y) * detInv,
            (this.a * y - this.c * x) * detInv,
            v.z,
        );
    }

    mulBb(bb: BoundingBox3d) {
        return new BoundingBox3d(this.mulVec3(bb.min), this.mulVec3(bb.max));
    }

    mulBbInv(bb: BoundingBox3d) {
        return new BoundingBox3d(this.mulVec3Inv(bb.min), this.mulVec3Inv(bb.max));
    }

    toTransformParams(): [number, number, number, number, number, number] {
        return [this.a, this.b, this.c, this.d, this.e, this.f];
    }

    static identity() {
        return new AffineMat2d();
    }

    static translateVec(v: Vec3) {
        return new AffineMat2d(1, 0, 0, 1, v.x, v.y);
    }

    static scale1(x: number) {
        return new AffineMat2d(x, 0, 0, x, 0, 0);
    }

    static scaleVec(v: Vec3) {
        return new AffineMat2d(v.x, 0, 0, v.y, 0, 0);
    }

    static translateScale(x: number, y: number, sx: number, sy: number) {
        return new AffineMat2d(sx, 0, 0, sy, x, y);
    }

    static multiply(...mats: AffineMat2d[]) {
        let result = mats[0];
        for (let i = 1; i < mats.length; ++i) {
            result = result.mul(mats[i]);
        }
        return result;
    }
}
