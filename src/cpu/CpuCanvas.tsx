import React, { useCallback, useLayoutEffect, useReducer, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { ISystem, regNames } from "./CpuMain";
import s from "./CpuCanvas.module.scss";
import { AffineMat2d } from "../utils/AffineMat2d";
import { useCombinedMouseTouchDrag } from "../utils/pointer";
import { assignImm, clamp } from "../utils/data";
import { editLayout, ICanvasState, IEditorState } from "./Editor";

interface ICpuState {
    system: ISystem;
}

export const CpuCanvas: React.FC<{
    cpuState: ICpuState;
}> = ({ cpuState }) => {
    let [cvsState, setCvsState] = useState<ICanvasState | null>(null);
    let [editorState, setEditorState] = useState<IEditorState>({
        layout: constructCpuLayout(),
        layoutTemp: null,
        mtx: AffineMat2d.multiply(AffineMat2d.scale1(10), AffineMat2d.translateVec(new Vec3(1920/2, 1080/2).round())),
        redoStack: [],
        undoStack: [],
        hovered: null,
    });
    let [, redraw] = useReducer((x) => x + 1, 0);

    useResizeChangeHandler(cvsState?.canvas, redraw);

    let setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {

        if (el) {
            let ctx = el.getContext("2d")!;
            setCvsState({ canvas: el, ctx, size: new Vec3(1, 1), scale: 1 });
        } else {
            setCvsState(null);
        }
    }, []);

    useLayoutEffect(() => {
        if (!cvsState) {
            return;
        }

        let { canvas, ctx } = cvsState;

        let bcr = canvas.getBoundingClientRect();
        let w = bcr.width;
        let h = bcr.height;
        canvas.width = Math.floor(w * window.devicePixelRatio);
        canvas.height = Math.floor(h * window.devicePixelRatio);
        cvsState.size.x = w;
        cvsState.size.y = h;
        cvsState.scale = 1.0 / editorState.mtx.a;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.transform(...editorState.mtx.toTransformParams());
        renderCpuToCanvas(cvsState, editorState, cpuState);

        ctx.restore();
    });

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(cvsState?.canvas ?? null, ev => {
        return {
            mtx: editorState!.mtx,
            hovered: editorState!.hovered,
            modelPos: evToModel(ev),
        };
     }, function handleDrag(ev, ds, end) {
        let delta = new Vec3(ev.clientX - ds.clientX, ev.clientY - ds.clientY);

        if (!ds.data.hovered) {
            let newMtx = ds.data.mtx.mul(AffineMat2d.translateVec(delta));
            editorState.mtx = newMtx;
        } else if (ds.data.hovered.type === RefType.Comp) {
            handleComponentDrag(end, ds.data.hovered, ds.data.modelPos, evToModel(ev));
        }
        redraw();

        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleComponentDrag(end: boolean, ref: IElRef, origModelPos: Vec3, newModelPos: Vec3) {

        setEditorState(editLayout(end, layout => {
            return assignImm(layout, {
                comps: layout.comps.map(c => c.id === ref.id ? assignImm(c, {
                    pos: snapToGrid(c.pos.add(newModelPos.sub(origModelPos))),
                }) : c),
            });
        }));
    }

    function snapToGrid(pt: Vec3) {
        return pt.round();
    }

    function evToModel(ev: { clientX: number, clientY: number }, mtx: AffineMat2d = editorState!.mtx) {
        return mtx.mulVec3Inv(evToScreen(ev));
    }

    function evToScreen(ev: { clientX: number, clientY: number }) {
        let bcr = cvsState?.canvas.getBoundingClientRect();
        return new Vec3(ev.clientX - (bcr?.x ?? 0), ev.clientY - (bcr?.y ?? 0));
    }

    function modelToScreen(pt: Vec3) {
        return editorState!.mtx.mulVec3(pt);
    }

    function handleWheel(ev: React.WheelEvent) {
        let scale = editorState.mtx.a;
        let newScale = clamp(scale * Math.pow(1.0013, -ev.deltaY), 0.01, 100000) / scale;

        let modelPt = evToModel(ev);
        let newMtx = AffineMat2d.multiply(
            AffineMat2d.translateVec(modelPt.mul(-1)),
            AffineMat2d.scale1(newScale),
            AffineMat2d.translateVec(modelPt.mul(1)),
            editorState.mtx);

        editorState.mtx = newMtx;
        redraw();
        ev.stopPropagation();
        // ev.preventDefault();
    }

    function getRefUnderCursor(editorState: IEditorState, ev: React.MouseEvent): IElRef | null {
        let mousePt = evToModel(ev);
        let mousePtScreen = evToScreen(ev);

        let comps = editorState.layout.comps;

        for (let i = comps.length - 1; i >= 0; i--) {
            let comp = comps[i];
            for (let node of comp.nodes ?? []) {
                let modelPos = comp.pos.add(node.pos);
                let nodeScreenPos = modelToScreen(modelPos);
                let modelDist = modelPos.dist(mousePt);
                let screenDist = nodeScreenPos.dist(mousePtScreen);
                if (screenDist < 10 || modelDist < 0.2) {
                    return { type: RefType.CompNode, id: comp.id, subId: node.id };
                }
            }
        }

        for (let i = comps.length - 1; i >= 0; i--) {
            let comp = comps[i];
            let bb = new BoundingBox3d(comp.pos, comp.pos.add(comp.size));
            if (bb.contains(mousePt)) {
                return { type: RefType.Comp, id: comp.id };
            }
        }
        return null;
    }

    function handleMouseMove(ev: React.MouseEvent) {
        let newComp = getRefUnderCursor(editorState, ev);

        if (editorState.hovered?.id !== newComp?.id || editorState.hovered?.subId !== newComp?.subId) {
            setEditorState(a => assignImm(a!, { hovered: newComp }));
        }
    }

    function handleMouseDown(ev: React.MouseEvent) {
        if (!editorState) {
            return;
        }

        setDragStart(ev);
    }

    let cursor: string | undefined;
    if (dragStart && dragStart.data.hovered?.type === RefType.Comp) {
        cursor = 'grabbing';

    } else if (editorState.hovered) {
        if (editorState.hovered.type === RefType.CompNode) {
            cursor = 'crosshair';
        }
    }

    return <div className={s.canvasWrap}>
        <canvas className={s.canvas} ref={setCanvasEl}
            style={{ cursor: cursor }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onWheel={handleWheel}
        />
    </div>;
};

/*

So we have a grid, which we're drawing on, and we'll pan/zoom around it.

Hard to know what scale to use exactly, but can choose scale sizes at different levels. So aim for
nice round numbers at a given scale. Line widths are an important consideration tho. Also, maybe
want to keep line widths a constant size on the screen? Yeah, up to a point (don't want them really
thick for really small objects)

*/

export function renderCpuToCanvas(cvs: ICanvasState, editorState: IEditorState, cpu: ICpuState) {
    let ctx = cvs.ctx;
    let w = cvs.size.x;
    let h = cvs.size.y;

    ctx.save();

    renderCpu(cvs, editorState, editorState.layoutTemp ?? editorState.layout, cpu);

    ctx.restore();
}

export interface IElRef {
    type: RefType;
    id: string;
    subId?: string; // node for comp
}

export enum RefType {
    Comp,
    Bus,
    CompNode,
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

export type ICpuLayout = ReturnType<typeof constructCpuLayout>;

export enum StackPos {
    Start,
    End,
    Center,
}

function constructCpuLayout() {
    let comps: IComp[] = [];
    let buses: IBus[] = [];

    let busX = 0;
    let pad = 2;
    let busPad = 4;

    let mainBus: IBus = {
        id: 'mainBus0',
        type: BusType.AddrDataSignal,
        truncPts: [new Vec3(0, -1), new Vec3(0, 0), new Vec3(20, 0)],
        branches: [],
        color: "#a33",
    };

    let ram: IComp = {
        id: 'ram',
        name: "RAM",
        pos: new Vec3(),
        size: new Vec3(10, 10),
        type: CompType.RAM,
    };

    let rom: IComp = {
        id: 'rom',
        name: "ROM",
        pos: new Vec3(),
        size: new Vec3(10, 10),
        type: CompType.ROM,
    };

    let insDecode: IComp = {
        id: 'id',
        name: "Instruction Decode",
        pos: new Vec3(10, busPad),
        size: new Vec3(10, 3),
        type: CompType.ID,
        nodes: [{
            id: 'rhsImm',
            name: 'RHS Imm',
            pos: new Vec3(10, 2),
            type: CompNodeType.Output,
            width: 32,
        }],
    };

    let loadStore: IComp = {
        id: 'ls',
        name: "Load/Store",
        pos: new Vec3(10, busPad),
        size: new Vec3(10, 3),
        type: CompType.LS,
        nodes: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: CompNodeType.Input, width: 4 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: CompNodeType.Input, width: 12 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(3, 3), type: CompNodeType.Input, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(7, 3), type: CompNodeType.Input, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(10, 2), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
        ],
    };

    let alu: IComp = {
        id: 'alu',
        name: "ALU",
        pos: new Vec3(),
        size: new Vec3(10, 6),
        type: CompType.ALU,
        nodes: [
            { id: 'lhs', name: 'LHS', pos: new Vec3(3, 0), type: CompNodeType.Input, width: 32 },
            { id: 'rhs', name: 'RHS', pos: new Vec3(7, 0), type: CompNodeType.Input, width: 32 },
            { id: 'result', name: 'Result', pos: new Vec3(5, 6), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
        ],
    };

    let pc: IComp = {
        id: 'pc',
        name: "PC",
        pos: new Vec3(),
        size: new Vec3(10, 2),
        type: CompType.PC,
    };

    let reg: IComp = {
        id: 'reg',
        name: "Registers",
        pos: new Vec3(),
        size: new Vec3(10, 24),
        type: CompType.REG,
    };

    moveLeftOf(ram, busX - busPad);
    moveLeftOf(rom, busX - busPad);
    moveBelow(insDecode, 0 + busPad);
    moveRightOf(insDecode, busX);
    stackVertically([ram, rom], pad, 0, StackPos.End);
    stackHorizontally([insDecode, loadStore], pad * 8, 0, StackPos.Start);
    stackVertically([loadStore, alu], pad * 2, loadStore.pos.y, StackPos.Start);
    stackVertically([insDecode, pc, reg], pad, insDecode.pos.y, StackPos.Start);

    alu.pos.x = loadStore.pos.x;
    mainBus.truncPts[0].y = ram.pos.y + ram.size.y / 2;
    mainBus.truncPts[2].x = loadStore.pos.x + loadStore.size.x / 2;
    alu.pos.y = reg.pos.y;

    let lhsY = below(loadStore) + pad;
    let rhsY = lhsY + pad;

    let lhsX = rightOf(insDecode) + pad * 2;
    let rhsX = lhsX + pad;

    let lhsBotY = alu.pos.y + pad;
    let rhsBotY = lhsBotY + pad;

    let regRight = rightOf(reg);

    let pcMid = pc.pos.y + pc.size.y / 2;

    let insLower = insDecode.pos.y + 2;

    let lsLeft = loadStore.pos.x + loadStore.size.x * 0.25;
    let lsRight = loadStore.pos.x + loadStore.size.x * 0.75;

    // top line
    let lhsLine: IBus = {
        id: 'lhsLine',
        type: BusType.Data,
        width: 32,
        truncPts: [new Vec3(regRight, lhsBotY), new Vec3(lhsX, lhsBotY), new Vec3(lhsX, lhsY), new Vec3(lsLeft, lhsY)],
        branches: [
            [new Vec3(regRight, pcMid), new Vec3(lhsX, pcMid)],
            [new Vec3(lsLeft, lhsY), new Vec3(lsLeft, below(loadStore))],
            [new Vec3(lsLeft, lhsY), new Vec3(lsLeft, alu.pos.y)],
        ],
        color: "#3a1",
    };

    // bottom line
    let rhsLine: IBus = {
        id: 'rhsLine',
        type: BusType.Data,
        width: 32,
        truncPts: [new Vec3(regRight, rhsBotY), new Vec3(rhsX, rhsBotY), new Vec3(rhsX, rhsY), new Vec3(lsRight, rhsY)],
        branches: [
            [new Vec3(regRight, insLower), new Vec3(rhsX, insLower), new Vec3(rhsX, rhsY)],
            [new Vec3(lsRight, rhsY), new Vec3(lsRight, below(loadStore))],
            [new Vec3(lsRight, rhsY), new Vec3(lsRight, alu.pos.y)],
        ],
        color: "#3a7",
    };

    // how to define the line?
    // we're splitting LS/ALU into two lines, so 1/3 & 2/3 between them

    buses.push(mainBus, rhsLine, lhsLine);
    comps.push(ram, rom, insDecode, loadStore, alu, pc, reg);

    return {
        comps,
        buses,
        ram,
        rom,
        insDecode,
    }
}

function moveLeftOf(comp: IComp, x: number) {
    comp.pos.x = x - comp.size.x;
}

function moveBelow(comp: IComp, y: number) {
    comp.pos.y = y;
}

function moveRightOf(comp: IComp, x: number) {
    comp.pos.x = x;
}

function rightOf(comp: IComp) {
    return comp.pos.x + comp.size.x;
}

function below(comp: IComp) {
    return comp.pos.y + comp.size.y;
}

function stackVertically(comps: IComp[], pad: number, anchorY: number, pos: StackPos = StackPos.Start) {
    let height = -pad;
    for (let comp of comps) {
        height += comp.size.y + pad;
    }
    let y = (pos === StackPos.Start ? 0 : pos === StackPos.End ? -height : -height / 2) + anchorY;
    for (let comp of comps) {
        comp.pos.y = y;
        y += comp.size.y + pad;
    }
}

function stackHorizontally(comps: IComp[], pad: number, anchorX: number, pos: StackPos = StackPos.Start) {
    let width = -pad;
    for (let comp of comps) {
        width += comp.size.x + pad;
    }
    let x = (pos === StackPos.Start ? 0 : pos === StackPos.End ? -width : -width / 2) + anchorX;
    for (let comp of comps) {
        comp.pos.x = x;
        x += comp.size.x + pad;
    }
}

export function renderCpu(cvs: ICanvasState, editorState: IEditorState, cpuOpts: ICpuLayout, cpuState: ICpuState) {
    let ctx = cvs.ctx;

    for (let bus of cpuOpts.buses) {
        renderBus(cvs, bus);
    }

    for (let comp of cpuOpts.comps) {

        let isHover = editorState.hovered?.type === RefType.Comp && editorState.hovered.id === comp.id;

        ctx.beginPath();
        ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);

        ctx.fillStyle = "#aaa";
        ctx.strokeStyle = isHover ? "#a00" : "#000";
        ctx.lineWidth = 1 * cvs.scale;
        ctx.fill();
        ctx.stroke();

        for (let node of comp.nodes ?? []) {
            renderNode(cvs, editorState, comp, node);
        }

        if (comp.type === CompType.PC) {
            renderPc(cvs, comp, cpuState);
        } else if (comp.type === CompType.REG) {
            renderRegisterFile(cvs, comp, cpuState);
        } else {
            let text = comp.name;
            let textHeight = 3;
            ctx.font = `${textHeight / 4}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#000";
            ctx.fillText(text, comp.pos.x + (comp.size.x) / 2, comp.pos.y + (comp.size.y) / 2);
        }
    }
}

function renderNode(cvs: ICanvasState, editorState: IEditorState, comp: IComp, node: ICompNode) {
    let isHover = editorState.hovered?.type === RefType.CompNode && editorState.hovered.id === comp.id && editorState.hovered.subId === node.id;
    let ctx = cvs.ctx;
    let x = comp.pos.x + node.pos.x;
    let y = comp.pos.y + node.pos.y;
    let r = 2 / 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = isHover ? "#f00" : "#000";
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
}

// 32bit pc
function renderPc(cvs: ICanvasState, comp: IComp, cpuState: ICpuState) {
    let ctx = cvs.ctx;
    let pcValue = cpuState.system.cpu.pc;
    let pcHexStr = '0x' + pcValue.toString(16).toUpperCase().padStart(8, "0");

    ctx.font = `${3 / 4}px Arial`;
    ctx.textAlign = 'end';
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(pcHexStr, comp.pos.x + comp.size.x - 0.5, comp.pos.y + comp.size.y / 2);
}

// x0-x31 32bit registers, each with names
function renderRegisterFile(cvs: ICanvasState, comp: IComp, cpuState: ICpuState) {
    let ctx = cvs.ctx;
    let pad = 0.2;
    let lineHeight = (comp.size.y - pad * 2) / 32;

    for (let i = 0; i < 32; i++) {
        let regValue = cpuState.system.cpu.x[i];
        let regHexStr = '0x' + regValue.toString(16).toUpperCase().padStart(8, "0");

        ctx.font = `${2 / 4}px Arial`;
        ctx.textAlign = 'end';
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";

        let yMid = comp.pos.y + pad + lineHeight * (i + 0.5);

        ctx.fillText(regHexStr, comp.pos.x + comp.size.x - 0.5, yMid);

        let text = regNames[i];
        ctx.textAlign = 'start';
        ctx.fillText(text, comp.pos.x + 0.5, yMid);
    }

}

export function renderBus(cvs: ICanvasState, busOpts: IBus) {
    let ctx = cvs.ctx;

    ctx.beginPath();
    ctx.strokeStyle = busOpts.color;
    ctx.lineWidth = 4 * cvs.scale;
    ctx.lineCap = "square";
    ctx.lineJoin = "round";

    let pts = busOpts.truncPts;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }

    for (let b of busOpts.branches) {
        ctx.moveTo(b[0].x, b[0].y);
        for (let i = 0; i < b.length; i++) {
            ctx.lineTo(b[i].x, b[i].y);
        }
    }

    ctx.stroke();
}
