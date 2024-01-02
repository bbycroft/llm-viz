import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { CompLibrary, ICompDef } from "./comps/CompBuilder";
import { ICompPortConfig } from "./comps/CompPort";
import { CodeSuiteManager } from "./library/CodeSuiteManager";
import { ISharedContext } from "./library/SharedContext";
import { SchematicLibrary } from "./schematics/SchematicLibrary";

/* All components & schematics and each version of them is represented by a separate ILibraryItem.

Schematics are usually the top-level entities that users build with, with a set of wires & components.
Schematics can also be used within other schematics by also having an associated component (in the same
ILibraryItem). In that case, there are components within the schematic which map onto the ports of the
component. That way, schematics can be nested arbitrarily.

Components within a given schematic reference library-items from our library via a string id. There is
a global namespace of ids, where each maps to our ILibraryItem. In some cases, to allow for id-renaming,
an ILibraryItem can have multiple ids. On write, all schematics are updated to use the primary id.
*/

export interface ILibraryItem {
    id: string;
    altIds?: string[];

    name: string;
    notes?: string;
    compDef?: ICompDef<any>;
    schematic?: ISchematic;
}

export interface IExeRunArgs {
    halt: boolean;
}

export interface IExeSystem {
    comps: IExeComp[];
    nets: IExeNet[];
    executionSteps: IExeStep[];
    latchSteps: IExeStep[]; // latches are done just prior to the next round of execution steps (it's useful to pause prior to latching)
    lookup: IExeSystemLookup;
    runArgs: IExeRunArgs;
    compLibrary: CompLibrary;
}

export interface IExeSystemLookup {
    compIdToIdx: Map<string, number>;
    wireIdToNetIdx: Map<string, number>;
}

export interface IExeStep {
    compIdx: number; // -1 for nets
    phaseIdx: number; // -1 for nets

    netIdx: number; // -1 for comps
}

export interface IExeComp<T = any> {
    idx: number;
    comp: IComp; // a (maybe) rendered component
    ports: IExePort[];
    data: T;
    phases: IExePhase<T>[];
    subSystem?: IExeSystem;
    compFullId: string;
}

export interface IExePhase<T = any> {
    readPortIdxs: number[];
    writePortIdxs: number[];
    func: (comp: IExeComp<T>, args: IExeRunArgs) => void;
    isLatch: boolean;
}

export interface IExePort {
    portIdx: number; // into IComp.ports[i]
    netIdx: number;
    width: number;
    type: PortType;
    ioEnabled: boolean; // for tristate (true otherwise). For inputs, false means the input is ignored (e.g. an inactive mux input). The latter is useful for rendering
    ioDir: IoDir; // for rendering. Only needed to be set when is a bidirectional port
    dataUsed: boolean; // for rendering, and involves back-propagation (but typically follows ioEnabled)
    value: number;
}

export enum IoDir {
    None, // check flag in PortDir
    In,
    Out,
}

export interface IExeNet {
    idx: number;
    wire: IWireGraph; // a (maybe) rendered wire
    wireFullId: string;
    inputs: IExePortRef[]; // will have multiple inputs for buses (inputs with tristate)
    outputs: IExePortRef[];
    tristate: boolean;
    width: number;
    type: PortType;
    value: number;
    enabledCount: number;
}

// in our execution data model, we use indexes rather than ids for perf
export interface IExePortRef {
    comp: IComp;
    portIdx: number;
    exeComp: IExeComp
    exePort: IExePort;
    valid: boolean;
}

// We're adding a new level of state, which tracks all editors (tabs), and they each have their own state (mostly).
// Keep some global state like the comp library here.
export interface IProgramState {
    compLibrary: CompLibrary;
    schematicLibrary: SchematicLibrary;

    activeEditorIdx: number;
    editors: IEditorState[];
}

export interface IEditorState {
    mtx: AffineMat2d;
    targetScale?: number;
    scaleModelPt?: Vec3;

    snapshot: IEditSnapshot;
    snapshotTemp: IEditSnapshot | null;

    undoStack: IEditSnapshot[];
    redoStack: IEditSnapshot[];

    desiredSchematicId: string | null;
    activeSchematicId: string | null;

