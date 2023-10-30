import { subscribe } from "diagnostics_channel";
import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { IComp, IEditorState, ISchematic } from "./CpuModel";
import { ICompDef } from "./comps/CompBuilder";

export function computeSubLayoutMatrix(comp: IComp, compDef: ICompDef<any>, subSchematic: ISchematic) {
    if (!subSchematic.comps) {
        debugger;
    }

    let bb = subSchematic.compBbox?.clone() ?? new BoundingBox3d();
    if (bb.empty) {
        for (let c of subSchematic.comps) {
            bb.addInPlace(c.pos);
            bb.addInPlace(c.pos.add(c.size));
        }
        bb.expandInPlace(Math.min(bb.size().x, bb.size().y) * 0.1);
    }
    if (bb.empty) {
        bb = new BoundingBox3d(new Vec3(), comp.size.mul(2.5));
    }

    let bbSize = bb.size();
    let scale = Math.min(comp.size.x / bbSize.x, comp.size.y / bbSize.y);

    let subMtx = AffineMat2d.multiply(
        AffineMat2d.translateVec(comp.pos.mulAdd(comp.size, 0.5)),
        AffineMat2d.scale1(scale),
        AffineMat2d.translateVec(bb.min.mul(-1).mulAdd(bbSize, -0.5)),
    );

    return subMtx;
}

// We get the sub-schematic from the in-editor snapshot (i.e. if it has edits), if available.
// Otherwise we get it from the comp library (or schematic library).
export function getCompSubSchematic(editorState: IEditorState, comp: IComp): ISchematic | null {
    if (!comp.hasSubSchematic && !comp.subSchematicId) {
        return null;
    }

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let subComp = snapshot.subComps.get(comp.id);
    if (subComp) {
        return subComp;
    }

    if (comp.subSchematicId) {
        return editorState.schematicLibrary.getSchematic(comp.subSchematicId)?.model ?? null;
    }

    let compDef = editorState.compLibrary.getCompDef(comp.defId);
    return compDef?.subLayout?.layout ?? null;
}

// Get's the parent comps of a refId. Does not include the refId target itself (it might be a wire, say).
export function getParentCompsFromId(editorState: IEditorState, refId: string): IComp[] {
    let parts = refId.split('|');
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let schematic: ISchematic = snapshot;
    let parentComps: IComp[] = [];

    for (let partId = 0; partId < parts.length - 1; partId++) {
        let part = parts[partId];

        let comp = schematic.comps.find(c => c.id === part);

        if (!comp) {
            break;
        }

        parentComps.push(comp);

        let subSchematic = getCompSubSchematic(editorState, comp);

        if (!subSchematic) {
            break;
        }

        schematic = subSchematic;
    }

    return parentComps;
}

export function getCompFromRef(editorState: IEditorState, refId: string): IComp | null {
    let parts = refId.split('|');
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let schematic: ISchematic = snapshot;

    for (let partId = 0; partId < parts.length - 1; partId++) {
        let part = parts[partId];

        let comp = schematic.comps.find(c => c.id === part);

        if (!comp) {
            return null;
        }

        let subSchematic = getCompSubSchematic(editorState, comp);

        if (!subSchematic) {
            return null;
        }

        schematic = subSchematic;
    }

    let lastPartId = parts[parts.length - 1];
    return schematic.comps.find(c => c.id === lastPartId) ?? null;
}
