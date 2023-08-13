import { assignImm, getOrAddToMap } from "../utils/data";
import { segmentNearestPoint, segmentNearestT, Vec3 } from "../utils/vector";
import { IWire, ISegment, IWireGraph, IWireGraphNode, ICpuLayoutBase } from "./CpuModel";

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

export function applyWires(layout: ICpuLayoutBase, wires: IWire[], editIdx: number): ICpuLayoutBase {
    let [editedWires, newWires] = fixWires(wires, editIdx);
    let nextWireId = layout.nextWireId;
    for (let wire of newWires) {
        wire.id = '' + nextWireId++;
    }

    return assignImm(layout, {
        nextWireId,
        wires: [...editedWires, ...newWires],
    })
}

/** Two main things to fix:
    1. wires that are touching each other get merged
    2. wires that have islands get split
*/
export function fixWires(wires: IWire[], editIdx: number): [editedWires: IWire[], newWires: IWire[]] {
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
    let wireGraph = wireToGraph(editWire);
    let islands = splitIntoIslands(wireGraph);
    let newWires: IWire[] = [];

    if (islands.length > 1) {
        let editWireSplit = islands.map(graphToWire);
        wires.splice(editIdx, 1, editWireSplit[0]);
        newWires = editWireSplit.slice(1);
    }

    return [wires, newWires];
}

export function splitIntoIslands(wire: IWireGraph): IWireGraph[] {

    let islands: IWireGraphNode[][] = [];
    let seenIds = new Set<number>();

    for (let i = 0; i < wire.nodes.length; i++) {
        let startNode = wire.nodes[i];

        if (!seenIds.has(startNode.id)) {
            let stack = [startNode];
            let island: IWireGraphNode[] = [];

            while (stack.length > 0) {
                let node = stack.pop()!;

                if (!seenIds.has(node.id)) {
                    island.push(node);
                    seenIds.add(node.id);

                    for (let edgeId of node.edges) {
                        stack.push(wire.nodes[edgeId]);
                    }
                }
            }
            islands.push(island);
        }
    }

    if (islands.length === 1) {
        return [wire];
    }

    return islands.map(island => repackGraphIds(assignImm(wire, { nodes: island })));
}

export function repackGraphIds(wire: IWireGraph): IWireGraph {

    let idCntr = 0;
    let idMap = new Map<number, number>();
    let newNodes: IWireGraphNode[] = [];
    for (let node of wire.nodes) {
        let newId = idCntr++;
        idMap.set(node.id, newId);
        newNodes.push(assignImm(node, { id: newId }));
    }
    for (let node of newNodes) {
        node.edges = node.edges.map(id => idMap.get(id)!);
    }
    return assignImm(wire, { nodes: newNodes });
}

export function wireToGraph(wire: IWire): IWireGraph {
    let isects = new Map<string, IWireGraphNode>();

    function getNode(pos: Vec3) {
        let key = `${pos.x.toFixed(5)},${pos.y.toFixed(5)}`;
        return getOrAddToMap(isects, key, () => ({ id: isects.size, pos, edges: [] }));
    }

    for (let seg0 of wire.segments) {
        let node0 = getNode(seg0.p0);
        let node1 = getNode(seg0.p1);

        let nodesOnLine: { t: number, node: IWireGraphNode }[] = [
            { t: 0, node: node0 },
            { t: 1, node: node1 },
        ];

        for (let seg1 of wire.segments) {
            if (seg0 === seg1) {
                continue;
            }

            for (let pt of [seg1.p0, seg1.p1]) {
                if (segAttachedToInner(seg0, pt)) {
                    nodesOnLine.push({
                        t: segmentNearestT(seg0.p0, seg0.p1, pt),
                        node: getNode(pt),
                    });
                }
            }
        }

        nodesOnLine.sort((a, b) => a.t - b.t);

        for (let i = 0; i < nodesOnLine.length - 1; i++) {
            let nodeA = nodesOnLine[i];
            let nodeB = nodesOnLine[i + 1];
            if (nodeA.node !== nodeB.node) {
                nodeA.node.edges.push(nodeB.node.id);
                nodeB.node.edges.push(nodeA.node.id);
            }
        }
    }

    return {
        id: wire.id,
        nodes: Array.from(isects.values()),
    };
}

export function graphToWire(graph: IWireGraph): IWire {

    let segments: ISegment[] = [];

    for (let node0 of graph.nodes) {
        for (let nodeId of node0.edges) {
            let node1 = graph.nodes[nodeId];
            if (node1.id > node0.id) {
                segments.push({ p0: node0.pos, p1: node1.pos });
            }
        }
    }

    return {
        id: graph.id,
        segments,
    };
}

export const EPSILON = 0.001;

export function fixWire(wire: IWire) {

    let segs = wire.segments.map(a => ({ ...a }));

    let segIdsToRemove = new Set<number>();

    for (let seg0 of segs) {

        for (let seg1Idx = 0; seg1Idx < wire.segments.length; seg1Idx++) {
            let seg1 = segs[seg1Idx];

            if (seg0 === seg1) {
                continue;
            }

            if (segAttachedTo(seg0, seg1.p0)) {
                if (segAttachedTo(seg0, seg1.p1)) {
                    // seg1 is inside seg0 => remove seg1
                    segIdsToRemove.add(seg1Idx);
                } else if (segAttachedTo(seg1, seg0.p0)) {
                    // seg1 is to the left of seg0 => truncate seg1 to seg0.p0
                    seg1.p0 = seg0.p0;
                } else if (segAttachedTo(seg1, seg0.p1)) {
                    // seg1 is to the right of seg0 => truncate seg1 to seg0.p1
                    seg1.p0 = seg0.p1;
                }
            }
        }
    }

    let newSegs = segs.filter((_, i) => !segIdsToRemove.has(i));
    wire = assignImm(wire, { segments: newSegs });

    wire = graphToWire(wireToGraph(wire));

    // trim segments that are overlapping

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
    return nearest.distSq(pt) < EPSILON * EPSILON;
}

export function segAttachedToInner(seg: ISegment, pt: Vec3) {
    if (!segAttachedTo(seg, pt)) {
        return false;
    }
    let t = segmentNearestT(seg.p0, seg.p1, pt);
    return t > EPSILON && t < 1.0 - EPSILON;
}

export function segsTouching(seg1: ISegment, seg2: ISegment) {
    return segAttachedTo(seg1, seg2.p0) || segAttachedTo(seg1, seg2.p1) || segAttachedTo(seg2, seg1.p0) || segAttachedTo(seg2, seg1.p1);
}


function snapToGrid(v: Vec3) {
    return v.round();
}
