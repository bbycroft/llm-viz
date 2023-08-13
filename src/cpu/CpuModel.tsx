import { AffineMat2d } from "../utils/AffineMat2d";
import { Vec3 } from "../utils/vector";

export interface IEditorState {
    mtx: AffineMat2d;

    layout: ICpuLayoutBase;
    layoutTemp: ICpuLayoutBase | null;

    undoStack: ICpuLayoutBase[];
    redoStack: ICpuLayoutBase[];

    hovered: IHitTest | null;
    addLine: boolean
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
    wireSegId?: number;
    wireSegEnd?: number; // 0 or 1 (if defined)
}

export enum RefType {
    Comp,
    Wire,
    CompNode,
}

export type IElement = IComp | ICompNode | IBus;

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

export interface IBus {
    id: string;
    type: BusType;
    width?: number;
    truncPts: Vec3[];
    branches: Vec3[][];
    color: string;
}

export enum BusType {
    Data,
    Addr,
    AddrDataSignal,
}

export interface IComp {
    id: string;
    name: string;
    pos: Vec3;
    size: Vec3;
    type: CompType;
    nodes?: ICompNode[];
}

export interface ICompNode {
    id: string;
    pos: Vec3; // relative to comp
    name: string;
    type?: CompNodeType;
    width?: number;
}

export enum CompNodeType {
    Input = 1,
    Output = 1 << 1,
    Tristate = 1 << 2,
}

export enum CompType {
    RAM,
    ROM,
    ID,
    ALU,
    PC,
    REG,
    MUX,
    LS
}

export interface ICpuLayoutBase {
    nextWireId: number;
    comps: IComp[];
    wires: IWire[];
    buses: IBus[]; // deprecated
}
