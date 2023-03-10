import { Vec3 } from "./vector";

/* Cubic bezier curve defined by 4 control points.  */

export function bezierCubic(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number) {
    let t2 = t * t;
    let t3 = t2 * t;

    let mt = 1 - t;
    let mt2 = mt * mt;
    let mt3 = mt2 * mt;

    let a = mt3;
    let b = 3 * mt2 * t;
    let c = 3 * mt * t2;
    let d = t3;

    return new Vec3(
        a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        a * p0.z + b * p1.z + c * p2.z + d * p3.z,
    );
}

export function bezierCubicMid(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) {
    // t = 0.5
    return new Vec3(
        0.125 * (p0.x + p3.x) + 0.375 * (p1.x + p2.x),
        0.125 * (p0.y + p3.y) + 0.375 * (p1.y + p2.y),
        0.125 * (p0.z + p3.z) + 0.375 * (p1.z + p2.z),
    );
}

export interface IBezierQueueItem {
    p0: Vec3;
    p1: Vec3;
    p2: Vec3;
    p3: Vec3;
}

let _cacheRes = new Float32Array(1024 * 3);

export function bezierCurveBuild(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, threshold: number) {
    let res = _cacheRes;
    let resOff = 0;

    let queue: IBezierQueueItem[] = [];
    function push(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) {
        queue.push({ p0, p1, p2, p3 });
    }
    push(p0, p1, p2, p3);
    p3.writeToBuf(res, resOff);
    resOff += 3;
    let iter = 0;

    while (queue.length > 0) {
        let { p0, p1, p2, p3 } = queue.pop()!;
        // let mid = bezierCubicMid(p0, p1, p2, p3);
        // // dist from midpoint to the line between p0 and p3 (using projection)
        // let v = p3.sub(p0);
        // let w = mid.sub(p0);
        // let a = v.dot(w) / v.dot(v);
        // let dist = w.mulAdd(v, -a).len();
        // let ratio = dist / v.len();

        let q0 = p0.mid(p1);
        let q1 = p1.mid(p2);
        let q2 = p2.mid(p3);
        let r0 = q0.mid(q1);
        let r1 = q1.mid(q2);
        let s0 = r0.mid(r1); // = mid

        let d03 = p3.sub(p0);
        let d31 = p1.sub(p3);
        let d32 = p2.sub(p3);
        let d2a = Math.abs(d31.y * d03.z - d31.z * d03.y);
        let d2b = Math.abs(d32.y * d03.z - d32.z * d03.y);

        let needsSubdivion = ((d2a + d2b) * (d2a + d2b) > threshold * d03.lenSq());

        // let len = p1.distSq(mid);
        if (needsSubdivion) {
            push(p0, q0, r0, s0);
            push(s0, r1, q2, p3);
        } else {
            if (resOff + 6 > res.length) {
                let newRes = new Float32Array(res.length * 2);
                newRes.set(res);
                res = newRes;
            }
            p0.writeToBuf(res, resOff);
            resOff += 3;
        }
        iter++;
    }

    _cacheRes = res;
    return res.slice(0, resOff);
}

export function bezierBoundingBoxCoarse(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) {
    let min = new Vec3(
        Math.min(p0.x, p1.x, p2.x, p3.x),
        Math.min(p0.y, p1.y, p2.y, p3.y),
        Math.min(p0.z, p1.z, p2.z, p3.z),
    );
    let max = new Vec3(
        Math.max(p0.x, p1.x, p2.x, p3.x),
        Math.max(p0.y, p1.y, p2.y, p3.y),
        Math.max(p0.z, p1.z, p2.z, p3.z),
    );
    return { min, max };
}

