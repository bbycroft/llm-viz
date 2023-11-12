import { assert } from "console";
import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { IComp, IEditContext, IEditSchematic, IEditSnapshot, IEditorState, IElRef, ISchematic } from "./CpuModel";
import { ICompDef } from "./comps/CompBuilder";
import { ISharedContext } from "./library/SharedContext";
import { assignImm } from "../utils/data";

export function editCtxFromRefId(ref: IElRef): IEditContext {
    let prefixIdx = ref.id.lastIndexOf('|');
    return { idPrefix: prefixIdx >= 0 ? ref.id.substring(0, prefixIdx + 1) : '' };
}

export function globalRefToLocal(ref: IElRef): IElRef {
    let prefixIdx = ref.id.lastIndexOf('|');
    return assignImm(ref, { id: ref.id.substring(prefixIdx + 1) });
}

export function localRefToGlobal(ref: IElRef, editCtx: IEditContext): IElRef {
    return assignImm(ref, { id: editCtx.idPrefix + ref.id });
}

export function getMatrixForEditContext(editCtx: IEditContext, editorState: IEditorState): AffineMat2d {

    let parts = editCtx.idPrefix.split('|');
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let schematic: ISchematic = snapshot.mainSchematic;
    let mtx = editorState.mtx;

    for (let partId = 0; partId < parts.length - 1; partId++) {
        let part = parts[partId];

        let comp = schematic.comps.find(c => c.id === part);

        if (!comp) {
            break;
        }

        let subSchematic = getCompSubSchematic(editorState, comp);

        if (!subSchematic) {
            break;
        }

        let subMtx = computeSubLayoutMatrix(comp, subSchematic);

        mtx = AffineMat2d.multiply(mtx, subMtx);

        schematic = subSchematic;
    }

    return mtx;
}

export function computeSubLayoutMatrix(comp: IComp, subSchematic: ISchematic) {
    let bb = subSchematic.compBbox?.clone() ?? new BoundingBox3d();
    if (bb.empty) {
        // probably shouldn't depend on this! But it's a reasonable default.
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

export function getActiveSubSchematic(editorState: IEditorState): [string, IEditSchematic] {
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let idPrefix = snapshot.focusedIdPrefix ?? '';
    let schematic = getCompSubSchematicForPrefix(editorState.sharedContext, snapshot, idPrefix);
    return schematic ? [idPrefix, schematic] : ["", snapshot.mainSchematic];
}

// We get the sub-schematic from the in-editor snapshot (i.e. if it has edits), if available.
// Otherwise we get it from the comp library (or schematic library).
export function getCompSubSchematic(editorState: IEditorState, comp: IComp): IEditSchematic | null {
    if (!comp.hasSubSchematic && !comp.subSchematicId) {
        return null;
    }

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    return getCompSubSchematicForSnapshot(editorState.sharedContext, snapshot, comp);
}

export function getSchematicForRef(editorState: IEditorState, ref: IElRef): [IElRef, IEditSchematic] {
    let editCtx = editCtxFromRefId(ref);
    let localRef = globalRefToLocal(ref);
    let schematic = getCompSubSchematicForPrefix(editorState.sharedContext, editorState.snapshot, editCtx.idPrefix);

    return [localRef, schematic ?? editorState.snapshot.mainSchematic];
}

export function getCompSubSchematicForSnapshot(sharedContext: ISharedContext, snapshot: IEditSnapshot, comp: IComp): IEditSchematic | null {
    if (!comp.hasSubSchematic && !comp.subSchematicId) {
        return null;
    }

    if (comp.subSchematicId) {
        let editSchematic = snapshot.subSchematics[comp.subSchematicId];
        if (editSchematic) {
            return editSchematic;
        }

        let schemLibEntry = sharedContext.schematicLibrary.getSchematic(comp.subSchematicId);

        return schemLibEntry?.model.mainSchematic ?? null;
    }

    let compDef = sharedContext.compLibrary.getCompDef(comp.defId);

    let editSchematic = snapshot.subSchematics[comp.defId ?? ''];
    if (editSchematic) {
        return editSchematic;
    }

    return compDef?.subLayout?.layout as IEditSchematic ?? null;
}

export function getCompSubSchematicForPrefix(sharedContext: ISharedContext, snapshot: IEditSnapshot, prefix: string): IEditSchematic | null {
    let parts = prefix.split('|');
    let schematic: IEditSchematic = snapshot.mainSchematic;

    for (let partId = 0; partId < parts.length - 1; partId++) {
        let part = parts[partId];
        let comp = schematic.comps.find(c => c.id === part);
        if (!comp) {
            return null;
        }
        let subSchematic = getCompSubSchematicForSnapshot(sharedContext, snapshot, comp);

        if (!subSchematic) {
            return null;
        }

        schematic = subSchematic;
    }

    return schematic;
}

// Get's the parent comps of a refId. Does not include the refId target itself (it might be a wire, say).
export function getParentCompsFromId(editorState: IEditorState, refId: string): IComp[] {
    let parts = refId.split('|');
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let schematic: ISchematic = snapshot.mainSchematic;
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
    let schematic: IEditSchematic = snapshot.mainSchematic;

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
