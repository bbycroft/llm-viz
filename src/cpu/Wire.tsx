import { assignImm, getOrAddToMap, isNil } from "../utils/data";
import { projectOntoVector, segmentNearestPoint, segmentNearestT, Vec3 } from "../utils/vector";
import { IWire, ISegment, IWireGraph, IWireGraphNode, IElRef, RefType, IComp, IEditSchematic } from "./CpuModel";
import { PortHandling } from "./Editor";

export function moveSelectedComponents(schematic: IEditSchematic, selected: IElRef[], delta: Vec3): IEditSchematic {
    if (delta.dist(Vec3.zero) < EPSILON) {
        return schematic;
    }

    checkWires(schematic.wires, 'moveSelectedComponents (pre)');

    let wireLookup = new Map<string, IWireGraph>();
    for (let wire of schematic.wires) {
        wireLookup.set(wire.id, wire);
    }

    let compPorts = new Map<string, { pos: Vec3, ref: IElRef }>();

    let selection = new Set(selected.map(refToString));
    let compsToMove = new Set<string>();
    let wiresAndNodesToMove = new Map<string, Map<number, Vec3>>();

    // Create a map of all the comp ports
    for (let comp of schematic.comps) {
        if (!selection.has(refToString({ type: RefType.Comp, id: comp.id }))) {
            continue;
        }
        for (let port of comp.ports ?? []) {
            let pos = comp.pos.add(port.pos);
            let ref: IElRef = { type: RefType.CompNode, id: comp.id, compNodeId: port.id };
            compPorts.set(refToString(ref), { pos, ref });
        }
    }

    for (let ref of selected) {
        if (ref.type === RefType.Comp) {
            compsToMove.add(ref.id);
        }
    }

    // figure out what nodes to move on each wire (by direct selection, or by being attached to a selected comp's port)
    for (let wire of schematic.wires) {
        let nodeIdsToMove = new Map<number, Vec3>();

        for (let node of wire.nodes) {
            let nodeRefStr = refToString({ type: RefType.WireNode, id: wire.id, wireNode0Id: node.id });
            if (selection.has(nodeRefStr)) {
                nodeIdsToMove.set(node.id, delta);
                continue;
            }

            if (node.ref) {
                let refStr = refToString(node.ref);
                if (compPorts.has(refStr)) {
                    nodeIdsToMove.set(node.id, delta);
                }
            }
        }

        for (let ref of selected) {
            if (ref.type === RefType.WireSeg && ref.id === wire.id) {
                let node0 = wire.nodes[ref.wireNode0Id!];
                let node1 = wire.nodes[ref.wireNode1Id!];
                let segDir = node1.pos.sub(node0.pos).normalize();
                let segDirPerp = new Vec3(-segDir.y, segDir.x, 0);
                let perpDelta = projectOntoVector(delta, segDirPerp);
                if (!nodeIdsToMove.has(node0.id)) {
                    nodeIdsToMove.set(node0.id, perpDelta);
                }
                if (!nodeIdsToMove.has(node1.id)) {
                    nodeIdsToMove.set(node1.id, perpDelta);
                }
            }
        }

        wiresAndNodesToMove.set(wire.id, nodeIdsToMove);
    }

    return assignImm(schematic, {
        comps: schematic.comps.map(comp => {
            if (compsToMove.has(comp.id)) {
                return assignImm(comp, { pos: snapToGrid(comp.pos.add(delta)) });
            }
            return comp;
        }),
        wires: schematic.wires.map(wire => {
            let nodeIdsToMove = wiresAndNodesToMove.get(wire.id);
            if (nodeIdsToMove) {
                wire = dragNodes(wire, nodeIdsToMove);
            }
            return wire;
        }),
    });
}

