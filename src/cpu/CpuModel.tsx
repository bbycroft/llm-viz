import { AffineMat2d } from "../utils/AffineMat2d";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { CompLibrary, ICompDef } from "./comps/CompBuilder";
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

export interface IEditorState {
    mtx: AffineMat2d;

    activeSchematicId: string | null;
    snapshot: IEditSnapshot;
    snapshotTemp: IEditSnapshot | null;

    // time to combine these!! Actually, let's use CompLibrary, since it's used in more places, & rename it
    compLibrary: CompLibrary;
    schematicLibrary: SchematicLibrary;

    undoStack: IEditSnapshot[];
    redoStack: IEditSnapshot[];

    selectRegion: BoundingBox3d | null;
    hovered: IHitTest | null;
    maskHover: string | null;
    addLine: boolean
    showExeOrder: boolean;
    transparentComps: boolean;
    compLibraryVisible: boolean;

    dragCreateComp?: IDragCreateComp;
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
    size: Vec3; // derived
    scale: number; // derived
    mtx: AffineMat2d; // derived
    tileCanvases: Map<string, HTMLCanvasElement>;
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
    comp: IComp<A>;
    exeComp: IExeComp<T>;
    styles: IRenderStyles;
    isActive: boolean;
}

export interface IRenderStyles {
    lineHeight: number;
    fontSize: number;
    lineWidth: number;
    strokeColor: string;
    fillColor: string;
}

export interface IComp<A = any> {
    id: string;
    defId: string;
    name: string;
    pos: Vec3;
    size: Vec3;
    ports: ICompPort[];
    args: A;
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

    OutTri = Out | Tristate,
    InOutTri = In | Out | Tristate,
}

export interface ISchematic {
    comps: IComp[];
    wires: IWireGraph[];
}

export interface IEditSnapshot {
    selected: IElRef[];

    // schematic
    nextCompId: number;
    nextWireId: number;
    comps: IComp[];
    wires: IWireGraph[];

    // custom component def
    compSize: Vec3;
    compPorts: ICompPort[];

    subComps: Map<string, IEditSchematic>;
}

interface IEditSchematic {
    nextCompId: number;
    nextWireId: number;
    comps: IComp[];
    wires: IWireGraph[];
}

export interface IMemoryMap {
    romOffset: number;
    ramOffset: number;
    ioOffset: number;
    ioSize: number;

    rom: Uint8Array;
    ram: Uint8Array;
}