    sharedContext: ISharedContext;
    compLibrary: CompLibrary;
    schematicLibrary: SchematicLibrary;
    codeLibrary: CodeSuiteManager;
    wireRenderCache: IWireRenderCache;

    exeModel: IExeSystem | null;
    exeModelUpdateCntr: number;

    selectRegion: ISelectRegion | null;
    hovered: IHitTest | null;
    maskHover: string | null;
    addLine: boolean
    showExeOrder: boolean;
    transparentComps: boolean;
    compLibraryVisible: boolean;
    needsZoomExtent: boolean;

    dragCreateComp?: IDragCreateComp;

    stepSpeed?: number;
}

export interface ISelectRegion {
    idPrefix: string;
    bbox: BoundingBox3d;
}

export interface IDragCreateComp {
    compOrig: IComp;
    applyFunc?: (a : IEditSnapshot) => IEditSnapshot;
}

export interface IHitTest {
    ref: IElRef;
    distPx: number;
    modelPt: Vec3;
}

export interface ICanvasState {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    region: BoundingBox3d;
    size: Vec3; // derived
    scale: number; // derived
    mtx: AffineMat2d; // derived
    // mtxLocal: AffineMat2d; // derived
    tileCanvases: Map<string, HTMLCanvasElement>;

    t: number;
    rafHandle: number;
}

export interface IWireRenderCache {
    lookupWire(editorState: IEditorState, idPrefix: string, wire: IWireGraph): IWireRenderInfo;
    lookupCompPort(editorState: IEditorState, idPrefix: string, comp: IComp, portId: number): [wire: IWireRenderInfo, nodeId: number] | null;
}

// Things that are calculated by traversing the graph, based on the exeModel
// this is used in multiple places besides just rendering the wires themselves (requiring caching)
// e.g. drawing extra wire segments at the comp-ports that match the style, or manually drawing wires
// within other components, like a mux or wire expander (that aren't sub-schematics).
export interface IWireRenderInfo {
    isCtrl: boolean;
    isData: boolean;
    isAddr: boolean;

    isNonZero: boolean;
    portBindings: Map<string, IWirePortBinding>; // key is the "compId:portId", matching the ref id on the node (ids local to the schematic)
    flowSegs: Set<string>; // the direction of flow is given by id0 -> id1 in "id0:id1"
    flowNodes: Set<number>; // nodes that are part of the flow (key is node index)

    width: number;

    isHover: boolean;
    isSelected: boolean;
    selectedNodes: Set<number>; // key is node index
    selectedSegs: Set<string>; // key is seg key ("id0:id1")

    activeDestNodeCount: number;
    activeSrcNodeCount: number;

    destNodeCount: number;
    srcNodeCount: number;
}

export interface IWirePortBinding {
    comp: IComp;
    port: ICompPort;
    exePort: IExePort;
    nodeId: number;
}

export enum ToolbarTypes {
    PlayPause = "PlayPause",
    Viewport = "Viewport",
}

export interface IElRef {
    type: RefType;
    id: string;
    compNodeId?: string;
    wireNode0Id?: number;
    wireNode1Id?: number;
}

export enum RefType {
    Comp,
    WireSeg,
    WireNode,
    CompNode,
}

export type IElement = IComp | ICompPort;

export interface IWire {
    id: string;
    segments: ISegment[];
}

export interface IWireGraph {
    id: string;
    nodes: IWireGraphNode[];
}

export interface IWireGraphNode {
    id: number;
    pos: Vec3;
    edges: number[]; // index into IWireGraph.nodes; bi-directional edges
    ref?: IElRef;
}

export interface ISegment {
    p0: Vec3;
    p1: Vec3;
    comp0Ref?: IElRef;
    comp1Ref?: IElRef;
}

export interface ICompRenderArgs<T, A = any> {
    cvs: ICanvasState;
    ctx: CanvasRenderingContext2D;
    editCtx: IEditContext;
    comp: IComp<A>;
    exeComp: IExeComp<T>;
    styles: IRenderStyles;
    isActive: boolean;
}

export interface ICompOptsRenderArgs<T, A = any> {
    editCtx: IEditContext;
    comp: IComp<A>;
    exeComp: IExeComp<T> | null;
}

