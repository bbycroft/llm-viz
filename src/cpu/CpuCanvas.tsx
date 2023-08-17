import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, projectOntoVector, segmentNearestPoint, Vec3 } from "../utils/vector";
import { ISystem, regNames } from "./CpuMain";
import s from "./CpuCanvas.module.scss";
import { AffineMat2d } from "../utils/AffineMat2d";
import { useCombinedMouseTouchDrag } from "../utils/pointer";
import { assignImm, assignImmFull, clamp, isNil } from "../utils/data";
import { editLayout } from "./Editor";
import { applyWires, checkWires, copyWireGraph, dragSegment, EPSILON, fixWire, iterWireGraphSegments, moveWiresWithComp, wireToGraph } from "./Wire";
import { RefType, IElRef, ISegment, IComp, IBus, BusType, CompType, CompNodeType, ICompNode, ICanvasState, IEditorState, IHitTest, ICpuLayoutBase, IWireGraph, IWireGraphNode } from "./CpuModel";
import { useLocalStorageState } from "../utils/localstorage";
import { createExecutionModel } from "./CpuExecution";

interface ICpuState {
    system: ISystem;
}

interface ILSGraphWire {
    id: string;
    nodes: ILSGraphWireNode[];
}

interface ILSGraphWireNode {
    id: number;
    x: number;
    y: number;
    edges: number[];
    ref?: IElRef;
}

interface ILSState {
    wires: ILSGraphWire[];
}

function hydrateFromLS(ls: Partial<ILSState> | undefined): ILSState {
    return {
        wires: ls?.wires ?? [],
    };
}

function wiresFromLsState(layoutBase: ICpuLayoutBase, ls: ILSState): ICpuLayoutBase {

    let newWires: IWireGraph[] = ls.wires.map(w => ({
        id: w.id,
        nodes: w.nodes.map(n => ({
            id: n.id,
            pos: new Vec3(n.x, n.y),
            edges: n.edges,
            ref: n.ref,
        })),
    }));

    let maxId = 0;
    for (let w of newWires) {
        maxId = Math.max(maxId, parseInt(w.id));
    }

    return assignImm(layoutBase, {
        nextWireId: maxId + 1,
        wires: newWires,
    });
}

function wiresToLsState(wires: IWireGraph[]): ILSState {
    return {
        wires: wires
            .filter(w => w.nodes.length > 0)
            .map(w => ({
                id: w.id,
                nodes: w.nodes.map(n => ({ id: n.id, x: n.pos.x, y: n.pos.y, edges: n.edges, ref: n.ref })),
            })),
    };
}

