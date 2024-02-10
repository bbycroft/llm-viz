import React, { memo, useEffect, useRef, useState } from 'react';
import { AffineMat2d } from '../utils/AffineMat2d';
import { assignImm, assignImmFull, clamp, isNil, isNotNil } from '../utils/data';
import { hasModifiers, isKeyWithModifiers, KeyboardOrder, Modifiers, useGlobalKeyboard } from '../utils/keyboard';
import { useCombinedMouseTouchDrag, useTouchEvents } from '../utils/pointer';
import { BoundingBox3d, pointInTriangle, projectOntoVector, segmentNearestPoint, Vec3 } from '../utils/vector';
import { ICanvasState, IEditSnapshot, IEditorState, IElRef, IHitTest, ISchematic, IWireGraph, RefSubType, RefType } from './CpuModel';
import { canvasEvToModel, canvasEvToScreen, editMainSchematic, editSnapshot, editSubSchematic, modelToScreen, screenToModel, useEditorContext } from './Editor';
import { fixWire, wireToGraph, applyWires, checkWires, copyWireGraph, EPSILON, dragSegment, moveSelectedComponents, iterWireGraphSegments, ISegment } from './Wire';
import { CursorDragOverlay } from '../utils/CursorDragOverlay';
import { computeSubLayoutMatrix, editCtxFromRefId as editCtxFromElRef, getActiveSubSchematic, getCompSubSchematic, getMatrixForEditContext, getSchematicForRef, globalRefToLocal, globalRefToLocalIfMatch } from './SubSchematics';
import { useFunctionRef, useRequestAnimationFrame } from '../utils/hooks';
import { copySelection, cutSelection, pasteSelection } from './Clipboard';
import { deleteSelection } from './Selection';
import { compIsVisible } from './ModelHelpers';
import { constructSubCanvasState, shouldRenderComp } from './render/CanvasRenderHelpers';
import { multiSortStableAsc } from '../utils/array';
import { rotateCompIsHoriz, rotateCompPortPos } from './comps/CompHelpers';
import { wireLabelTriangle } from './render/WireLabelRender';

