import { StateSetter, getOrAddToMap } from "../utils/data";
import { Vec3 } from "../utils/vector";
import { IEditorState, RefType, IElRef, IWireGraph, ISchematic, IEditSnapshot } from "./CpuModel";
import { editLayout } from "./Editor";
import { ILSState, exportData, importData, schematicToLsState } from "./ImportExport";
import { deleteSelection } from "./Selection";
import { copyWireGraph, repackGraphIds, splitIntoIslands } from "./Wire";
import { CompLibrary } from "./comps/CompBuilder";

export function cutSelection(ev: KeyboardEvent, editorState: IEditorState, setEditorState: StateSetter<IEditorState>) {
    let schematic = selectionToSchematic(editorState);
    writeToClipboard(exportData(schematic));
    setEditorState(editLayout(true, deleteSelection));
}

export function copySelection(ev: KeyboardEvent, editorState: IEditorState, setEditorState: StateSetter<IEditorState>) {
    let schematic = selectionToSchematic(editorState);
    writeToClipboard(exportData(schematic));
}

export function pasteSelection(ev: KeyboardEvent, editorState: IEditorState, setEditorState: StateSetter<IEditorState>) {

    readFromClipboard().then(text => {

        console.log('gonna paste', text);

        let res = importData(text);

        if (res.issues) {
            console.log('paste issues', res.issues);
            return;
        } else if (res.schematic) {
            console.log('want to merge in schematic', res.schematic);

            // now have to merge in the schematic!
            // update the ids (there will be conflicts)
            // move to a new position (or the same position if we're on a different schematic with no overlaps)
            // set the selection to the newly created components/wires
            // link up _some_ wires to comp nodes
            // maybe move the selection with the mouse, and require a click to place it?
            // e.g. say we want to duplicate vertically, and link things up automatically

            setEditorState(editLayout(true, (layout, editorState) => {
                return mergeInSchematic(layout, res.schematic!, editorState.compLibrary);
            }));
        }
    });
}

export function mergeInSchematic(snapshot: IEditSnapshot, schematic: ISchematic, compLibrary: CompLibrary): IEditSnapshot {
    if (schematic.comps.length === 0 && schematic.wires.length === 0) {
        return snapshot;
    }
    snapshot = { ...snapshot, comps: [...snapshot.comps], wires: [...snapshot.wires] };

    let compIdRemap = new Map<string, string>();
    let newSelectionRefs: IElRef[] = [];

    let delta = new Vec3(10, 10);

    for (let comp of schematic.comps) {
        let id = '' + snapshot.nextCompId++;

        let newComp = compLibrary.create(comp.defId, comp.args);
        newComp.id = id;
        newComp.pos = comp.pos.add(delta);

        compIdRemap.set(comp.id, id);
        snapshot.comps.push(newComp);
        newSelectionRefs.push({ id, type: RefType.Comp });
    }

    for (let wire of schematic.wires) {
        let wireCopy = copyWireGraph(wire);
        for (let node of wireCopy.nodes) {
            if (node.ref) {
                node.ref = { ...node.ref, id: compIdRemap.get(node.ref.id) || node.ref.id };
            }
            node.pos = node.pos.add(delta);
        }
        let id = '' + snapshot.nextWireId++;
        for (let node of wireCopy.nodes) {
            newSelectionRefs.push({ id, type: RefType.WireNode, wireNode0Id: node.id });
            for (let edge of node.edges) {
                if (edge > node.id) {
                    newSelectionRefs.push({ id, type: RefType.WireSeg, wireNode0Id: node.id, wireNode1Id: edge });
                }
            }
        }
        snapshot.wires.push({ ...wireCopy, id });
    }

    snapshot.selected = newSelectionRefs;

    return snapshot;
}

export function writeToClipboard(text: string) {
    navigator.clipboard.writeText(text);
}

export function readFromClipboard(): Promise<string> {
    return navigator.clipboard.readText();
}

export function selectionToSchematic(editorState: IEditorState): ISchematic {
    let selected = editorState.snapshot.selected;

    let selectedCompIds = new Set(selected.filter(a => a.type === RefType.Comp).map(a => a.id));
    let selectedWireIds = new Map<string, IElRef[]>();

    for (let ref of selected) {
        if (ref.type === RefType.WireNode || ref.type === RefType.WireSeg) {
            getOrAddToMap(selectedWireIds, ref.id, () => []).push(ref);
        }
    }

    let wires: IWireGraph[] = [];

    for (let wire of editorState.snapshot.wires) {
        if (!selectedWireIds.has(wire.id)) {
            continue;
        }

        let refs = selectedWireIds.get(wire.id)!;
        let nodeIdsToInclude = new Set<number>();
        for (let r of refs) {
            nodeIdsToInclude.add(r.wireNode0Id!);
            if (r.type === RefType.WireSeg) {
                nodeIdsToInclude.add(r.wireNode1Id!);
            }
        }

        let trimmedWire = {
            ...wire,
            nodes: wire.nodes.map(n => {
                let keep = nodeIdsToInclude.has(n.id);
                return {
                    ...n,
                    edges: keep ? n.edges.filter(e => nodeIdsToInclude.has(e)) : [],
                    ref: keep && n.ref && selectedCompIds.has(n.ref.id) ? n.ref : undefined,
                };
            }),
        };

        for (let subWire of splitIntoIslands(repackGraphIds(trimmedWire))) {
            wires.push(subWire);
        }
    }

    let snapshotPartial: ISchematic = {
        comps: editorState.snapshot.comps.filter(c => selectedCompIds.has(c.id)),
        wires: wires,
    };

    return snapshotPartial;
}