export function updateWiresForComp<T extends IEditSchematic>(layout: T, comp: IComp<any>, portHandling: PortHandling): T {

    if (portHandling === PortHandling.Move) {

        // plan: for each port, find all wires that are touching it
        // figure out the port's delta, based on the previous position of the wire node (and delta from wire node to new comp port)
        // run the dragNodes logic

        return assignImm<IEditSchematic>(layout, {

            wires: layout.wires.map(wire => {
                let nodeIdsToMove = new Map<number, Vec3>();
                let nodeIdsToClean = new Set<number>();

                for (let node of wire.nodes) {
                    if (!node.ref || node.ref.type !== RefType.CompNode || node.ref.id !== comp.id) {
                        continue;
                    }
                    let port = comp.ports.find(p => p.id === node.ref!.compNodeId);
                    if (!port) {
                        nodeIdsToClean.add(node.id);
                        continue;
                    }
                    let delta = comp.pos.add(port.pos).sub(node.pos);

                    nodeIdsToMove.set(node.id, delta);
                }

                if (nodeIdsToClean.size > 0) {
                    wire = copyWireGraph(wire);
                    for (let id of nodeIdsToClean) {
                        wire.nodes[id].ref = undefined;
                    }
                }

                if (nodeIdsToMove.size > 0) {
                    wire = dragNodes(wire, nodeIdsToMove);
                }
                return wire;
            })
        }) as T;
    }

    return layout;

}

export function refToString(ref: IElRef): string {
    switch (ref.type) {
        case RefType.Comp:
            return `C|${ref.id}`;
        case RefType.CompNode:
            return `CP|${ref.id}|${ref.compNodeId}`;
        case RefType.WireNode:
            return `WN|${ref.id}|${ref.wireNode0Id!}`;
        case RefType.WireSeg:
            return `W|${ref.id}|${ref.wireNode0Id!}|${ref.wireNode1Id!}`;
    }
}

export function parseRefStr(str: string): IElRef {
    let parts = str.split('|');
    switch (parts[0]) {
        case 'C':
            return { type: RefType.Comp, id: parts[1] };
        case 'CP':
            return { type: RefType.CompNode, id: parts[1], compNodeId: parts[2] };
        case 'WN':
            return { type: RefType.WireNode, id: parts[1], wireNode0Id: parseInt(parts[2]) };
        case 'W':
            return { type: RefType.WireSeg, id: parts[1], wireNode0Id: parseInt(parts[2]), wireNode1Id: parseInt(parts[3]) };
        default:
            throw new Error(`Unable to parse ref string '${str}'`);
    }
}

export function dragNodes(wire: IWireGraph, nodesToMove: Map<number, Vec3>) {
    // kinda complicated, but assume we're dragging a component (or 3) with wires attached to their nodes

    // we do something similar to segment dragging, where we try to extend down co-linear segments
    // but if we hit a node that's on an anchored node, we walk back and only move the first co-linear segment,
    // creating extra segments as needed

    // if we have segments where there's no breakpoint, we'll need to introduce a dog-leg
    // if we're moving right, we start from the leftmost seg, and vice versa
    // we need to pick a dog-leg height, so choose the smallest one
    // then increase that height for subsequent segments
    wire = copyWireGraph(wire);

    let initialNodes = new Set(nodesToMove.keys());

    function isPinnedNode(nodeIdx: number) {
        let node = wire.nodes[nodeIdx];
        return node.ref?.type === RefType.CompNode && !initialNodes.has(nodeIdx);
    }

    for (let [node0Idx, delta] of nodesToMove) {
        if (delta.len() < EPSILON) {
            continue;
        }
        let node0 = wire.nodes[node0Idx];
        for (let node1Idx of [...node0.edges]) {
            // looking at each offshoot (node1) of a moving node (node0)
            let node1 = wire.nodes[node1Idx];
            let dir = node1.pos.sub(node0.pos).normalize();
            let dirPerp = new Vec3(-dir.y, dir.x, 0);
            if (dirPerp.len() < EPSILON) {
                continue;
            }
            let perpDelta = projectOntoVector(delta, dirPerp);
            let maybeMoves = new Map<number, Vec3>();

            // find all nodes colinear with this segment
            let anyPinnedNodes = false;
            iterColinearNodes(wire, node1Idx, dir, node => {
                let moveAmt = nodesToMove.get(node.id);

                if (isPinnedNode(node.id)) {
                    anyPinnedNodes = true;
                }

                if (!moveAmt) {
                    maybeMoves.set(node.id, perpDelta);
                } else if (Math.abs(moveAmt.dot(perpDelta)) < EPSILON) {
                    // probably should subtract the dot-prod component from colinearDelta prior to adding, but this is good enough
                    maybeMoves.set(node.id, moveAmt.add(perpDelta));
                }
            });

            if (!anyPinnedNodes) {
                // we can move all of these nodes
                for (let move of maybeMoves) {
                    nodesToMove.set(move[0], move[1]);
                }
            } else {
                // need to disjoint the first node
                if (!isPinnedNode(node1Idx)) {
                    let newNode: IWireGraphNode = { id: wire.nodes.length, pos: snapToGrid(node1.pos.add(perpDelta)), edges: [] };
                    wireUnlinkNodes(node0, node1);
                    wireLinkNodes(node0, newNode);
                    wireLinkNodes(newNode, node1);
                    wire.nodes.push(newNode);
                }
            }
        }
    }

    for (let [nodeIdx, d] of nodesToMove) {
        wire.nodes[nodeIdx] = assignImm(wire.nodes[nodeIdx], {
            pos: snapToGrid(wire.nodes[nodeIdx].pos.add(d)),
         });
    }

    return wire;
}

