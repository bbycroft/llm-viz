import { getOrAddToMap, assignImm } from "../utils/data";
import { IEditSnapshot, RefType, IElRef, IEditContext, IEditorState } from "./CpuModel";
import { updateSubSchematic } from "./Editor";
import { refToString, copyWireGraph, wireUnlinkNodes, repackGraphIds } from "./Wire";

export function getPrefixForSelection(snapshot: IEditSnapshot, editCtx?: IEditContext): [string, IElRef[]] {
    if (snapshot.selected.length === 0) {
        return ["", []];
    }

    let prefix: string;

    if (editCtx) {
        prefix = editCtx.idPrefix;
    } else {
        let lastSelected = snapshot.selected[snapshot.selected.length - 1];
        let splitIdx = lastSelected.id.lastIndexOf("|");
        prefix = splitIdx === -1 ? "" : lastSelected.id.substring(0, splitIdx + 1);
    }

    let splitIdx = prefix.length - 1;

    let selected = snapshot.selected
        .filter(s => s.id.startsWith(prefix) && s.id.lastIndexOf("|") === splitIdx)
        .map(s => assignImm(s, { id: s.id.substring(splitIdx + 1) }));

    return [prefix, selected];
}

export function deleteSelection(snapshot: IEditSnapshot, editorState: IEditorState): IEditSnapshot {

    let [idPrefix, selected] = getPrefixForSelection(editorState.snapshot);

    let refStrs = new Set(selected.map(s => refToString(s)));
    function selectionHasRef(id: string, type: RefType) {
        return refStrs.has(refToString({ id, type }));
    }

    let selectionPerWire = new Map<string, IElRef[]>();
    for (let ref of selected) {
        if (ref.type === RefType.WireNode || ref.type === RefType.WireSeg) {
            getOrAddToMap(selectionPerWire, ref.id, () => []).push(ref);
        }
    }

    let newSnapshot = updateSubSchematic(editorState, { idPrefix }, snapshot, (schematic) => {

        return assignImm(schematic, {
            comps: schematic.comps.filter(c => !selectionHasRef(c.id, RefType.Comp)),
            wires: schematic.wires
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
        });
    });

    return assignImm(newSnapshot, { selected: [] });
}