export const CpuCanvas: React.FC<{
    cpuState: ICpuState;
}> = ({ cpuState }) => {
    let [cvsState, setCvsState] = useState<ICanvasState | null>(null);
    let [lsState, setLsState] = useLocalStorageState("cpu-layout", hydrateFromLS);
    let [editorState, setEditorState] = useState<IEditorState>(() => ({
        layout: wiresFromLsState(constructCpuLayout(), lsState),
        layoutTemp: null,
        mtx: AffineMat2d.multiply(AffineMat2d.scale1(10), AffineMat2d.translateVec(new Vec3(1920/2, 1080/2).round())),
        redoStack: [],
        undoStack: [],
        hovered: null,
        addLine: false,
    }));
    let [, redraw] = useReducer((x) => x + 1, 0);

    useResizeChangeHandler(cvsState?.canvas, redraw);

    let exeModel = useMemo(() => {
        return createExecutionModel(editorState.layout);
    }, [editorState.layout]);

    let setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {

        if (el) {
            let ctx = el.getContext("2d")!;
            setCvsState({ canvas: el, ctx, size: new Vec3(1, 1), scale: 1 });
        } else {
            setCvsState(null);
        }
    }, []);

    useEffect(() => {
        let newState = wiresToLsState(editorState.layout.wires);
        setLsState(a => assignImm(a, newState));
    }, [editorState.layout.wires, setLsState]);

    let compNodePoints = useMemo(() => {
        let points: Vec3[] = [];
        for (let comp of editorState.layout.comps) {
            for (let node of comp.nodes) {
                let nodePos = node.pos.add(comp.pos);
                points.push(nodePos);
            }
        }

        return points;
    }, [editorState.layout]);

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
        } else {
            let hoveredRef = ds.data.hovered.ref;
            if (hoveredRef.type === RefType.Comp) {
                handleComponentDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev));
            } else if (hoveredRef.type === RefType.CompNode) {
                handleWireCreateDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev));
            } else if (hoveredRef.type === RefType.Wire) {
                if (!isNil(hoveredRef.wireNode0Id) && !isNil(hoveredRef.wireNode1Id)) {
                    handleWireDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev));
                } else {
                    handleWireExtendDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev));
                }
            }
        }
        redraw();

        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleComponentDrag(end: boolean, ref: IElRef, origModelPos: Vec3, newModelPos: Vec3) {

        setEditorState(editLayout(end, layout => {
            let editCompIdx = layout.comps.findIndex(c => c.id === ref.id)!;
            let editComp = layout.comps[editCompIdx];
            let deltaPos = newModelPos.sub(origModelPos);
            let newPos = snapToGrid(editComp.pos.add(deltaPos));
            let actualDelta = newPos.sub(editComp.pos);

            return assignImm(layout, {
                comps: layout.comps.map(c => c.id === ref.id ? assignImm(c, { pos: newPos }) : c),
                wires: moveWiresWithComp(layout, editCompIdx, actualDelta),
            });
        }));
    }

    function handleWireCreateDrag(end: boolean, ref: IElRef, origModelPos: Vec3, newModelPos: Vec3) {
        setEditorState(editLayout(end, layout => {

            let startComp = layout.comps.find(c => c.id === ref.id)!;
            let startNode = startComp.nodes.find(n => n.id === ref.compNodeId)!;
            let startPt = startComp.pos.add(startNode.pos);
            let endPt = snapToGrid(newModelPos);

            let isHorizStart = startNode.pos.x === 0 || startNode.pos.x === startComp.size.x;

            // split into horizontal and vertical segments
            // maybe drop some of the if's, and have a cleanup phase
            let segments: ISegment[] = [];
            if (isHorizStart) {
                segments.push({ p0: startPt, p1: new Vec3(endPt.x, startPt.y), comp0Ref: ref });
                segments.push({ p0: new Vec3(endPt.x, startPt.y), p1: endPt });
            } else {
                segments.push({ p0: startPt, p1: new Vec3(startPt.x, endPt.y), comp0Ref: ref });
                segments.push({ p0: new Vec3(startPt.x, endPt.y), p1: endPt });
            }

            let newWire: IWireGraph = fixWire(wireToGraph({
                id: '' + layout.nextWireId,
                segments: segments,
            }));

            let newWires = [...layout.wires, newWire];
            let newLayout = applyWires(assignImm(layout, { nextWireId: layout.nextWireId + 1, wires: newWires }), newWires, newWires.length - 1);

            return newLayout;
        }));
    }

    let grabDirRef = useRef<Vec3 | null>(null);

        /* We are dragging from the end of a segment. For now, assume it's a bare end.

        Behaviours, assuming a horiz segment:
            - dragging into the segment shortens it
            - dragging out from the segment lengthens it
            - we have a region around the segment end, and the direction through which we drag
                defines the direction of the new segment (initially)
            - then, we allow a dogleg, with that initial dir
            - the initial dir can be reset by dragging back into the region & then out again
            - what about if we dogleg while shortening? if we start with a horiz initial dir, then
                do a shorten + single extend in opposite direction, i.e. keep the elbow, rather than create a T junction
        */
    function handleWireExtendDrag(end: boolean, ref: IElRef, origModelPos: Vec3, newModelPos: Vec3) {
        setEditorState(editLayout(end, function handleWireExtendDrag(layout) {
            let wireIdx = editorState.layout.wires.findIndex(w => w.id === ref.id)!;
            let wire = copyWireGraph(editorState.layout.wires[wireIdx]);
            let delta = newModelPos.sub(origModelPos);
            let node = wire.nodes[ref.wireNode0Id!];

            let startPos = node.pos;
            // let otherPos = ref.wireSegEnd === 0 ? seg.p1 : seg.p0;
            // let isHoriz = seg.p0.y === seg.p1.y;

            // @TODO: many things to fix here!
            // let inwardDir = new Vec3(0, 1); // otherPos.sub(startPos).normalize();
            let isHoriz = false;

            let screenPos = modelToScreen(startPos);
            let mouseScreenPos = modelToScreen(newModelPos);
            let mouseDir = mouseScreenPos.sub(screenPos).abs();
            let grabDirPx = 20;
            if (!grabDirRef.current && mouseDir.len() > grabDirPx) {
                // want to make one of the 4 cardinal directions
                grabDirRef.current = mouseDir.normalize().round(); //  mouseDir.x > mouseDir.y ? new Vec3(1, 0) : new Vec3(0, 1);
            } else if (mouseDir.len() < grabDirPx) {
                grabDirRef.current = null;
            }

            let grabDir = grabDirRef.current ?? (isHoriz ? new Vec3(1, 0) : new Vec3(0, 1));

            if (end) {
                grabDirRef.current = null;
            }

            let endPos = snapToGrid(startPos.add(delta));

            let moveDelta = endPos.sub(startPos);

            let isReversing = false;
            for (let node1Idx of node.edges) {
                let node1 = wire.nodes[node1Idx];
                let dir = node1.pos.sub(startPos).normalize();

                if (dir.dot(grabDir) > 1.0 - EPSILON) {
                    let newNode0Id = wire.nodes.length;
                    let newNode1Id = wire.nodes.length + 1;
                    // re-wire node 1 to point to new node
                    let midPos = startPos.add(projectOntoVector(moveDelta, grabDir));
                    node1.edges.push(newNode0Id);
                    node1.edges = node1.edges.filter(e => e !== node.id);
                    wire.nodes.push({ id: newNode0Id, pos: midPos, edges: [node1Idx] });
                    wire.nodes.push({ id: newNode1Id, pos: endPos, edges: [newNode0Id] });
                    isReversing = true;
                    break;
                }
            }

            if (!isReversing) {
                let newNode0Id = wire.nodes.length;
                let newNode1Id = wire.nodes.length + 1;
                let midPos = startPos.add(projectOntoVector(moveDelta, grabDir));
                node.edges.push(newNode0Id);
                wire.nodes.push({ id: newNode0Id, pos: midPos, edges: [node.id, newNode1Id] });
                wire.nodes.push({ id: newNode1Id, pos: endPos, edges: [newNode0Id] });
            }

            // how are we manipulating our graph?
            // guess we need to insert/remove nodes & their edges?

            let wires = [...layout.wires];
            wires[wireIdx] = wire;

            checkWires(wires, 'handleWireExtendDrag');

            return applyWires(layout, wires, wireIdx);
        }));

    }

    function handleWireDrag(end: boolean, ref: IElRef, origModelPos: Vec3, newModelPos: Vec3) {

        setEditorState(editLayout(end, layout => {
            let wireIdx = editorState.layout.wires.findIndex(w => w.id === ref.id)!;
            let wire = editorState.layout.wires[wireIdx];
            let delta = newModelPos.sub(origModelPos);
            let node0 = wire.nodes[ref.wireNode0Id!];
            let node1 = wire.nodes[ref.wireNode1Id!];

            // don't allow dragging of segments connected to components (since they're pinned)
            // probably want to support dragging by introducing a perp-segment though
            if (node0.ref || node1.ref) {
                return layout;
            }

            let isHoriz = node0.pos.y === node1.pos.y;
            if (isHoriz) {
                delta = new Vec3(0, delta.y);
            } else {
                delta = new Vec3(delta.x, 0);
            }

            let newWire = dragSegment(wire, ref.wireNode0Id!, ref.wireNode1Id!, delta);

            let wires = [...layout.wires];
            wires[wireIdx] = newWire;
            return applyWires(layout, wires, wireIdx);
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
        return editorState.mtx.mulVec3(pt);
    }

    function screenToModel(pt: Vec3) {
        return editorState.mtx.mulVec3Inv(pt);
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

    function getRefUnderCursor(editorState: IEditorState, ev: React.MouseEvent): IHitTest | null {
        let mousePt = evToModel(ev);
        let mousePtScreen = evToScreen(ev);

        let comps = editorState.layout.comps;

        for (let i = comps.length - 1; i >= 0; i--) {
            let comp = comps[i];
            for (let node of comp.nodes) {
                let modelPos = comp.pos.add(node.pos);
                let nodeScreenPos = modelToScreen(modelPos);
                let modelDist = modelPos.dist(mousePt);
                let screenDist = nodeScreenPos.dist(mousePtScreen);
                if (screenDist < 10 || modelDist < 0.2) {
                    return {
                        ref: { type: RefType.CompNode, id: comp.id, compNodeId: node.id },
                        distPx: screenDist,
                        modelPt: modelPos,
                    };
                }
            }
        }

        for (let i = comps.length - 1; i >= 0; i--) {
            let comp = comps[i];
            let bb = new BoundingBox3d(comp.pos, comp.pos.add(comp.size));
            if (bb.contains(mousePt)) {
                return {
                    ref: { type: RefType.Comp, id: comp.id },
                    distPx: 0,
                    modelPt: mousePt,
                };
            }
        }

        let wires = editorState.layout.wires;
        for (let i = wires.length - 1; i >= 0; i--) {
            let wire = wires[i];
            for (let node of wire.nodes) {
                let pScreen = modelToScreen(node.pos);
                let screenDist = pScreen.dist(mousePtScreen);
                if (screenDist < 10) {
                    return {
                        ref: { type: RefType.Wire, id: wire.id, wireNode0Id: node.id },
                        distPx: screenDist,
                        modelPt: screenToModel(pScreen),
                    };
                }
            }

            for (let node0 of wire.nodes) {
                let p0Screen = modelToScreen(node0.pos);

                for (let node1Idx of node0.edges) {
                    if (node1Idx <= node0.id) {
                        continue;
                    }
                    let node1 = wire.nodes[node1Idx];

                    let p1Screen = modelToScreen(node1.pos);
                    let isectPt = segmentNearestPoint(p0Screen, p1Screen, mousePtScreen);
                    let screenDist = isectPt.dist(mousePtScreen);
                    if (screenDist < 10) {
                        return  {
                            ref: { type: RefType.Wire, id: wire.id, wireNode0Id: node0.id, wireNode1Id: node1.id },
                            distPx: screenDist,
                            modelPt: screenToModel(isectPt),
                        };
                    }
                }
            }
        }

        return null;
    }

    function handleMouseMove(ev: React.MouseEvent) {
        let isect = getRefUnderCursor(editorState, ev);

        setEditorState(a => assignImm(a, { hovered: assignImmFull(a.hovered, isect) }));
    }

    function handleMouseDown(ev: React.MouseEvent) {
        if (!editorState) {
            return;
        }

        setDragStart(ev);
    }

    let cursor: string | undefined;
    if (dragStart && dragStart.data.hovered?.ref.type === RefType.Comp) {
        cursor = 'grabbing';

    } else if (editorState.hovered) {
        let hoveredRef = editorState.hovered.ref;
        if (hoveredRef.type === RefType.CompNode) {
            cursor = 'crosshair';
        } else if (hoveredRef.type === RefType.Wire) {
            let wire = editorState.layout.wires.find(w => w.id === hoveredRef.id);
            if (wire) {
                let node0 = wire.nodes[hoveredRef.wireNode0Id!];
                let node1 = wire.nodes[hoveredRef.wireNode1Id!];
                if (node0 && node1) {
                    let isHoriz = node0.pos.y === node1.pos.y;
                    cursor = isHoriz ? 'ns-resize' : 'ew-resize';
                } else if (node0) {
                    cursor = 'crosshair';
                }
            }
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

function renderCpuToCanvas(cvs: ICanvasState, editorState: IEditorState, cpu: ICpuState) {
    let ctx = cvs.ctx;

    ctx.save();
    renderCpu(cvs, editorState, editorState.layoutTemp ?? editorState.layout, cpu);
    ctx.restore();
}

type ICpuLayout = ReturnType<typeof constructCpuLayout>;

enum StackPos {
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
        nodes: [],
    };

    let rom: IComp = {
        id: 'rom',
        name: "ROM",
        pos: new Vec3(),
        size: new Vec3(10, 10),
        type: CompType.ROM,
        nodes: [],
    };

    let insDecode: IComp = {
        id: 'id',
        name: "Instruction Decode",
        pos: new Vec3(10, busPad),
        size: new Vec3(10, 3),
        type: CompType.ID,
        nodes: [
            { id: 'rhsImm', name: 'RHS Imm', pos: new Vec3(10, 2), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
        ],
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
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 3), type: CompNodeType.Input, width: 6 },
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
        nodes: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(3, 0), type: CompNodeType.Input, width: 1 },
            { id: 'in', name: 'In', pos: new Vec3(0, 1), type: CompNodeType.Input, width: 32 },
            { id: 'out', name: 'Out', pos: new Vec3(10, 1), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
        ],
    };

    let reg: IComp = {
        id: 'reg',
        name: "Registers",
        pos: new Vec3(),
        size: new Vec3(10, 24),
        type: CompType.REG,
        nodes: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(5, 0), type: CompNodeType.Input, width: 3 * 6 },
            { id: 'in', name: 'In', pos: new Vec3(0, 3), type: CompNodeType.Input, width: 32 },
            { id: 'outA', name: 'Out A', pos: new Vec3(10, 3), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
            { id: 'outB', name: 'Out B', pos: new Vec3(10, 5), type: CompNodeType.Output | CompNodeType.Tristate, width: 32 },
        ],
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

    // buses.push(mainBus, rhsLine, lhsLine);
    comps.push(ram, rom, insDecode, loadStore, alu, pc, reg);

    return {
        nextWireId: 0,
        comps,
        buses,
        wires: [] as IWireGraph[],
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

function renderCpu(cvs: ICanvasState, editorState: IEditorState, cpuOpts: ICpuLayoutBase, cpuState: ICpuState) {
    let ctx = cvs.ctx;

    // for (let bus of cpuOpts.buses) {
    //     renderBus(cvs, bus);
    // }

    for (let wire of cpuOpts.wires) {
        renderWire(cvs, editorState, wire);
    }

    // if (editorState.hovered?.modelPt) {
    //     let pt = editorState.hovered.modelPt;
    //     ctx.beginPath();
    //     ctx.arc(pt.x, pt.y, 1, 0, 2 * Math.PI);
    //     ctx.strokeStyle = "#f00";
    //     ctx.stroke();
    // }

    for (let comp of cpuOpts.comps) {

        let isHover = editorState.hovered?.ref.type === RefType.Comp && editorState.hovered.ref.id === comp.id;

        ctx.beginPath();
        ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);

        ctx.fillStyle = "#aaa";
        ctx.strokeStyle = isHover ? "#a00" : "#000";
        ctx.lineWidth = 1 * cvs.scale;
        ctx.fill();
        ctx.stroke();

        for (let node of comp.nodes) {
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
    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.CompNode && hoverRef.id === comp.id && hoverRef.compNodeId === node.id;
    let type = node.type ?? 0;
    let isInput = (type & CompNodeType.Input) !== 0;
    let isTristate = (type & CompNodeType.Tristate) !== 0;
    let ctx = cvs.ctx;
    let x = comp.pos.x + node.pos.x;
    let y = comp.pos.y + node.pos.y;
    let r = 2 / 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = isHover ? "#f00" : "#000";
    ctx.fillStyle = isInput ? "#fff" : isTristate ? "#a3f" : "#00f";
    ctx.fill();
    ctx.stroke();

    if (node.name) {
        let isTop = node.pos.y === 0;
        let isBot = node.pos.y === comp.size.y;
        let isLeft = node.pos.x === 0;
        let isRight = node.pos.x === comp.size.x;

        let text = node.name;
        let textHeight = 1.8;
        ctx.font = `${textHeight / 4}px Arial`;
        ctx.textAlign = (isTop || isBot) ? 'center' : isLeft ? 'start' : 'end';
        ctx.textBaseline = (isLeft || isRight) ? "middle" : isTop ? 'top' : 'bottom';
        ctx.fillStyle = "#000";
        let deltaAmt = 0.3;
        let deltaX = isLeft ? deltaAmt : isRight ? -deltaAmt : 0;
        let deltaY = isTop ? deltaAmt : isBot ? -deltaAmt : 0;
        ctx.fillText(text, x + deltaX, y + deltaY);
    }
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

function renderBus(cvs: ICanvasState, busOpts: IBus) {
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

function renderWire(cvs: ICanvasState, editorState: IEditorState, wire: IWireGraph) {
    let ctx = cvs.ctx;

    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.Wire && hoverRef.id === wire.id;

    ctx.lineCap = "square";
    ctx.lineJoin = "round";

    function isSegHover(node0: IWireGraphNode, node1: IWireGraphNode) {
        return isHover && hoverRef?.wireNode0Id === node0.id && hoverRef?.wireNode1Id === node1.id;
    }

    if (isHover) {
        ctx.save();
        iterWireGraphSegments(wire, (node0, node1) => {
            ctx.beginPath();
            if (isSegHover(node0, node1)) {
                ctx.strokeStyle = '#55f';
            } else {
                ctx.strokeStyle = '#000';
            }
            ctx.lineWidth = 3 * cvs.scale;
            ctx.filter = 'blur(4px)';
            ctx.moveTo(node0.pos.x, node0.pos.y);
            ctx.lineTo(node1.pos.x, node1.pos.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    iterWireGraphSegments(wire, (node0, node1) => {
        ctx.beginPath();
        // if (isSegHover(node0, node1)) {
        //     ctx.strokeStyle = '#f00';
        // } else if (isHover) {
        //     ctx.strokeStyle = '#aaa';
        // } else {
            ctx.strokeStyle = '#333';
            if (isHover) {
                // ctx.strokeStyle = '#aaa';
            }
        // }
        ctx.lineWidth = 4 * cvs.scale;
        ctx.moveTo(node0.pos.x, node0.pos.y);
        ctx.lineTo(node1.pos.x, node1.pos.y);
        ctx.stroke();
    });

    function drawEndCircle(p: Vec3, isHover: boolean) {
        if (!isHover) {
            return;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * cvs.scale, 0, 2 * Math.PI);
        // ctx.fillStyle = isHover ? '#f00' : '#000';
        ctx.strokeStyle = isHover ? '#f00' : '#000';
        ctx.lineWidth = 2 * cvs.scale;
        ctx.stroke();
    }

    for (let node of wire.nodes) {
        // find nodes at a T junction or a X junction
        // and draw a circle at the junction
        let dirsUsed = new Set<string>();

        for (let edgeId of node.edges) {
            let node2 = wire.nodes[edgeId];
            let edgeDir = node2.pos.sub(node.pos).normalize();
            let dir = `${edgeDir.x.toFixed(2)},${edgeDir.y.toFixed(2)}`;
            dirsUsed.add(dir);
        }

        let isJunction = dirsUsed.size > 2;
        if (isJunction) {
            let x = node.pos.x;
            let y = node.pos.y;
            let r = 6 * cvs.scale;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = "#000";
            ctx.fill();
        }
    }

    for (let node of wire.nodes) {
        drawEndCircle(node.pos, isHover && isNil(hoverRef?.wireNode1Id) && hoverRef?.wireNode0Id === node.id);
    }

}