export function iterColinearNodes(wire: IWireGraph, nodeIdx: number, dir: Vec3, cb: (node: IWireGraphNode) => void) {
    let seenIds = new Set<number>();
    let nodeStack = [nodeIdx];

    while (nodeStack.length > 0) {
        let nodeIdx = nodeStack.pop()!;
        let node0 = wire.nodes[nodeIdx];
        if (seenIds.has(node0.id)) {
            continue;
        }
        seenIds.add(node0.id);
        cb(node0);

        for (let node1Idx of node0.edges) {
            let node1 = wire.nodes[node1Idx];
            let edgeDir = node1.pos.sub(node0.pos).normalize();
            let dotProd = edgeDir.dot(dir);
            if (Math.abs(dotProd) > 1 - EPSILON) {
                nodeStack.push(node1Idx);
            }
        }
    }
}

export function dragSegment(wire: IWireGraph, node0Idx: number, node1Idx: number, delta: Vec3) {

    // let seg = wire.segments[segId];
    let node0 = wire.nodes[node0Idx];
    let node1 = wire.nodes[node1Idx];

    // we're gonna move both of these nodes
    // but also iterate through all nodes colinear with this segment, and move them by the same amount
    // Since we're not dealing with angled lines, don't have to re-evaluate the intersection point
    let segDir = node1.pos.sub(node0.pos).normalize();

    let nodesToMove = new Set<number>();
    let nodeStack = [node0Idx, node1Idx];
    let seenIds = new Set<number>();

    let newNodes = [...wire.nodes];

    while (nodeStack.length > 0) {
        let nodeIdx0 = nodeStack.pop()!;
        let node0 = wire.nodes[nodeIdx0];
        if (seenIds.has(node0.id)) {
            continue;
        }
        seenIds.add(node0.id);
        nodesToMove.add(nodeIdx0);
        for (let nodeIdx1 of node0.edges) {
            let node1 = wire.nodes[nodeIdx1];
            let dir = node1.pos.sub(node0.pos).normalize();
            let dotProd = dir.dot(segDir);
            if (Math.abs(dotProd) > 1 - EPSILON) {
                nodeStack.push(nodeIdx1);
            }
        }
    }

    for (let nodeIdx of nodesToMove) {
        newNodes[nodeIdx] = assignImm(newNodes[nodeIdx], {
            pos: snapToGrid(newNodes[nodeIdx].pos.add(delta)),
         });
    }

    return assignImm(wire, { nodes: newNodes });
}

export function applyWires(layout: IEditSchematic, wires: IWireGraph[], editIdx: number): IEditSchematic {

    let [editedWires, newWires] = fixWires(layout, wires, editIdx);
    let nextWireId = layout.nextWireId;
    for (let wire of newWires) {
        wire.id = '' + nextWireId++;
    }

    let allWires = [...editedWires, ...newWires];

    checkWires(editedWires, 'applyWires (post-fixWires edited)');
    checkWires(newWires, 'applyWires (post-fixWires new)');

    return assignImm(layout, {
        nextWireId,
        wires: allWires,
    })
}

export function checkWires(wires: IWireGraph[], name: string) {
    for (let wire of wires) {
        if (wire.nodes.some(n => n.edges.some(e => isNil(e) || isNil(wire.nodes[e])))) {
            console.log('wire:', wire);
            throw new Error(`CHECK [${name}]: Wire ${wire.id} has dangling edges`);
        }

        for (let node0 of wire.nodes) {
            for (let node1Idx of node0.edges) {
                let node1 = wire.nodes[node1Idx];
                if (node1.edges.includes(node0.id)) {
                    continue;
                }
                node1.edges.push(node0.id);
                console.log(`CHECK [${name}]: Wire ${wire.id} has unidirectional edge ${node0.id} -> ${node1.id}`);
            }
        }
    }
}