export const CanvasEventHandler: React.FC<{
    embedded?: boolean;
    cvsState: ICanvasState,
    children: React.ReactNode;
}> = memo(function CanvasEventHandler({ cvsState, embedded, children }) {

    let [ctrlDown, setCtrlDown] = useState(false);
    let [canvasWrapEl, setCanvasWrapEl] = useState<HTMLDivElement | null>(null);
    let [editorState, setEditorState] = useEditorContext({ });

    let keyboardManager = useGlobalKeyboard(KeyboardOrder.MainPage, ev => {
        if (ev.key === "Control") {
            setCtrlDown(ev.type === "keydown");
        }

        if (ev.type !== "keydown") {
            return;
        }

        if (isKeyWithModifiers(ev, "o", Modifiers.None)) {
            setEditorState(a => assignImm(a, { showExeOrder: !a.showExeOrder }));
        }
        if (isKeyWithModifiers(ev, "p", Modifiers.None)) {
            setEditorState(a => assignImm(a, { transparentComps: !a.transparentComps }));
        }
        if (isKeyWithModifiers(ev, "x", Modifiers.CtrlOrCmd)) {
            cutSelection(ev, editorState, setEditorState);
        }
        if (isKeyWithModifiers(ev, "c", Modifiers.CtrlOrCmd)) {
            copySelection(ev, editorState, setEditorState);
        }
        if (isKeyWithModifiers(ev, "v", Modifiers.CtrlOrCmd)) {
            pasteSelection(ev, editorState, setEditorState);
        }

        if (ev.key === "Delete") {
            setEditorState(editSnapshot(true, deleteSelection));
        }
    }, { receiveKeyUp: true });

    let handleWheelFuncRef = useFunctionRef(handleWheel);

    useEffect(() => {
        if (canvasWrapEl) {
            function wheelHandler(ev: WheelEvent) {
                if (!embedded || hasModifiers(ev, Modifiers.CtrlOrCmd) || keyboardManager.isFocused) {
                    handleWheelFuncRef.current(ev);
                }
            }
            canvasWrapEl.addEventListener("wheel", wheelHandler, { passive: false });
            return () => {
                canvasWrapEl!.removeEventListener("wheel", wheelHandler);
            };
        }
    }, [canvasWrapEl, handleWheelFuncRef, embedded, keyboardManager]);


    useTouchEvents(canvasWrapEl, { mtx: editorState.mtx }, { alwaysSendDragEvent: true },
        function handle1PointDrag(ev, ds) {
            let aPt0 = new Vec3(ds.touches[0].clientX, ds.touches[0].clientY);
            let bPt0 = new Vec3(ev.touches[0].clientX, ev.touches[0].clientY);
            let delta = bPt0.sub(aPt0);

            let mtx = AffineMat2d.multiply(
                AffineMat2d.translateVec(delta),
                ds.data.mtx,
            );

            ev.stopPropagation();
            ev.preventDefault();
            setEditorState(a => assignImm(a, { mtx }));
        },
        function handle2PointDrag(ev, ds) {
            let aPt0 = new Vec3(ds.touches[0].clientX, ds.touches[0].clientY);
            let aPt1 = new Vec3(ds.touches[1].clientX, ds.touches[1].clientY);

            let bPt0 = new Vec3(ev.touches[0].clientX, ev.touches[0].clientY);
            let bPt1 = new Vec3(ev.touches[1].clientX, ev.touches[1].clientY);

            let aCenter = aPt0.lerp(aPt1, 0.5);
            let bCenter = bPt0.lerp(bPt1, 0.5);

            let aLen = aPt0.dist(aPt1);
            let bLen = bPt0.dist(bPt1);

            // scale by ratio of lengths; keep model centers

            let scale = bLen / aLen;
            let mtx = AffineMat2d.multiply(
                AffineMat2d.translateVec(bCenter),
                AffineMat2d.scale1(scale),
                AffineMat2d.translateVec(aCenter.mul(-1)),
                ds.data.mtx,
            );

            ev.stopPropagation();
            ev.preventDefault();
            setEditorState(a => assignImm(a, { mtx }));
        });

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(cvsState?.canvas ?? null, ev => {
        let hovered = ev.button === 0 ? editorState.hovered : null;

        let editCtx = hovered ? editCtxFromElRef(hovered.ref) : { idPrefix: editorState.snapshot.focusedIdPrefix ?? "" };
        let mtx = getMatrixForEditContext(editCtx, editorState);

        return {
            baseMtx: editorState.mtx,
            mtx: mtx,
            hovered: hovered,
            modelPos: evToModel(ev, mtx),
            editCtx: editCtx,
            ctrlDown: ctrlDown,
            isSelecting: (ev.button === 0 && ctrlDown) || ev.button === 2,
        };
     }, function handleDrag(ev, ds, end) {

        let selection = document.getSelection();
        selection?.removeAllRanges();
        let mtxLocal = getMatrixForEditContext(ds.data.editCtx, editorState);

        if (ds.data.isSelecting) {
            let endPos = evToModel(ev, editorState.mtx);
            let startPos = ds.data.modelPos;
            let bb = new BoundingBox3d(startPos, endPos);

            let [idPrefix, schematic] = getActiveSubSchematic(editorState);

            let compRefs = schematic.comps.filter(c => {
                return bb.intersects(c.bb);
            }).map(c => ({ type: RefType.Comp, id: idPrefix + c.id }));

            let wireRefs = schematic.wires.flatMap(w => {
                let nodeRefs: IElRef[] = [];
                for (let node of w.nodes) {
                    if (bb.contains(node.pos)) {
                        nodeRefs.push({ type: RefType.WireNode, id: idPrefix + w.id, wireNode0Id: node.id });
                    }
                }

                let segRefs: IElRef[] = [];
                iterWireGraphSegments(w, (node0, node1) => {
                    let bb2 = new BoundingBox3d(node0.pos, node1.pos);
                    if (bb.intersects(bb2)) {
                        segRefs.push({ type: RefType.WireSeg, id: idPrefix + w.id, wireNode0Id: node0.id, wireNode1Id: node1.id });
                    }
                });

                return [...nodeRefs, ...segRefs];
            });

            let labelAnchorRefs = schematic.wireLabels.filter(l => {
                let rectTl = l.anchorPos.add(l.rectRelPos);
                let rectBb = new BoundingBox3d(rectTl, rectTl.add(l.rectSize));

                return bb.contains(l.anchorPos) || bb.intersects(rectBb);
            }).map(l => ({ type: RefType.WireLabel, id: idPrefix + l.id }));

            setEditorState(a => assignImm(a, {
                selectRegion: end ? null : { bbox: bb, idPrefix: '' },
                snapshot: assignImm(a.snapshot, {
                    selected: [...compRefs, ...wireRefs, ...labelAnchorRefs],
                    selectionRotateCenter: null,
                }),
            }));

        } else if (!ds.data.hovered) {
            let delta = new Vec3(ev.clientX - ds.clientX, ev.clientY - ds.clientY);
            let newMtx = AffineMat2d.multiply(AffineMat2d.translateVec(delta), ds.data.baseMtx);
            setEditorState(a => assignImm(a, {
                dragCreateComp: undefined,
                mtx: newMtx,
            }));
        } else {
            let hoveredRef = ds.data.hovered.ref;

            if (hoveredRef.type === RefType.Comp) {
                let isSelected = editorState!.snapshot.selected.find(a => a.type === RefType.Comp && a.id === hoveredRef.id);
                if (isSelected) {
                    // handleComponentDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev));
                    handleSelectionDrag(end, ds.data.modelPos, evToModel(ev, mtxLocal));
                }
            } else if (hoveredRef.type === RefType.CompNode) {
                handleWireCreateDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev, mtxLocal));
            } else if (hoveredRef.type === RefType.WireSeg) {
                handleWireDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev, mtxLocal));
            } else if (hoveredRef.type === RefType.WireNode) {
                handleWireExtendDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev, mtxLocal), mtxLocal);
            } else if (hoveredRef.type === RefType.WireLabel) {
                handleWireLabelAnchorDrag(end, hoveredRef, ds.data.modelPos, evToModel(ev, mtxLocal), mtxLocal);
            }
        }

        ev.stopPropagation();
        ev.preventDefault();
    }, function handleClick(ev, ds) {

        if (ds.data.hovered) {
            let hoveredRef = ds.data.hovered.ref;
            setEditorState(a => assignImm(a, {
                snapshot: assignImm(a.snapshot, {
                    selected: [hoveredRef],
                    selectionRotateCenter: null,
                }),
            }));
        } else {
            setEditorState(a => assignImm(a, {
                dragCreateComp: undefined,
                snapshot: assignImm(a.snapshot, {
                    selected: [],
                    selectionRotateCenter: null,
                }),
            }));
        }

        ev.stopPropagation();
        ev.preventDefault();
    });

    let showTransparentComponents = dragStart?.data.ctrlDown || ctrlDown || editorState.transparentComps;

    function handleSelectionDrag(end: boolean, origModelPos: Vec3, newModelPos: Vec3) {

        setEditorState(editMainSchematic(end, (schematic, state, snapshot) => {
            let deltaPos = newModelPos.sub(origModelPos);
            let snappedDelta = snapToGrid(deltaPos);
            return moveSelectedComponents(state, schematic, snapshot.selected, snappedDelta);
        }));
    }

    function handleWireCreateDrag(end: boolean, globalRef: IElRef, origModelPos: Vec3, newModelPos: Vec3) {
        let editCtx = editCtxFromElRef(globalRef);
        let ref = globalRefToLocal(globalRef);
        setEditorState(editSubSchematic(editCtx, end, function handleWireCreateDrag(schematic) {
            let startComp = schematic.comps.find(c => c.id === ref.id);
            if (!startComp) {
                console.log(`WARN: handleWireCreateDrag: comp '${ref.id}' not found`);
                return schematic;
            }
            let startPort = startComp.ports.find(n => n.id === ref.compNodeId);
            if (!startPort) {
                console.log(`WARN: handleWireCreateDrag: comp '${ref.id}' does not have the port '${ref.compNodeId}'`);
                return schematic;
            }

            let startPt = rotateCompPortPos(startComp, startPort);
            let endPt = snapToGrid(newModelPos);

            let isHorizStart = rotateCompIsHoriz(startComp, startPort.pos.x === 0 || startPort.pos.x === startComp.size.x);

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
                id: '' + schematic.nextWireId,
                segments: segments,
            }));

            let newWires = [...schematic.wires, newWire];
            let newLayout = applyWires(assignImm(schematic, { nextWireId: schematic.nextWireId + 1, wires: newWires }), newWires, newWires.length - 1);

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
    function handleWireExtendDrag(end: boolean, globalRef: IElRef, origModelPos: Vec3, newModelPos: Vec3, mtx: AffineMat2d) {
        let editCtx = editCtxFromElRef(globalRef);
        let ref = globalRefToLocal(globalRef);
        setEditorState(editSubSchematic(editCtx, end, function handleWireExtendDrag(schematic) {
            checkWires(schematic.wires, 'handleWireExtendDrag (pre edit)');
            let wireIdx = schematic.wires.findIndex(w => w.id === ref.id);
            if (wireIdx === -1) {
                console.log(`WARN: handleWireExtendDrag: wire '${ref.id}' not found`);
                return schematic;
            }

            let wire = copyWireGraph(schematic.wires[wireIdx]);
            let delta = newModelPos.sub(origModelPos);
            let node = wire.nodes[ref.wireNode0Id!];
            let startPos = node.pos;

            let screenPos = modelToScreen(startPos, mtx);
            let mouseScreenPos = modelToScreen(newModelPos, mtx);
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

            let wires = [...schematic.wires];
            wires[wireIdx] = wire;

            checkWires(wires, 'handleWireExtendDrag');

            return applyWires(schematic, wires, wireIdx);
        }));

    }

    function handleWireDrag(end: boolean, globalRef: IElRef, origModelPos: Vec3, newModelPos: Vec3) {
        let editCtx = editCtxFromElRef(globalRef);
        let ref = globalRefToLocal(globalRef);

        setEditorState(editSubSchematic(editCtx, end, function handleWireDrag(schematic) {
            let wireIdx = schematic.wires.findIndex(w => w.id === ref.id);
            if (wireIdx === -1) {
                console.log(`WARN: handleWireDrag: wire ${ref.id} not found`)
                return schematic;
            }
            let wire = schematic.wires[wireIdx];
            let delta = newModelPos.sub(origModelPos);
            let node0 = wire.nodes[ref.wireNode0Id!];
            let node1 = wire.nodes[ref.wireNode1Id!];

            // don't allow dragging of segments connected to components (since they're pinned)
            // probably want to support dragging by introducing a perp-segment though
            if (node0.ref || node1.ref) {
                return schematic;
            }

            let isHoriz = node0.pos.y === node1.pos.y;
            if (isHoriz) {
                delta = new Vec3(0, delta.y);
            } else {
                delta = new Vec3(delta.x, 0);
            }

            let newWire = dragSegment(wire, ref.wireNode0Id!, ref.wireNode1Id!, delta);

            let wires = [...schematic.wires];
            wires[wireIdx] = newWire;
            return applyWires(schematic, wires, wireIdx);
        }));
    }

    function handleWireLabelAnchorDrag(end: boolean, globalRef: IElRef, origModelPos: Vec3, newModelPos: Vec3, mtx: AffineMat2d) {
        let editCtx = editCtxFromElRef(globalRef);
        let ref = globalRefToLocal(globalRef);
        setEditorState(editSubSchematic(editCtx, end, (schematic) => {
            let labelIdx = schematic.wireLabels.findIndex(l => l.id === ref.id);
            if (labelIdx === -1) {
                console.log(`WARN: handleWireLabelAnchorDrag: label ${ref.id} not found`)
                return schematic;
            }
            let label = schematic.wireLabels[labelIdx];
            let delta = newModelPos.sub(origModelPos);
            let newAnchorPos = label.anchorPos.add(delta);
            // snap to mid-points on grid edges. I.e. if one axis is 0.0, the other axis is 0.5

            let nearestWire: IWireGraph = null!;
            let nearestWirePos: Vec3 | null = null;
            let nearestDist = 0;
            for (let wire of schematic.wires) {
                iterWireGraphSegments(wire, (node0, node1) => {
                    let nearestModelP = segmentNearestPoint(node0.pos, node1.pos, newAnchorPos);
                    let dist = nearestModelP.dist(newAnchorPos);
                    if (dist < 2 && (!nearestWire || dist < nearestDist)) {
                        nearestWire = wire;
                        nearestDist = dist;
                        nearestWirePos = nearestModelP;
                    }
                });
            }

            if (nearestWirePos) {
                newAnchorPos = nearestWirePos;
            } else {
                newAnchorPos = newAnchorPos.round();
            }

            let newLabel = assignImm(label, {
                anchorPos: newAnchorPos,
                wireId: nearestWire?.id ?? '',
            });
            let newLabels = [...schematic.wireLabels];
            newLabels[labelIdx] = newLabel;
            return assignImm(schematic, { wireLabels: newLabels });
        }));
    }

    const scalePowerBase = 1.0013;

    function handleWheel(ev: WheelEvent) {
        setEditorState(state => {
            let scale = state.targetScale ?? state.mtx.a;
            let newScale = clamp(scale * Math.pow(scalePowerBase, -ev.deltaY * 2), 0.01, 100000);
            return assignImm(state, { targetScale: newScale, scaleModelPt: evToModel(ev, state.mtx) });
        });
        ev.stopPropagation();
        ev.preventDefault();
    }

    let zoomBitsRef = useRef({
        initial: null as (number | null),
        target: null as (number | null),
        t: 0,
     });

    useRequestAnimationFrame(isNotNil(editorState.targetScale), (dtSeconds) => {
        if (isNil(editorState.targetScale)) {
            return;
        }
        let bits = zoomBitsRef.current;
        let target = editorState.targetScale!;
        if (bits.target !== target) {
            bits.initial = editorState.mtx.a;
            bits.target = target;
            bits.t = 0;
        }

        bits.t += dtSeconds / 0.08; // t goes from 0 to 1 in 80ms

        let initial = bits.initial!;

        let isComplete = bits.t >= 1.0;
        if (isComplete) {
            bits.initial = null;
            bits.target = null;
            bits.t = 0;
        }

        // target = initial * Math.pow(scalePowerBase, someValue)
        // someValue = log(target / initial) / log(scalePowerBase)

        const scalePowerBase = 1.0013;
        let factor = Math.log(target / initial) / Math.log(scalePowerBase);
        let scaleInterp = isComplete ? target : initial * Math.pow(scalePowerBase, factor * bits.t);

        setEditorState(state => {
            let scaleAmt = scaleInterp / state.mtx.a;

            if (isNil(state.scaleModelPt)) {
                return state;
            }

            let newMtx = AffineMat2d.multiply(
                    state.mtx,
                    AffineMat2d.translateVec(state.scaleModelPt!),
                    AffineMat2d.scale1(scaleAmt),
                    AffineMat2d.translateVec(state.scaleModelPt!.mul(-1)));

            return assignImm(state, {
                mtx: newMtx,
                scaleModelPt: isComplete ? undefined : state.scaleModelPt,
                targetScale: isComplete ? undefined : state.targetScale,
            });
        });
    });

    function getRefUnderCursor(editorState: IEditorState, cvsState: ICanvasState, ev: React.MouseEvent, schematic?: ISchematic, idPrefix: string = ''): IHitTest | null {
        let mtx = cvsState.mtx;
        schematic ??= (editorState.snapshotTemp ?? editorState.snapshot).mainSchematic;

        let mousePtModel = evToModel(ev, mtx);
        let mousePtScreen = evToScreen(ev);

        let comps = schematic.comps;

        let singleSelectedRefGlobal = editorState.snapshot.selected.length === 1 ? editorState.snapshot.selected[0] : null;
        let singleSelectedRef = singleSelectedRefGlobal ? globalRefToLocalIfMatch(singleSelectedRefGlobal, idPrefix) : null;

        let refsUnderCursor: IHitTest[] = [];

        if (!showTransparentComponents) {
            for (let i = comps.length - 1; i >= 0; i--) {
                let comp = comps[i];

                if (!compIsVisible(comp, idPrefix)) {
                    continue;
                }

                let [compVisible, compPortsVisible, subSchematicVisible] = shouldRenderComp(comp, cvsState);

                if (!compVisible) {
                    continue;
                }

                if (compPortsVisible) {
                    for (let port of comp.ports) {
                        let modelPos = rotateCompPortPos(comp, port);
                        let nodeScreenPos = modelToScreen(modelPos, mtx);
                        let modelDist = modelPos.dist(mousePtModel);
                        let screenDist = nodeScreenPos.dist(mousePtScreen);
                        if (screenDist < 10) {
                            refsUnderCursor.push({
                                ref: { type: RefType.CompNode, id: idPrefix + comp.id, compNodeId: port.id },
                                distPx: screenDist,
                                modelPt: modelPos,
                            });
                        }
                    }
                }

                if (comp.bb.contains(mousePtModel)) {

                    if ((comp.hasSubSchematic || comp.subSchematicId) && editorState.maskHover !== comp.id && subSchematicVisible) {
                        let screenBb = mtx.mulBb(comp.bb).shrinkInPlaceXY(20);
                        if (screenBb.contains(mousePtScreen)) {
                            // need some test of whether we can click through to the sub-schematic,
                            // since still want to be able to select the component itself. Also should
                            // be related to zoom level
                            let def = editorState.compLibrary.getCompDef(comp.defId);
                            let subSchematic = getCompSubSchematic(editorState, comp)!;
                            if (subSchematic && def) {
                                let subMtx = computeSubLayoutMatrix(comp, subSchematic);
                                let subCvs = constructSubCanvasState(cvsState, subMtx, comp);

                                let subRef = getRefUnderCursor(editorState, subCvs, ev, subSchematic, idPrefix + comp.id + '|');

                                if (subRef) {
                                    refsUnderCursor.push(subRef);
                                }
                            }
                            continue;
                        }
                    }

                    refsUnderCursor.push({
                        ref: { type: RefType.Comp, id: idPrefix + comp.id },
                        distPx: 0,
                        modelPt: mousePtModel,
                    });
                }
            }
        }

        let wires = schematic.wires;
        for (let i = wires.length - 1; i >= 0; i--) {
            let wire = wires[i];
            for (let node of wire.nodes) {
                let pScreen = modelToScreen(node.pos, mtx);
                let screenDist = pScreen.dist(mousePtScreen);
                if (screenDist < 10) {
                    refsUnderCursor.push({
                        ref: { type: RefType.WireNode, id: idPrefix + wire.id, wireNode0Id: node.id },
                        distPx: screenDist,
                        modelPt: screenToModel(pScreen, mtx),
                    });
                }
            }

            for (let node0 of wire.nodes) {
                let p0Screen = modelToScreen(node0.pos, mtx);

                for (let node1Idx of node0.edges) {
                    if (node1Idx <= node0.id) {
                        continue;
                    }
                    let node1 = wire.nodes[node1Idx];

                    let p1Screen = modelToScreen(node1.pos, mtx);
                    let isectPt = segmentNearestPoint(p0Screen, p1Screen, mousePtScreen);
                    let screenDist = isectPt.dist(mousePtScreen);
                    if (screenDist < 10) {
                        refsUnderCursor.push({
                            ref: { type: RefType.WireSeg, id: idPrefix + wire.id, wireNode0Id: node0.id, wireNode1Id: node1.id },
                            distPx: screenDist,
                            modelPt: screenToModel(isectPt, mtx),
                        });
                    }
                }
            }
        }

        let wireLabels = schematic.wireLabels;
        for (let i = wireLabels.length - 1; i >= 0; i--) {
            let wireLabel = wireLabels[i];

            let pScreen = modelToScreen(wireLabel.anchorPos, mtx);

            let anchorScreenDist = pScreen.dist(mousePtScreen);
            let anchorModelDist = wireLabel.anchorPos.dist(mousePtModel);

            if (anchorModelDist < 0.2 || anchorScreenDist < 16) {
                refsUnderCursor.push({
                    ref: { type: RefType.WireLabel, id: idPrefix + wireLabel.id, subType: RefSubType.WireLabelAnchor },
                    distPx: anchorScreenDist,
                    modelPt: wireLabel.anchorPos,
                });
            }

            let labelTl = wireLabel.anchorPos.add(wireLabel.rectRelPos);
            let labelBb = new BoundingBox3d(labelTl, labelTl.add(wireLabel.rectSize));
            let cursorInLabel = labelBb.contains(mousePtModel);

            if (singleSelectedRef?.type === RefType.WireLabel && singleSelectedRef.id === wireLabel.id) {
                // the triangle is now part of the label hit region
                let [leftIsNearest, trianglePoint] = wireLabelTriangle(wireLabel);
                let inTriangle = pointInTriangle(mousePtModel, trianglePoint, leftIsNearest ? labelBb.tl() : labelBb.br(), leftIsNearest ? labelBb.bl() : labelBb.tr());
                cursorInLabel = cursorInLabel || inTriangle;
            }

            if (cursorInLabel) {
                refsUnderCursor.push({
                    ref: { type: RefType.WireLabel, id: idPrefix + wireLabel.id, subType: RefSubType.WireLabelRect },
                    distPx: 0,
                    modelPt: mousePtModel,
                });
            }
        }

        let sorted = multiSortStableAsc(refsUnderCursor, [
            a => {
                switch (a.ref.type) {
                    case RefType.WireLabel: return 0;
                    case RefType.CompNode: return 1;
                    case RefType.Comp: return 2;
                    case RefType.WireNode: return 3;
                    case RefType.WireSeg: return 4;
                    default: return 4;
                }
            },
            a => a.distPx,
        ]);

        return sorted[0] ?? null;
    }

    let dragCreateComp = editorState.dragCreateComp;

    function handleMouseMove(ev: React.MouseEvent) {

        if (dragCreateComp) {
            let compOrig = dragCreateComp.compOrig;
            let wireLabel = dragCreateComp.wireLabel;
            let mousePos = snapToGrid(evToModel(ev, editorState.mtx));

            let applyFunc = (a: IEditSnapshot): IEditSnapshot => {
                // figure out which schematic we're in
                // (assume the main one for now!)

                if (compOrig) {
                    let newComp = assignImm(compOrig, {
                        id: '' + a.mainSchematic.nextCompId,
                        pos: mousePos,
                    });
                    editorState.compLibrary.updateCompFromDef(newComp);
                    return assignImm(a, {
                        mainSchematic: assignImm(a.mainSchematic, {
                            nextCompId: a.mainSchematic.nextCompId + 1,
                            comps: [...a.mainSchematic.comps, newComp],
                        }),
                    });
                } else if (wireLabel) {
                    let newWireLabel = assignImm(wireLabel, {
                        id: '' + a.mainSchematic.nextWireLabelId,
                        anchorPos: mousePos,
                    });
                    return assignImm(a, {
                        mainSchematic: assignImm(a.mainSchematic, {
                            nextWireLabelId: a.mainSchematic.nextWireLabelId + 1,
                            wireLabels: [...a.mainSchematic.wireLabels, newWireLabel],
                        }),
                    });
                } else {
                    return a;
                }
            };

            setEditorState(a => assignImm(a, {
                dragCreateComp: a.dragCreateComp ? assignImm(a.dragCreateComp, { applyFunc }) : undefined,
            }));

            return;
        }

        let isect = getRefUnderCursor(editorState, cvsState, ev);

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
        cursor = 'move';

    } else if (editorState.hovered) {
        let hoveredRef = editorState.hovered.ref;
        if (hoveredRef.type === RefType.CompNode) {
            cursor = 'crosshair';
        } else if (hoveredRef.type === RefType.WireSeg) {
            let [ref, schematic] = getSchematicForRef(editorState, hoveredRef);
            let wire = schematic.wires.find(w => w.id === ref.id);
            if (wire) {
                let node0 = wire.nodes[ref.wireNode0Id!];
                let node1 = wire.nodes[ref.wireNode1Id!];
                if (node0 && node1) {
                    let isHoriz = node0.pos.y === node1.pos.y;
                    cursor = isHoriz ? 'ns-resize' : 'ew-resize';
                }
            }
        } else if (hoveredRef.type === RefType.WireNode) {
            cursor = 'crosshair';
        } else if (hoveredRef.type === RefType.Comp) {
            if (editorState.snapshot.selected.find(a => a.type === RefType.Comp && a.id === hoveredRef.id)) {
                cursor = 'move';
            }

        }
    }

    let dragCursor: string | undefined;
    if (dragStart && !dragStart.data.hovered) {
        dragCursor = 'cursor-grabbing';
    }

    function snapToGrid(pt: Vec3) {
        return pt.round();
    }

    let evToScreen = (ev: { clientX: number, clientY: number }) => canvasEvToScreen(cvsState.canvas, ev);
    let evToModel = (ev: { clientX: number, clientY: number }, mtx: AffineMat2d) => canvasEvToModel(cvsState.canvas, ev, mtx);

    return <div
        className={"pointer-events-auto w-full h-full absolute cursor-grab"}
        ref={setCanvasWrapEl}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={ev => ev.preventDefault()}
        style={{ cursor }}>
        {children}
        {dragCursor && <CursorDragOverlay className={dragCursor} />}
    </div>;
});

