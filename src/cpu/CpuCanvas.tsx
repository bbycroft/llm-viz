import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, projectOntoVector, segmentNearestPoint, Vec3 } from "../utils/vector";
import s from "./CpuCanvas.module.scss";
import { AffineMat2d } from "../utils/AffineMat2d";
import { IDragStart, useCombinedMouseTouchDrag } from "../utils/pointer";
import { assignImm, assignImmFull, clamp, getOrAddToMap, hasFlag, isNil, useFunctionRef } from "../utils/data";
import { editLayout, EditorContext, IEditorContext } from "./Editor";
import { applyWires, checkWires, copyWireGraph, dragSegment, EPSILON, fixWire, iterWireGraphSegments, moveWiresWithComp, wireToGraph } from "./Wire";
import { RefType, IElRef, ISegment, IComp, PortDir, ICompPort, ICanvasState, IEditorState, IHitTest, ICpuLayout, IWireGraph, IWireGraphNode, IExeSystem, IExeNet, ICompRenderArgs, IExePort, IExePortRef } from "./CpuModel";
import { useLocalStorageState } from "../utils/localstorage";
import { createExecutionModel, stepExecutionCombinatorial } from "./CpuExecution";
import { CpuEditorToolbar } from "./EditorControls";
import { exportData, hydrateFromLS, importData, wiresFromLsState, wiresToLsState } from "./ImportExport";
import { buildCompLibrary } from "./comps/CompLibrary";
import { ICompDataRegFile, ICompDataSingleReg, riscvRegNames } from "./comps/Registers";
import { CompLibraryView } from "./CompLibraryView";
import { CompExampleView } from "./CompExampleView";
import { HoverDisplay } from "./HoverDisplay";
import { ensureSigned32Bit, ensureUnsigned32Bit } from "./comps/RiscvInsDecode";
import { KeyboardOrder, useGlobalKeyboard } from "../utils/keyboard";

interface ICpuState {
    system: any;
}

export interface ICpu {
    pc: number;
    x: Int32Array; // 32 registers, x0-x31, x0 is always 0 (even after writes!)
    halt: boolean;
    haltReason: string | null;
    csr: Int32Array; // 4096 registers, csr0-csr4095
}

export interface Io_Gpio {
    portDir: number;
    portValue: number;
}

export enum Io_Gpio_Register {
    PORT_DIR = 0,
    PORT_VALUE = 1,
    PORT_OUT_SET = 2,
    PORT_OUT_CLEAR = 3,
}

export interface IMemoryLayout {
    romOffset: number;
    ramOffset: number;
    ioOffset: number;

    romSize: number;
    ramSize: number;
    ioSize: number;
}

interface ICanvasDragState {
    mtx: AffineMat2d;
    hovered: IHitTest | null;
    modelPos: Vec3;
}

export function constructCpuLayout(): ICpuLayout {
    return {
        selected: [],

        nextWireId: 0,
        nextCompId: 0,
        wires: [],
        comps: [],
    };
}