export function copyWireGraph(wire: IWireGraph): IWireGraph {
    let nodes = wire.nodes.map(n => ({ ...n, edges: n.edges.slice() }));
    return { ...wire, nodes };
}

function createNodePosMap(layout: IEditSchematic) {
    let nodePosMap = new Map<string, { pos: Vec3, ref: IElRef }>();
    for (let comp of layout.comps) {
        for (let node of comp.ports) {
            let nodePos = comp.pos.add(node.pos);
            let ref: IElRef = {
                type: RefType.CompNode,
                id: comp.id,
                compNodeId: node.id,
            };
            let posStr = `${nodePos.x},${nodePos.y}`;
            nodePosMap.set(posStr, { pos: nodePos, ref });
        }
    }

    return nodePosMap;
}

export function iterWireGraphSegments(graph: IWireGraph, cb: (node0: IWireGraphNode, node1: IWireGraphNode) => boolean | void) {
    for (let node0 of graph.nodes) {
        for (let nodeId of node0.edges) {
            let node1 = graph.nodes[nodeId];
            if (!node1) {
                throw new Error(`Couldn't find node ${nodeId}`);
            }
            if (node1.id > node0.id) {
                let res = cb(node0, node1);
                if (res === false) {
                    return;
                }
            }
        }
    }
}

/** Two main things to fix:
    1. wires that are touching each other get merged
    2. wires that have islands get split
*/
export function fixWires(layout: IEditSchematic, wires: IWireGraph[], editIdx: number): [editedWires: IWireGraph[], newWires: IWireGraph[]] {
    wires = [...wires];
    let editWire = wires[editIdx];

    // find all wires that are touching the edit wire
    let wireIdxsToMerge = new Set<number>();

    checkWires(wires, 'fixWires (pre-merge)');

    for (let i = 0; i < wires.length; i++) {
        if (i === editIdx) {
            continue;
        }

        let wire = wires[i];

        let merged = false;
        // find any segments that are touching the edit wire
        iterWireGraphSegments(wire, (node0, node1) => {
            let seg1 = { p0: node0.pos, p1: node1.pos };

            iterWireGraphSegments(editWire, (editNode0, editNode1) => {
                let seg2 = { p0: editNode0.pos, p1: editNode1.pos };

                if (segsTouching(seg1, seg2)) {
                    merged = true;
                    wireIdxsToMerge.add(i);
                    return false;
                }
            });

            return !merged;
        });
    }

    if (wireIdxsToMerge.size > 0) {
        let newWire = graphToWire(editWire);

        for (let idx of wireIdxsToMerge) {
            let wire = graphToWire(wires[idx]);
            for (let seg of wire.segments) {
                newWire.segments.push(seg);
            }
        }

        wires[editIdx] = wireToGraph(newWire);

        let idxsBelowNewIdx = Array.from(wireIdxsToMerge).filter(i => i < editIdx).length;
        wires = wires.filter((_, i) => !wireIdxsToMerge.has(i));
        editIdx -= idxsBelowNewIdx;
    }

    checkWires(wires, 'fixWires (pre-fixWire)');
    wires[editIdx] = fixWire(wires[editIdx]);

    let editWireGraph = wires[editIdx];

    let nodePosMap = createNodePosMap(layout);
    for (let node of editWireGraph.nodes) {
        let posStr = `${node.pos.x},${node.pos.y}`;
        let nodePos = nodePosMap.get(posStr);
        if (nodePos) {
            node.ref = nodePos.ref;
        }
    }

    checkWires(wires, 'fixWires (pre-splitIntoIslands)');

    let islands = splitIntoIslands(editWireGraph);

    wires.splice(editIdx, 1, islands[0]);
    wires = wires.filter(a => !!a);
    let newWires = islands.slice(1);

    // if (newWires.length > 0) {
    //     console.log('islands:', islands);
    // }

    checkWires(wires, 'fixWires (post-splitIntoIslands)');
    checkWires(newWires, 'fixWires (post-splitIntoIslands new)');

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
            if (island.length > 1) {
                islands.push(island);
            }
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
        if (node.edges.length === 0) {
            continue;
        }

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

    function getNode(pos: Vec3, ref?: IElRef) {
        let key = `${pos.x.toFixed(5)},${pos.y.toFixed(5)}`;
        let node = getOrAddToMap(isects, key, () => ({ id: isects.size, pos, edges: [] }));
        node.ref = node.ref || ref;
        return node;
    }

    for (let seg0 of wire.segments) {
        let node0 = getNode(seg0.p0, seg0.comp0Ref);
        let node1 = getNode(seg0.p1, seg0.comp1Ref);

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
                segments.push({ p0: node0.pos, p1: node1.pos, comp0Ref: node0.ref, comp1Ref: node1.ref });
            }
        }
    }

    return {
        id: graph.id,
        segments,
    };
}

