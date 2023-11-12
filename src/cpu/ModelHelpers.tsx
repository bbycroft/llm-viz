import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { IEditSnapshot, IEditorState } from "./CpuModel";
import { compPortDefId } from "./comps/CompPort";
import { ISharedContext, createSharedContext } from "./library/SharedContext";

export interface IBoundingBoxOptions {
    excludePorts?: boolean;
}

export function computeModelBoundingBox(model: IEditSnapshot, options?: IBoundingBoxOptions): BoundingBox3d {
    let modelBbb = new BoundingBox3d();

    for (let c of model.mainSchematic.comps) {
        if (options?.excludePorts && c.defId === compPortDefId) {
            continue;
        }

        modelBbb.addInPlace(c.pos);
        modelBbb.addInPlace(c.pos.add(c.size));
    }
    for (let w of model.mainSchematic.wires) {
        for (let n of w.nodes) {
            modelBbb.addInPlace(n.pos);
        }
    }
    if (model.mainSchematic.compBbox && !options?.excludePorts) {
        modelBbb.combineInPlace(model.mainSchematic.compBbox);
    }

    return modelBbb;
}

export function computeZoomExtentMatrix(modelBb: BoundingBox3d, viewBb: BoundingBox3d, expandFraction: number): AffineMat2d {
    let bb = new BoundingBox3d(modelBb.min, modelBb.max);
    bb.expandInPlace(modelBb.size().mul(expandFraction).len());

    let modelSize = bb.size();
    let viewSize = viewBb.size();

    let mtx = AffineMat2d.multiply(
        AffineMat2d.translateVec(viewBb.center()),
        AffineMat2d.scale1(Math.min(viewSize.x / modelSize.x, viewSize.y / modelSize.y)),
        AffineMat2d.translateVec(bb.center().mul(-1)),
    );

    return mtx;
}

export function createCpuEditorState(sharedContext: ISharedContext | null): IEditorState {
    sharedContext ??= createSharedContext();
    let editSnapshot = constructEditSnapshot();

    return {
        snapshot: editSnapshot, // wiresFromLsState(constructEditSnapshot(), lsState, compLibrary),
        snapshotTemp: null,
        mtx: AffineMat2d.multiply(AffineMat2d.scale1(10), AffineMat2d.translateVec(new Vec3(1920/2, 1080/2).round())),
        sharedContext,
        compLibrary: sharedContext.compLibrary,
        schematicLibrary: sharedContext.schematicLibrary,
        codeLibrary: sharedContext.codeLibrary,
        desiredSchematicId: null,
        activeSchematicId: null,
        redoStack: [],
        undoStack: [],
        hovered: null,
        maskHover: null,
        selectRegion: null,
        addLine: false,
        showExeOrder: false,
        transparentComps: false,
        compLibraryVisible: false,
        needsZoomExtent: true,
    };
}


export function constructEditSnapshot(): IEditSnapshot {
    return {
        focusedIdPrefix: "",
        selected: [],
        mainSchematic: {
            id: "",
            name: "",

            nextWireId: 0,
            nextCompId: 0,
            wires: [],
            comps: [],

            compPorts: [],
            compSize: new Vec3(0, 0),
            compBbox: new BoundingBox3d(),
        },
        subSchematics: {},
    };
}