export const CpuCanvas: React.FC<{
    cpuState: ICpuState;
}> = ({ cpuState }) => {
    let [cvsState, setCvsState] = useState<ICanvasState | null>(null);
    let [lsState, setLsState] = useLocalStorageState("cpu-layout", hydrateFromLS);
    let [editorState, setEditorState] = useState<IEditorState>(() => {

        let compLibrary = buildCompLibrary();

        return {
            layout: wiresFromLsState(constructCpuLayout(), lsState, compLibrary),
            layoutTemp: null,
            mtx: AffineMat2d.multiply(AffineMat2d.scale1(10), AffineMat2d.translateVec(new Vec3(1920/2, 1080/2).round())),
            compLibrary: compLibrary,
            redoStack: [],
            undoStack: [],
            hovered: null,
            addLine: false,
        };
    });
    let [ctrlDown, setCtrlDown] = useState(false);
    let [, redraw] = useReducer((x) => x + 1, 0);

    useEffect(() => {
        setCtrlDown(false);
        setEditorState(a => assignImm(a, {
            compLibrary: buildCompLibrary(),
        }))
    }, []);

    useResizeChangeHandler(cvsState?.canvas, redraw);

    let prevExeModel = useRef<IExeSystem | null>(null);

    let exeModel = useMemo(() => {
        let model = createExecutionModel(editorState.compLibrary, editorState.layout, prevExeModel.current);

        stepExecutionCombinatorial(model);

        return model;
    }, [editorState.layout, editorState.compLibrary]);

    prevExeModel.current = exeModel;

    let handleWheelFuncRef = useFunctionRef(handleWheel);

    let setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {

        if (el) {
            let ctx = el.getContext("2d")!;
            setCvsState({ canvas: el, ctx, size: new Vec3(1, 1), scale: 1, tileCanvases: new Map(), showTransparentComps: false });

            function wheelHandler(ev: WheelEvent) {
                handleWheelFuncRef.current(ev);
            }
            el.addEventListener("wheel", wheelHandler, { passive: false });
            return () => {
                el.removeEventListener("wheel", wheelHandler);
            };
        } else {
            setCvsState(null);
        }
    }, [handleWheelFuncRef]);

    useEffect(() => {
        let newState = wiresToLsState(editorState.layout);
        setLsState(a => assignImm(a, newState));
        let strExport = exportData(editorState.layout);
        localStorage.setItem("cpu-layout-str", strExport);
        importData(strExport);
    }, [editorState.layout, setLsState]);

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
        cvsState.showTransparentComps = showTransparentComponents;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.transform(...editorState.mtx.toTransformParams());
        ctx.save();
        renderCpu(cvsState, editorState, editorState.layoutTemp ?? editorState.layout, exeModel);
        renderDragState(cvsState, editorState, dragStart, grabDirRef.current);
        ctx.restore();

        ctx.restore();
    });

    useGlobalKeyboard(KeyboardOrder.MainPage, ev => {
        if (ev.key === "Control") {
            setCtrlDown(ev.type === "keydown");
        }
        if (ev.key === "Delete") {
            setEditorState(editLayout(true, layout => {

                function matchesRef(ref: IElRef, id: string, type: RefType) {
                    return ref.id === id && ref.type === type;
                }

                let newLayout = assignImm(layout, {
                    comps: layout.comps.filter(c => !layout.selected.some(s => matchesRef(s, c.id, RefType.Comp))),
                    wires: layout.wires.filter(w => !layout.selected.some(s => matchesRef(s, w.id, RefType.Wire))),
                    selected: [],
                });
                return newLayout;
            }));
        }
    });

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(cvsState?.canvas ?? null, ev => {
        return {
            mtx: editorState!.mtx,
            hovered: ev.button === 0 ? editorState!.hovered : null,
            modelPos: evToModel(ev),
            ctrlDown: ctrlDown,
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
    }, function handleClick(ev, ds) {

        if (ds.data.hovered) {
            let hoveredRef = ds.data.hovered.ref;
            setEditorState(a => assignImm(a, {
                layout: assignImm(a.layout, {
                    selected: [hoveredRef],
                }),
            }));
        }

        ev.stopPropagation();
        ev.preventDefault();
    });

    let showTransparentComponents = dragStart?.data.ctrlDown || ctrlDown;

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
            let startNode = startComp.ports.find(n => n.id === ref.compNodeId)!;
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
            checkWires(editorState.layout.wires, 'handleWireExtendDrag (pre edit)');
            let wireIdx = editorState.layout.wires.findIndex(w => w.id === ref.id)!;
            let wire = copyWireGraph(editorState.layout.wires[wireIdx]);
            let delta = newModelPos.sub(origModelPos);
            let node = wire.nodes[ref.wireNode0Id!];
            let startPos = node.pos;

            let screenPos = modelToScreen(startPos);
            let mouseScreenPos = modelToScreen(newModelPos);
            let mouseDir = mouseScreenPos.sub(screenPos);
            let mouseDirSnapped = mouseDir.normalize().round();
            if (mouseDirSnapped.x !== 0 && mouseDirSnapped.y !== 0) {
                mouseDirSnapped.y = 0;
            }
            let grabDirPx = 20;
            if (!grabDirRef.current && mouseDir.len() > grabDirPx) {
                // want to make one of the 4 cardinal directions
                grabDirRef.current = mouseDirSnapped;
            } else if (mouseDir.len() < grabDirPx) {
                grabDirRef.current = null;
            }

            let grabDir = grabDirRef.current ?? mouseDirSnapped;

            if (end) {
                grabDirRef.current = null;
            }

            let endPos = snapToGrid(startPos.add(delta));

            let moveDelta = endPos.sub(startPos);

            let isReversing = false;
            let allDirs: Vec3[] = [];
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
                    node.edges = node.edges.filter(e => e !== node1.id);
                    wire.nodes.push({ id: newNode0Id, pos: midPos, edges: [node1Idx, newNode1Id] });
                    wire.nodes.push({ id: newNode1Id, pos: endPos, edges: [newNode0Id] });
                    isReversing = true;
                    break;
                }
                allDirs.push(dir);
            }

            if (!isReversing) {
                if (node.edges.length === 1 && grabDir.dot(wire.nodes[node.edges[0]].pos.sub(startPos)) < -1.0 + EPSILON) {
                    // we're extending a bare end
                    let newNode0Id = wire.nodes.length;
                    let midPos = startPos.add(projectOntoVector(moveDelta, grabDir));
                    node.pos = midPos;
                    node.edges.push(newNode0Id);
                    wire.nodes.push({ id: newNode0Id, pos: endPos, edges: [node.id] });
                } else {
                    let newNode0Id = wire.nodes.length;
                    let newNode1Id = wire.nodes.length + 1;
                    let midPos = startPos.add(projectOntoVector(moveDelta, grabDir));
                    node.edges.push(newNode0Id);
                    wire.nodes.push({ id: newNode0Id, pos: midPos, edges: [node.id, newNode1Id] });
                    wire.nodes.push({ id: newNode1Id, pos: endPos, edges: [newNode0Id] });
                }
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

    function handleWheel(ev: WheelEvent) {
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
        ev.preventDefault();
    }

    function getRefUnderCursor(editorState: IEditorState, ev: React.MouseEvent): IHitTest | null {
        let mousePt = evToModel(ev);
        let mousePtScreen = evToScreen(ev);

        let comps = editorState.layout.comps;

        for (let i = comps.length - 1; i >= 0; i--) {
            let comp = comps[i];
            for (let node of comp.ports) {
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

        if (!showTransparentComponents) {
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

        if (editorState.dragCreateComp) {
            let compOrig = editorState.dragCreateComp.compOrig;
            let mousePos = snapToGrid(evToModel(ev));

            let applyFunc = (a: ICpuLayout): ICpuLayout => {
                let newComp = assignImm(compOrig, {
                    id: '' + a.nextCompId,
                    pos: mousePos,
                });
                return assignImm(a, {
                    nextCompId: a.nextCompId + 1,
                    comps: [...a.comps, newComp],
                });
            };

            setEditorState(a => assignImm(a, {
                dragCreateComp: assignImm(a.dragCreateComp, { applyFunc }),
            }));

            return;
        }

        let isect = getRefUnderCursor(editorState, ev);

        setEditorState(a => assignImm(a, { hovered: assignImmFull(a.hovered, isect) }));
    }

    function handleMouseEnter(ev: React.MouseEvent) {
    }

    function handleMouseLeave(ev: React.MouseEvent) {
        setEditorState(a => assignImm(a, {
            hovered: null,
            dragCreateComp: a.dragCreateComp ? assignImm(a.dragCreateComp, {
                applyFunc: undefined
            }) : undefined,
        }));
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

    let ctx: IEditorContext = useMemo(() => {
        return { editorState, setEditorState, cvsState, exeModel };
    }, [editorState, setEditorState, cvsState, exeModel]);

    return <EditorContext.Provider value={ctx}>
        <div className={s.canvasWrap}>
            <canvas className={s.canvas} ref={setCanvasEl}
                style={{ cursor: cursor }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />
            <div className={s.toolsLeftTop}>
                <CpuEditorToolbar />
                <CompLibraryView />
                <CompExampleView />
                <HoverDisplay canvasEl={cvsState?.canvas ?? null} />
            </div>
        </div>
    </EditorContext.Provider>;
};

function renderCpu(cvs: ICanvasState, editorState: IEditorState, cpuOpts: ICpuLayout, exeSystem: IExeSystem) {
    let ctx = cvs.ctx;

    let tl = editorState.mtx.mulVec3Inv(new Vec3(0, 0));
    let br = editorState.mtx.mulVec3Inv(cvs.size);

    // draw grid

    // we create a tile canvas for the 1-cell grid. We'll draw it such that ??
    let gridCvs = getOrAddToMap(cvs.tileCanvases, 'grid1', () => document.createElement('canvas')!);
    let gridSize = 64;
    gridCvs.width = gridSize;
    gridCvs.height = gridSize;
    let gridCtx = gridCvs.getContext('2d')!;
    gridCtx.save();
    gridCtx.clearRect(0, 0, gridCvs.width, gridCvs.height);
    gridCtx.beginPath();
    let r = 2.0;
    gridCtx.moveTo(gridSize/2, gridSize/2);
    gridCtx.arc(gridSize/2, gridSize/2, r, 0, 2 * Math.PI);
    gridCtx.fillStyle = "#aaa";
    gridCtx.fill();
    gridCtx.restore();

    let gridPattern = ctx.createPattern(gridCvs, 'repeat')!;
    function drawGridAtScale(scale: number) {
        ctx.save();
        ctx.fillStyle = gridPattern;
        let scaleFactor = 1 / gridSize * scale;
        ctx.translate(0.5, 0.5);
        ctx.scale(scaleFactor, scaleFactor);
        let tl2 = tl.sub(new Vec3(0.5, 0.5)).mul(1 / scaleFactor);
        let br2 = br.sub(new Vec3(0.5, 0.5)).mul(1 / scaleFactor);
        ctx.fillRect(tl2.x, tl2.y, br2.x - tl2.x, br2.y - tl2.y);
        ctx.restore();
    }
    drawGridAtScale(1);
    // drawGridAtScale(10);

    /*
    ctx.save();
    let pxPerCell = editorState.mtx.mulVec3(new Vec3(1, 0)).dist(editorState.mtx.mulVec3(new Vec3(0, 0)));
    // scale by 10 each time; 1, 10, 100, 1000, ..., with min 10px per cell
    let gridStep = 1;
    while (pxPerCell * gridStep < 10) {
        gridStep *= 10;
    }

    let gridStepRatio = gridStep * pxPerCell / 10;

    ctx.beginPath();
    for (let xPos = Math.floor(tl.x / gridStep) * gridStep; xPos <= br.x; xPos += gridStep) {
        for (let yPos = Math.floor(tl.y / gridStep) * gridStep; yPos <= br.y; yPos += gridStep) {
            let isBold = xPos % (gridStep * 10) === 0 && yPos % (gridStep * 10) === 0;
            let smallSize = Math.min(1, gridStepRatio / 2);
            ctx.moveTo(xPos, yPos);
            ctx.arc(xPos, yPos, (isBold ? 2 : smallSize) * cvs.scale, 0, 2 * Math.PI);
        }
    }
    ctx.fillStyle = "#aaa";
    ctx.fill();
    ctx.restore();
    */

    for (let wire of cpuOpts.wires) {
        let exeNet = exeSystem.nets[exeSystem.lookup.wireIdToNetIdx.get(wire.id) ?? -1];
        renderWire(cvs, editorState, wire, exeNet, exeSystem);
    }

    ctx.save();
    ctx.globalAlpha = cvs.showTransparentComps ? 0.5 : 1.0;
    for (let comp of cpuOpts.comps) {
        let exeComp = exeSystem.comps[exeSystem.lookup.compIdToIdx.get(comp.id) ?? -1];
        let compDef = editorState.compLibrary.comps.get(comp.defId);

        let isHover = editorState.hovered?.ref.type === RefType.Comp && editorState.hovered.ref.id === comp.id;

        let isValidExe = exeComp?.valid ?? false;
        ctx.fillStyle = isValidExe ? "#8a8" : "#aaa";
        ctx.strokeStyle = isHover ? "#a00" : "#000";
        ctx.lineWidth = 1 * cvs.scale;

        if (compDef?.renderAll !== true) {
            ctx.beginPath();
            ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
            ctx.fill();
            ctx.stroke();
        }

        let compRenderArgs: ICompRenderArgs<any> = {
            comp,
            ctx,
            cvs,
            exeComp,
            styles: {
                fontSize: 1.8,
                lineHeight: 2.0,
                fillColor: isValidExe ? "#8a8" : "#aaa",
                strokeColor: isHover ? "#a00" : "#000",
                lineWidth: 1 * cvs.scale,
            },
        };

        if (comp.defId === 'reg1') {
            renderPc(compRenderArgs);

        } else if (comp.defId === 'reg32Riscv') {
            renderRegisterFile(compRenderArgs);

        } else if (compDef?.render) {
            compDef.render(compRenderArgs);

        } else {
            let text = comp.name;
            let textHeight = 3;
            ctx.font = `${textHeight / 4}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#000";
            ctx.fillText(text, comp.pos.x + (comp.size.x) / 2, comp.pos.y + (comp.size.y) / 2);
        }

        for (let node of comp.ports) {
            renderNode(cvs, editorState, comp, node);
        }
    }
    ctx.restore();
}

function renderDragState(cvs: ICanvasState, editorState: IEditorState, dragStart: IDragStart<ICanvasDragState> | null, dragDir: Vec3 | null) {
    let ctx = cvs.ctx;
    if (!dragStart || !dragStart.data.hovered) {
        return;
    }

    let hover = dragStart.data.hovered;

    if (hover.ref.type === RefType.Wire && !isNil(hover.ref.wireNode0Id) && isNil(hover.ref.wireNode1Id)) {
        let wireNodeId = hover.ref.wireNode0Id;
        let node = editorState.layout.wires.find(w => w.id === hover.ref.id)?.nodes[wireNodeId!];

        if (node) {
            // draw a light grey circle here
            let x = node.pos.x;
            let y = node.pos.y;
            let r = 20 * cvs.scale;
            // ctx.beginPath();
            // ctx.arc(x, y, r, 0, 2 * Math.PI);
            // ctx.lineWidth = 1 * cvs.scale;
            // ctx.strokeStyle = "#aaa";
            // ctx.stroke();

            // draw a cross in the circle (lines at 45deg)
            let r2 = r * Math.SQRT1_2;

            ctx.beginPath();
            ctx.moveTo(x - r2, y - r2);
            ctx.lineTo(x + r2, y + r2);
            ctx.moveTo(x - r2, y + r2);
            ctx.lineTo(x + r2, y - r2);
            ctx.strokeStyle = "#aaa";
            ctx.lineWidth = 1 * cvs.scale;
            ctx.stroke();

            // draw an arc according to the drag direction
            if (dragDir) {
                let arcStart = Math.atan2(dragDir.y, dragDir.x) - Math.PI / 4;
                let arcEnd = arcStart + Math.PI / 2;
                ctx.beginPath();
                ctx.arc(x, y, r, arcStart, arcEnd);
                ctx.strokeStyle = "#aaa";
                ctx.lineWidth = 3 * cvs.scale;
                ctx.stroke();

            }

        }
    }

}

function renderNode(cvs: ICanvasState, editorState: IEditorState, comp: IComp, node: ICompPort) {
    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.CompNode && hoverRef.id === comp.id && hoverRef.compNodeId === node.id;
    let type = node.type ?? 0;
    let isInput = (type & PortDir.In) !== 0;
    let isTristate = (type & PortDir.Tristate) !== 0;
    let ctx = cvs.ctx;
    let x = comp.pos.x + node.pos.x;
    let y = comp.pos.y + node.pos.y;
    let r = 2 / 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = isHover ? "#f00" : "#000";
    ctx.fillStyle = isInput ? "#fff" : isTristate ? "#a3f" : "#00fa";
    ctx.fill();
    ctx.stroke();

    if (node.name) {
        let isTop = node.pos.y === 0;
        let isBot = node.pos.y === comp.size.y;
        let isLeft = node.pos.x === 0;
        let isRight = node.pos.x === comp.size.x;

        let text = node.name;
        let textHeight = 0.7;
        ctx.font = `${textHeight}px Arial`;
        ctx.textAlign = (isTop || isBot) ? 'center' : isLeft ? 'start' : 'end';
        ctx.textBaseline = (isLeft || isRight) ? "middle" : isTop ? 'top' : 'bottom';
        ctx.fillStyle = "#000";
        let deltaAmt = 0.3;
        let deltaX = isLeft ? deltaAmt : isRight ? -deltaAmt : 0;
        let deltaY = isTop ? deltaAmt : isBot ? -deltaAmt : 0;
        ctx.fillText(text, x + deltaX, y + deltaY);
    }
}

function regValToStr(val: number) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = ensureSigned32Bit(val);
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(8, "0");
    let pcValStr = valS32.toString().padStart(2, "0");
    return pcValStr + '  ' + pcHexStr;
}

let innerPadX = 0.4;

// 32bit pc
function renderPc({ ctx, comp, exeComp, styles }: ICompRenderArgs<ICompDataSingleReg>) {
    let padX = 1.2;
    let padY = 0.8;
    let pcValue = exeComp?.data.value ?? 0;

    let boxSize =  new Vec3(comp.size.x - 2 * padX, styles.lineHeight);
    let boxOffset = new Vec3(padX, comp.size.y / 2 - boxSize.y / 2);
    ctx.beginPath();
    ctx.rect(comp.pos.x + boxOffset.x, comp.pos.y + boxOffset.y, boxSize.x, boxSize.y);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#0004";
    ctx.fill();
    ctx.stroke();

    ctx.font = `${styles.fontSize}px monospace`;
    ctx.textAlign = 'end';
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    let xRight = comp.pos.x + boxOffset.x + boxSize.x - innerPadX;
    let yMid = comp.pos.y + boxOffset.y + boxSize.y / 2;
    let currText = regValToStr(pcValue);
    ctx.fillText(currText, xRight, yMid);

    ctx.textAlign = 'start';
    ctx.fillText('pc', comp.pos.x + padX + innerPadX, yMid);

    let xNewRight = xRight - ctx.measureText(currText).width - padX * 3;

    if (exeComp?.data.writeEnabled) {
        ctx.textAlign = 'end';
        let newValStr = regValToStr(exeComp.data.inPort.value);
        ctx.fillStyle = "#44c9";
        ctx.fillText(newValStr, xNewRight, yMid);
    }
}

// x0-x31 32bit registers, each with names
function renderRegisterFile({ ctx, comp, exeComp, styles }: ICompRenderArgs<ICompDataRegFile>) {
    let padX = 1.2;
    let padY = 1.0;
    let lineHeight = styles.lineHeight; // (comp.size.y - padY * 2) / 32;

    ctx.save();
    ctx.beginPath();
    ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
    ctx.clip();

    for (let i = 0; i < 32; i++) {
        let regValue = exeComp?.data.file[i] ?? 0;

        let boxSize = new Vec3(comp.size.x, lineHeight).sub(new Vec3(padX * 2));
        let boxOffset = new Vec3(padX, padY + lineHeight * i);

        ctx.beginPath();
        ctx.rect(comp.pos.x + boxOffset.x, comp.pos.y + boxOffset.y, boxSize.x, boxSize.y);
        ctx.fillStyle = i === 0 ? "#ddd" : "#fff";
        ctx.strokeStyle = "#0004";
        ctx.fill();
        ctx.stroke();

        // draw transparent circle on upper right (or lower right for B)
        let drawReadCircle = (xStart: number, xEnd: number, color: string) => {
            let r = 4 / 10;
            ctx.beginPath();
            (ctx as any).roundRect(xStart, comp.pos.y + boxOffset.y + 0.2, xEnd - xStart, boxSize.y - 0.4, r);
            ctx.fillStyle = color;
            ctx.fill();
        };

        ctx.font = `${styles.fontSize}px monospace`;
        ctx.textAlign = 'end';
        ctx.textBaseline = "middle";

        let yMid = comp.pos.y + padY + lineHeight * (i + 0.5);

        let regCurrStr = regValToStr(regValue);

        let textWidth = ctx.measureText(regCurrStr).width;
        let xRight = comp.pos.x + boxOffset.x + boxSize.x - innerPadX;
        let xLeft = xRight - textWidth;

        let isARead = exeComp?.data.readAReg === i;
        let isBRead = exeComp?.data.readBReg === i;
        let xMid = (xLeft + xRight) / 2;

        if (isARead) {
            drawReadCircle(xLeft, isBRead ? xMid : xRight, "#3f39");
        }
        if (isBRead) {
            drawReadCircle(isARead ? xMid : xLeft, xRight, "#33f9");
        }

        ctx.fillStyle = (i > 0 && regValue === 0) ? '#0007' : "#000";
        ctx.fillText(regCurrStr, xRight, yMid + 0.1);

        if (i > 0 && exeComp?.data.writeEnabled && i === exeComp.data.writeReg) {

            let writeStr = regValToStr(exeComp.data.writeData);
            let writeTextWidth = ctx.measureText(writeStr).width;
            let xNewRight = xRight - writeTextWidth - padX * 3;

            drawReadCircle(xNewRight - writeTextWidth - 0.2, xNewRight + 0.2, "#ee39");

            ctx.textAlign = 'end';
            ctx.fillStyle = "#883f";
            ctx.fillText(writeStr, xNewRight, yMid);
        }

        ctx.fillStyle = "#000";
        let text = riscvRegNames[i];
        ctx.textAlign = 'start';
        ctx.fillText(text, comp.pos.x + boxOffset.x + innerPadX, yMid);
    }

    ctx.restore();
}

function renderWire(cvs: ICanvasState, editorState: IEditorState, wire: IWireGraph, exeNet: IExeNet, exeSystem: IExeSystem) {
    let ctx = cvs.ctx;

    let isCtrl = false;
    let isData = false;
    let isAddr = false;

    interface IPortBinding {
        comp: IComp;
        port: ICompPort;
        exePort: IExePort;
        nodeId: number;
    }

    let isNonZero = false;
    let portBindings = new Map<string, IPortBinding>();
    let flowSegs = new Set<string>(); // the direction of flow is given by id0 -> id1 in "id0:id1"
    let flowNodes = new Set<number>();
    let segKey = (id0: number, id1: number) => `${id0}:${id1}`;

    if (exeNet) {
        isNonZero = exeNet.value !== 0;

        let key = (compId: string, portId: string) => `${compId}:${portId}`;

        for (let exePortRef of [...exeNet.inputs, ...exeNet.outputs]) {
            let exeComp = exeSystem.comps[exePortRef.compIdx];
            let exePort = exeComp.ports[exePortRef.portIdx];
            let comp = exeComp.comp;
            let port = comp.ports[exePortRef.portIdx];

            portBindings.set(key(comp.id, port.id), {
                comp: comp,
                port: comp.ports[exePortRef.portIdx],
                exePort: exePort,
                nodeId: -1,
            });
        }

        let nodeIdToPortBinding = new Map<number, IPortBinding>();

        for (let node of wire.nodes) {
            if (node.ref?.type === RefType.CompNode) {
                let portBinding = portBindings.get(key(node.ref.id, node.ref.compNodeId!));
                if (portBinding) {
                    let port = portBinding.port;
                    if (hasFlag(port.type, PortDir.Ctrl)) {
                        isCtrl = true;
                    }
                    if (hasFlag(port.type, PortDir.Data)) {
                        isData = true;
                    }
                    if (hasFlag(port.type, PortDir.Addr)) {
                        isAddr = true;
                    }
                    nodeIdToPortBinding.set(node.id, portBinding);
                    portBinding.nodeId = node.id;
                }
            }
        }

        let inputNodeIds: number[] = []; // should only be one active input! multiple imply some failure, and should probably be rendered specially in some way
        let outputNodeIds: number[] = [];

        for (let binding of nodeIdToPortBinding.values()) {
            if (hasFlag(binding.port.type, PortDir.In) && binding.exePort.ioEnabled) {
                inputNodeIds.push(binding.nodeId);
            }
            if (hasFlag(binding.port.type, PortDir.Out) && binding.exePort.ioEnabled) {
                outputNodeIds.push(binding.nodeId);
            }
        }

        // now walk the wire graph from the inputNodeIds to all the outputNodeIds (shortest paths)
        // and mark those segments as flow segments

        for (let inputNodeId of inputNodeIds) {
            let visited = new Set<number>();
            let prevNodeId = new Map<number, number>();
            let queue = [inputNodeId];

            while (queue.length > 0) {
                let nodeId = queue.shift()!;
                if (visited.has(nodeId)) {
                    continue;
                }
                visited.add(nodeId);

                let node = wire.nodes[nodeId];
                for (let nextNodeId of node.edges) {
                    let node1 = wire.nodes[nextNodeId];
                    if (visited.has(node1.id)) {
                        continue;
                    }
                    prevNodeId.set(node1.id, nodeId);
                    queue.push(node1.id);
                }
            }

            for (let outputNodeId of outputNodeIds) {
                let nodeId = outputNodeId;
                while (nodeId !== inputNodeId) {
                    let prevId = prevNodeId.get(nodeId);
                    if (prevId === undefined) {
                        break;
                    }
                    flowSegs.add(segKey(prevId, nodeId));
                    flowNodes.add(prevId);
                    nodeId = prevId;
                }
            }
        }
    }

    let width = isCtrl ? 1 : 3;

    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.Wire && hoverRef.id === wire.id;

    let isSelected = editorState.layout.selected.some(a => a.type === RefType.Wire && a.id === wire.id);

    ctx.lineCap = "square";
    ctx.lineJoin = "round";

    function isSegHover(node0: IWireGraphNode, node1: IWireGraphNode) {
        return isHover && hoverRef?.wireNode0Id === node0.id && hoverRef?.wireNode1Id === node1.id;
    }

    if (isSelected) {
        ctx.save();
        ctx.beginPath();
        iterWireGraphSegments(wire, (node0, node1) => {
            ctx.moveTo(node0.pos.x, node0.pos.y);
            ctx.lineTo(node1.pos.x, node1.pos.y);
        });
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = (width + 3) * cvs.scale;
        ctx.stroke();
        ctx.restore();
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
            ctx.lineWidth = (width - 1) * cvs.scale;
            ctx.filter = 'blur(4px)';
            ctx.moveTo(node0.pos.x, node0.pos.y);
            ctx.lineTo(node1.pos.x, node1.pos.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    let noFlowColor = '#D3D3D3';
    let zeroFlowColor = '#fec44f';
    let nonZeroFlowColor = '#d95f0e';
    let flowColor = isNonZero ? nonZeroFlowColor : zeroFlowColor;

    iterWireGraphSegments(wire, (node0, node1) => {
        ctx.beginPath();

        let isForwardFlow = flowSegs.has(segKey(node0.id, node1.id));
        let isBackwardFlow = flowSegs.has(segKey(node1.id, node0.id));
        let isFlow = isForwardFlow || isBackwardFlow;

        // somehow will need to indicate flow direction (not yet)

        ctx.strokeStyle = noFlowColor; //'#333';

        if (isFlow) {
            ctx.strokeStyle = flowColor;
        }

        ctx.lineWidth = width * cvs.scale;
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
            let r = Math.max(width, 2) * 1.7 * cvs.scale;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            let isFlow = flowNodes.has(node.id);
            ctx.fillStyle = isFlow ? flowColor : noFlowColor;
            ctx.fill();
        }
    }

    for (let node of wire.nodes) {
        drawEndCircle(node.pos, isHover && isNil(hoverRef?.wireNode1Id) && hoverRef?.wireNode0Id === node.id);
    }

}
