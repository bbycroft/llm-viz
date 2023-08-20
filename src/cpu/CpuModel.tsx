import { AffineMat2d } from "../utils/AffineMat2d";
import { StateSetter } from "../utils/data";
import { Vec3 } from "../utils/vector";
import { CompLibrary } from "./comps/CompBuilder";

export interface IFullSystem {
    layout: ICpuLayout;
    exe: IExeSystem;
}

export interface IExeSystem {
    comps: IExeComp[];
    nets: IExeNet[];
    compExecutionOrder: number[];
    lookup: IExeSystemLookup;
}

export interface IExeSystemLookup {
    compIdToIdx: Map<string, number>;
    netIdToIdx: Map<string, number>;
}

export interface IExeComp<T = any> {
    comp: IComp; // a (maybe) rendered component
    ports: IExePort[];
    data: T;
    phaseCount: number;
    phaseIdx: number;
    phases: IExePhase<T>[];
    valid: boolean;
    subSystem?: IExeSystem;
}

// how does our step func work?
// particularly, handling combinatorial logic vs sequential logic
// for sequential,    we have: data -> outputs; inputs -> data
// for combinatorial, we have: inputs -> local; data -> outputs

// what if we wanted to make this neat & efficient?
// data stored in a single array
// net values are stored here (+ port values for multi-input)
// we have a sequence of functions to execute
// function context is ids into the data array
// actually, idea is to first sort them by execution order, then malloc their data by that as well
// then use pointers to that data
// but that's for another time eh

// back to how we just get it working
// each step can be split into multiple phases, and each phase is determined by what nodes it reads/writes

// for each phase, we need to know:
// - what nodes it reads
// - what nodes it writes

// and then we have sufficient information to determine the order of execution

// this way we can have arbitrary logic within a stepFunc (such as a sub-system, and have it execute in the correct order)
// and all with only 1 stepFunc per component

export interface IExePhase<T = any> {
    readPortIdxs: number[];
    writePortIdxs: number[];
    func: (comp: IExeComp<T>) => void;
    isLatch: boolean;
}

export interface IExePort {
    portIdx: number; // into IComp.nodes[i]
    netIdx: number;
    width: number;
    type: PortDir;
    outputEnabled: boolean; // for tristate (true otherwise)
    value: number;
}

export interface IExeNet {
    wire: IWireGraph; // a (maybe) rendered wire
    inputs: IExePortRef[]; // will have multiple inputs for buses (inputs with tristate)
    outputs: IExePortRef[];
    tristate: boolean;
    width: number;
    value: number;
    enabledCount: number;
}

// in our execution data model, we use indexes rather than ids for perf
export interface IExePortRef {
    compIdx: number;
    portIdx: number;
}

export interface IEditorState {
    mtx: AffineMat2d;

    layout: ICpuLayout;
    layoutTemp: ICpuLayout | null;

    compLibrary: CompLibrary;

    undoStack: ICpuLayout[];
    redoStack: ICpuLayout[];

    hovered: IHitTest | null;
    addLine: boolean

    dragCreateComp?: IDragCreateComp;
}

export interface IDragCreateComp {
    compOrig: IComp;
    applyFunc?: (a : ICpuLayout) => ICpuLayout;
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
}

export interface IElRef {
    type: RefType;
    id: string;
    compNodeId?: string; // node for comp
    wireNode0Id?: number;
    wireNode1Id?: number;
    // wireSegEnd?: number; // 0 or 1 (if defined)
}

export enum RefType {
    Comp,
    Wire,
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

export interface ICompRenderArgs<T> {
    cvs: ICanvasState;
    ctx: CanvasRenderingContext2D;
    comp: IComp;
    exeComp: IExeComp<T> | null;
}

export interface IComp {
    id: string;
    defId: string;
    name: string;
    pos: Vec3;
    size: Vec3;
    ports: ICompPort[];
}

export interface ICompPort {
    id: string;
    pos: Vec3; // relative to comp
    name: string;
    type: PortDir;
    width?: number;
}

export enum PortDir {
    In = 1 << 0,
    Out = 1 << 1,
    Tristate = 1 << 2,

    // these ones propagate onto the wire/net for display
    Data = 1 << 3,
    Addr = 1 << 4,
    Ctrl = 1 << 5,

    OutTri = Out | Tristate,
}

export enum CompType {
    RAM,
    ROM,
    ID,
    IF,
    ALU,
    PC,
    REG,
    MUX,
    LS
}

export interface ICpuLayout {
    nextCompId: number;
    nextWireId: number;
    comps: IComp[];
    wires: IWireGraph[];
}
