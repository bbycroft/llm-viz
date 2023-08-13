import { assignImm } from "../utils/data";
import { segmentNearestPoint, Vec3 } from "../utils/vector";
import { IWire, ISegment } from "./CpuModel";

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

/** Two main things to fix:
    1. wires that are touching each other get merged
    2. wires that have islands get split
*/
export function fixWires(wires: IWire[], editIdx: number): IWire[] {
    let editWire = wires[editIdx];

    // find all wires that are touching the edit wire
    let wireIdxsToMerge = new Set<number>();

    for (let i = 0; i < wires.length; i++) {
        if (i === editIdx) {
            continue;
        }

        let wire = wires[i];

        let merged = false;
        // find any segments that are touching the edit wire
        for (let j = 0; j < wire.segments.length && !merged; j++) {
            for (let k = 0; k < editWire.segments.length; k++) {
                let seg1 = wire.segments[j];
                let seg2 = editWire.segments[k];

                if (segsTouching(seg1, seg2)) {
                    merged = true;
                    wireIdxsToMerge.add(i);
                    break;
                }
            }
        }
    }

    if (wireIdxsToMerge.size > 0) {
        let newWire = assignImm(editWire, {
            segments: editWire.segments.slice(),
        });
        wires[editIdx] = newWire;

        for (let idx of wireIdxsToMerge) {
            let wire = wires[idx];
            for (let seg of wire.segments) {
                newWire.segments.push(seg);
            }
        }

        let idxsBelowNewIdx = Array.from(wireIdxsToMerge).filter(i => i < editIdx).length;
        editIdx -= idxsBelowNewIdx;

        wires = wires.filter((_, i) => !wireIdxsToMerge.has(i));

        wires[editIdx] = fixWire(newWire);
    }

    // find any wires that are islands
    // TODO: tricky! maybe want to create a graph of nodes (w verts) + edges

    return wires;
}

export function fixWire(wire: IWire) {
    /*
     Have rules for different junctions:
      - T junctions should have a single segment in the horiz direction
      - + junctions should have two segments in at least one direction

    How to accomplish this?
      - Split segs into horiz/vert
      - Identify all junctions, by intersecting all horiz with all vert
      - Every time we touch a junction, can find out which dirs extend from it
      - All 4 means + junction, 3 means T junction, 2 means corner

      - Iter all segs, and check against all segs of the same dir, and see if they're connected
      - Merge them if they are, provided it's not at an x junction

      - Check segs against a + junction, and if none end at it, split the horiz seg.
      - (Requires bookkeeping of which segs are at a junction wrt merging)

    */

    // remove any segments of no length
    return assignImm(wire, {
        segments: filterImm(wire.segments, s => s.p0.distSq(s.p1) > 0.001),
    });
}

export function filterImm<T>(arr: T[], pred: (t: T) => boolean) {
    let newArr = arr.filter(pred);
    return newArr.length === arr.length ? arr : newArr;
}

export function segAttachedTo(seg: ISegment, pt: Vec3) {
    let nearest = segmentNearestPoint(seg.p0, seg.p1, pt);
    return nearest.distSq(pt) < 0.001;
}

export function segsTouching(seg1: ISegment, seg2: ISegment) {
    return segAttachedTo(seg1, seg2.p0) || segAttachedTo(seg1, seg2.p1) || segAttachedTo(seg2, seg1.p0) || segAttachedTo(seg2, seg1.p1);
}


function snapToGrid(v: Vec3) {
    return v.round();
}