export const EPSILON = 0.001;

export function fixWire(wireGraph: IWireGraph) {

    checkWires([wireGraph], 'fixWire (pre-segment split)');

    let wire = graphToWire(wireGraph);
    let segs = wire.segments.map(a => ({ ...a }));

    let segIdsToRemove = new Set<number>();

    for (let seg0Idx = 0; seg0Idx < wire.segments.length; seg0Idx++) {
        let seg0 = segs[seg0Idx];

        for (let seg1Idx = 0; seg1Idx < wire.segments.length; seg1Idx++) {
            let seg1 = segs[seg1Idx];

            if (seg0 === seg1) {
                continue;
            }

            if ((seg0.p0.dist(seg1.p0) < EPSILON && seg0.p1.dist(seg1.p1) < EPSILON) ||
                (seg0.p0.dist(seg1.p1) < EPSILON && seg0.p1.dist(seg1.p0) < EPSILON)) {
                // seg0 and seg1 are the same => remove seg1
                if (seg1Idx > seg0Idx) {
                    segIdsToRemove.add(seg1Idx);
                }
                continue;
            } else if (segAttachedTo(seg0, seg1.p0)) {
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

    let newSegs = segs
        .filter((_, i) => !segIdsToRemove.has(i))
        .filter(s => s.p0.distSq(s.p1) > EPSILON * EPSILON);
    wire = assignImm(wire, { segments: newSegs });

    let graph = wireToGraph(wire);

    iterWireGraphSegments(graph, (segNode0, segNode1) => {
        for (let node of graph.nodes) {
            if (node === segNode0 || node === segNode1) {
                continue;
            }

            if (segAttachedTo({ p0: segNode0.pos, p1: segNode1.pos }, node.pos)) {
                // node is on the segment => segment needs to be split
                // i.e. edge between segNode0 and segNode1 needs to be removed, and new edges added
                wireUnlinkNodes(segNode0, segNode1);
                wireLinkNodes(segNode0, node);
                wireLinkNodes(node, segNode1);
            }
        }
    });

    let nodesRemoved = false;
    for (let node of graph.nodes) {
        // check directions out of each node
        // if two edges are colinear, merge them
        if (node.edges.length !== 2) {
            continue;
        }
        let node0 = graph.nodes[node.edges[0]];
        let node1 = graph.nodes[node.edges[1]];
        let dir0 = node0.pos.sub(node.pos).normalize();
        let dir1 = node1.pos.sub(node.pos).normalize();
        if (dir0.dot(dir1) < -1 + EPSILON) {
            // colinear
            wireUnlinkNodes(node0, node);
            wireUnlinkNodes(node1, node);
            wireLinkNodes(node0, node1);
            nodesRemoved = true;
        }
    }

    if (nodesRemoved) {
        graph = repackGraphIds(graph);
    }

    return graph;
}

export function wireLinkNodes(node0: IWireGraphNode, node1: IWireGraphNode) {
    if (!node0.edges.includes(node1.id)) {
        node0.edges.push(node1.id);
    }
    if (!node1.edges.includes(node0.id)) {
        node1.edges.push(node0.id);
    }
}

export function wireUnlinkNodes(node0: IWireGraphNode, node1: IWireGraphNode) {
    node0.edges = node0.edges.filter(e => e !== node1.id);
    node1.edges = node1.edges.filter(e => e !== node0.id);
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

