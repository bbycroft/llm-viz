import { assignImm } from "../utils/data";
import { segmentNearestPoint, Vec3 } from "../utils/vector";
import { ISegment, IWire } from "./CpuCanvas";

export function dragSegment(wire: IWire, segId: number, delta: Vec3) {

    let seg = wire.segments[segId];

    let newWire = assignImm(wire, {
        segments: wire.segments.map((s, i) => {
            // any seg that starts or ends between p0 and p1, should be moved
            let isSeg = i === segId;
            return assignImm(s, {
                p0: isSeg || segAttachedTo(seg, s.p0) ? snapToGrid(s.p0.add(delta)) : s.p0,
                p1: isSeg || segAttachedTo(seg, s.p1) ? snapToGrid(s.p1.add(delta)) : s.p1,
            });
        }),
    });

    return newWire;
}

export function fixWire(wire: IWire) {
    // remove any segments of no length
    return assignImm(wire, {
        segments: filterImm(wire.segments, s => s.p0.distSq(s.p1) > 0.001),
    });
}

export function filterImm<T>(arr: T[], pred: (t: T) => boolean) {
    let newArr = arr.filter(pred);
    return newArr.length === arr.length ? arr : newArr;
}

// assume horiz/vert segments
export function segAttachedTo(seg: ISegment, pt: Vec3) {
    let nearest = segmentNearestPoint(seg.p0, seg.p1, pt);
    return nearest.distSq(pt) < 0.001;
}

function snapToGrid(v: Vec3) {
    return v.round();
}
