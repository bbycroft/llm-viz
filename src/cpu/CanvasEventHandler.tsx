import React, { memo, useEffect, useRef, useState } from 'react';
import { AffineMat2d } from '../utils/AffineMat2d';
import { assignImm, assignImmFull, clamp, isNil, useFunctionRef } from '../utils/data';
import { KeyboardOrder, useGlobalKeyboard } from '../utils/keyboard';
import { useCombinedMouseTouchDrag } from '../utils/pointer';
import { BoundingBox3d, projectOntoVector, segmentNearestPoint, Vec3 } from '../utils/vector';
import { ICanvasState, ICpuLayout, IEditorState, IElRef, IHitTest, ISegment, IWireGraph, RefType } from './CpuModel';
import { editLayout, useEditorContext } from './Editor';
import { moveWiresWithComp, fixWire, wireToGraph, applyWires, checkWires, copyWireGraph, EPSILON, dragSegment } from './Wire';
import s from './CpuCanvas.module.scss';

export const CanvasEventHandler: React.FC<{
    cvsState: ICanvasState,
    children: React.ReactNode;
}> = memo(function CanvasEventHandler({ cvsState, children }) {

    let [ctrlDown, setCtrlDown] = useState(false);
    let [canvasWrapEl, setCanvasWrapEl] = useState<HTMLDivElement | null>(null);
    let { editorState, setEditorState } = useEditorContext();


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
    }, { receiveKeyUp: true });

    let handleWheelFuncRef = useFunctionRef(handleWheel);

    useEffect(() => {
        if (canvasWrapEl) {
            function wheelHandler(ev: WheelEvent) {
                handleWheelFuncRef.current(ev);
            }
            canvasWrapEl.addEventListener("wheel", wheelHandler, { passive: false });
            return () => {
                canvasWrapEl!.removeEventListener("wheel", wheelHandler);
            };
        }
    }, [canvasWrapEl, handleWheelFuncRef]);

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
            setEditorState(a => assignImm(a, { mtx: newMtx }));
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

    function handleWheel(ev: WheelEvent) {
        let scale = editorState.mtx.a;
        let newScale = clamp(scale * Math.pow(1.0013, -ev.deltaY), 0.01, 100000) / scale;

        let modelPt = evToModel(ev);
        let newMtx = AffineMat2d.multiply(
            AffineMat2d.translateVec(modelPt.mul(-1)),
            AffineMat2d.scale1(newScale),
            AffineMat2d.translateVec(modelPt.mul(1)),
            editorState.mtx);

        setEditorState(a => assignImm(a, { mtx: newMtx }));
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

    return <div
        className={s.canvasEventSurface}
        ref={setCanvasWrapEl}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor }}>
        {children}
    </div>;
});