export interface IEditContext {
    idPrefix: string;
}

export interface IRenderStyles {
    lineHeight: number;
    fontSize: number;
    lineWidth: number;
    strokeColor: string;
    fillColor: string;
}

export enum CompDefFlags {
    None = 0,
    CanRotate = 1 << 0,
    HasBitWidth = 1 << 1,
    IsAtomic = 1 << 2, // can't have any internal schematic (1 bit basic gates; comp-ports etc)
}

export interface IComp<A = any> {
    id: string;
    defId: string;
    name: string;
    extId?: string; // an id that can be referenced "externally"
    subSchematicId?: string;
    pos: Vec3;
    size: Vec3;
    ports: ICompPort[];
    args: A;
    flags: CompDefFlags;
    resolved: boolean;
    hasSubSchematic: boolean;
}

export interface ICompPort {
    id: string;
    pos: Vec3; // relative to comp
    name: string;
    type: PortType;
    width?: number;
}




export enum PortType {
    None = 0,
    In = 1 << 0,
    Out = 1 << 1,
    Tristate = 1 << 2,

    // these ones propagate onto the wire/net for display
    Data = 1 << 3,
    Addr = 1 << 4,
    Ctrl = 1 << 5,

    Hidden = 1 << 6,

    OutTri = Out | Tristate,
    InOutTri = In | Out | Tristate,
}

export interface ISchematic {
    comps: IComp[];
    wires: IWireGraph[];
    compBbox: BoundingBox3d;
    parentCompDefId?: string;
    parentComp?: IComp;
}

export interface IEditSnapshot {
    focusedIdPrefix: string | null; // where pastes will go, etc, and should point to a subSchematic. null means the top-level, mainSchematic
    selected: IElRef[];
    mainSchematic: IEditSchematic;
    subSchematics: Record<string, IEditSchematic>;
}

/**
 * OK, how do we manage our components that are builtin, but we want to add schematics for?
 * We want the multiple schematics to map to a builtin comp, and select the given schematic
 * for a given comp. Mostly we want to edit the schematic from within a parent schematic, and then
 * save it, ideally to that parent schematic (unless we want it to live on its own).
 *
 * Probably start with it living on its own. (since we can't save to the parent schematic yet)
 * We'll have a field on the realized comp which says which schematic we're using underneath.
 *
 * So we click on a comp, and UI shows up to a) select from some pre-existing schematics, or b) create a new one.
 * This will be on the RHS, and also have things like the extId of the component & other details.
 *
 * The schematic is tied to a particular comp, but sort of weakly, and it's clear that the comp ports
 * are the source-of-truth. Probably have ability to disable/hide/ignore not-connected ports, which is defined by the
 * presence of the port in the schematic.
*/

export interface IEditSchematic {
    id: string;
    name: string;
    comps: IComp[];
    wires: IWireGraph[];
    compBbox: BoundingBox3d;

    nextCompId: number;
    nextWireId: number;

    // this schematic uses a component from the compLibrary as its parent component
    parentCompDefId?: string;
    parentComp?: IComp; // with some args

    // -- or --

    // this schematic has component definitions supplied explicitly
    compSize: Vec3;
    compPorts: ICompPort[];
}



export interface ISchematicDef {
    id: string;
    name: string;
    snapshot: IEditSnapshot;
    compArgs?: ISchematicCompArgs; // a schematic may get wrapped into a component

    hasEdits: boolean;
    // when we switch between models, want to keep as much state around as possible
    undoStack?: IEditSnapshot[];
    redoStack?: IEditSnapshot[];
    mtx?: AffineMat2d;
    schematicStr?: string; // for LS update detection
}

export interface ISchematicCompArgs {
    size: Vec3;
    ports: ISubLayoutPort[];
}

export interface ISubLayoutPort {
    id: string;
    name: string
    type: PortType;
    pos: Vec3;
    width?: number;
}

export interface IParentCompInfo {
    parentToInnerMtx: AffineMat2d;
    comp: IComp;
    linkedCompPorts: Map<string, { compPort: IComp<ICompPortConfig>, port: ICompPort, innerPos: Vec3 }>;
}
