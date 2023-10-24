import { getOrAddToMap, assignImm } from "../utils/data";
import { IEditSnapshot, RefType, IElRef } from "./CpuModel";
import { refToString, copyWireGraph, wireUnlinkNodes, repackGraphIds } from "./Wire";

export function deleteSelection(layout: IEditSnapshot): IEditSnapshot {
    let refStrs = new Set(layout.selected.map(s => refToString(s)));
    function selectionHasRef(id: string, type: RefType) {
        return refStrs.has(refToString({ id, type }));
    }

    let selectionPerWire = new Map<string, IElRef[]>();
    for (let ref of layout.selected) {
        if (ref.type === RefType.WireNode || ref.type === RefType.WireSeg) {
            getOrAddToMap(selectionPerWire, ref.id, () => []).push(ref);
        }
    }

    let newLayout = assignImm(layout, {
        comps: layout.comps.filter(c => !selectionHasRef(c.id, RefType.Comp)),
        wires: layout.wires
            .map(w => {
                const refs = selectionPerWire.get(w.id);
                if (refs) {
                    w = copyWireGraph(w);
                    for (let ref of refs) {
                        if (ref.type === RefType.WireNode) {
                            let node = w.nodes[ref.wireNode0Id!];
                            for (let e of node.edges) {
                                wireUnlinkNodes(node, w.nodes[e]);
                            }
                        } else if (ref.type === RefType.WireSeg) {
                            let node0 = w.nodes[ref.wireNode0Id!];
                            let node1 = w.nodes[ref.wireNode1Id!];
                            wireUnlinkNodes(node0, node1);
                        }
                    }
                    return repackGraphIds(w);
                }
                let newNodes = w.nodes.map(n => assignImm(n, { ref: n.ref && !refStrs.has(refToString(n.ref)) ? n.ref : undefined }));
                return assignImm(w, { nodes: newNodes });
            }),
        selected: [],
    });
    return newLayout;
}
