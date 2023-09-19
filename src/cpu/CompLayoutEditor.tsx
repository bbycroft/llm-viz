import clsx from 'clsx';
import React, { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ViewLayoutContext, editLayout, editLayoutDirect, useEditorContext, useViewLayout } from './Editor';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCaretRight, faPlus } from '@fortawesome/free-solid-svg-icons';
import { Gripper, ICompPortConfig, compPortDefId } from './comps/CompPort';
import { pluralize } from '../utils/text';
import { assignImm, clamp, hasFlag, isNotNil, makeArray, useFunctionRef } from '../utils/data';
import { Vec3 } from '../utils/vector';
import { useResizeChangeHandler } from '../utils/layout';
import { IComp, ICompPort, IEditSnapshot, PortType } from './CpuModel';
import { multiSortStableAsc } from '../utils/array';
import { paletteTw } from './palette';
import { AffineMat2d } from '../utils/AffineMat2d';
import { IPointerEvent, useCombinedMouseTouchDrag } from '../utils/pointer';
import { drawGrid } from './CanvasRenderHelpers';
import { CursorDragOverlay } from '../utils/CursorDragOverlay';

/*

When we're editing a schematic, we have the option of making a component out of it. We need to choose
the size of the component and the positioning of its ports.

There is a 0,1-1 mapping between ports in the schematic and ports in the component. We may pre-add ports
on the component, and they'll essentially be ignored (value 0). When we add ports on the schematic, we'll
try to fit them on the component somewhere, maybe trying to position them how they're positioned on the
schematic (will need a 'floating' flag).

If there's no where to put them, maybe leave them in an "unattached" state, and the user can manually
resize the component and position them as desired.

The CompLayoutEditor is a side panel for managing the layout of a component. It will have a list of
the ports, as well as a diagram where ports can be dragged around. The component itself can also be
resized (but not moved).

It'll be a hideable drawer thing, and if there's no component for the schematic, we'll show "Create Component (4 ports)"
instead. Clicking that will create a component with 4 ports, and open the drawer.


We'll need to add the info to EditorState, and probably CPULayout so we have undo/redo support.

Might have to change ICpuLayout and split an interface off that goes into the edit tree (undoStack, redoStack, with selection etc).

*/

export const CompLayoutToolbar: React.FC<{
    className?: string;
}> = memo(function CompLayoutToolbar({ className }) {
    let { editorState, setEditorState } = useEditorContext();
    let [isExpanded, setIsExpanded] = useState(false);

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let hasComponent = snapshot.compSize.x > 0 && snapshot.compSize.y > 0;

    let numPorts = useMemo(() => {
        let numPorts = 0;
        for (let comp of editorState.snapshot.comps) {
            if (comp.defId === compPortDefId) {
                numPorts++;
            }
        }

        return numPorts;
    }, [editorState.snapshot]);

    function onCreateEditClicked(ev: React.MouseEvent) {
        setIsExpanded(a => !a);
        if (!hasComponent) {
            setEditorState(editLayout(true, (snap, state) => {
                return assignImm(snap, {
                    compSize: new Vec3(4, 4),
                });
            }));
        }

        ev.preventDefault();
        ev.stopPropagation();
    }

    return <div className={clsx("flex flex-col bg-white shadow-md border m-6 rounded items-stretch overflow-hidden", className)}>
        <div className='flex flex-row h-10'>
            <div className="p-3 hover:bg-blue-300 cursor-pointer flex-1 flex justify-end items-center" onClick={onCreateEditClicked}>
                {!hasComponent && <>Create Component ({numPorts} {pluralize('port', numPorts)})
                    <FontAwesomeIcon icon={faPlus} className="ml-2" />
                </>}
                {hasComponent && <>
                    Edit Component ({numPorts} {pluralize('port', numPorts)})
                    <FontAwesomeIcon icon={faCaretRight} className="ml-3 transition-transform" rotation={isExpanded ? 90 : undefined} />
                </>}
            </div>
        </div>
        {isExpanded && <CompLayoutEditor />}
    </div>;
});

export const CompLayoutEditor: React.FC<{

}> = memo(function CompLayoutEditor({ }) {
    let { editorState, setEditorState } = useEditorContext();
    let [canvasWrapEl, setCanvasWrapEl] = useState<HTMLDivElement | null>(null);
    let [canvaEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [compPos, setCompPos] = useState(new Vec3());
    let [dragPortIdx, setDragPortIdx] = useState<number | null>(null);
    let [, redraw] = useReducer(a => a + 1, 0);

    let [mtx, setMtx] = useState(() => {
        let initScale = 40;
        return new AffineMat2d(initScale, 0, 0, initScale, 1, 1);
    });

    useResizeChangeHandler(canvaEl?.parentElement, (bcr) => {
        redraw();
    });

    let cvsBitsRef = useRef({
        extraCanvases: new Map<string, HTMLCanvasElement>(),
    });

    function evToModel(ev: IPointerEvent) {
        let bcr = canvaEl!.getBoundingClientRect();
        let ctxPos = new Vec3(ev.clientX - bcr.left, ev.clientY - bcr.top);
        return mtx.mulVec3Inv(ctxPos);
    }

    function handleWheel(ev: WheelEvent) {
        let scale = mtx.a;
        let newScale = clamp(scale * Math.pow(1.0013, -ev.deltaY), 0.01, 100000) / scale;

        let modelPt = evToModel(ev);
        let newMtx = AffineMat2d.multiply(
            mtx,
            AffineMat2d.translateVec(modelPt),
            AffineMat2d.scale1(newScale),
            AffineMat2d.translateVec(modelPt.mul(-1)));

        setMtx(newMtx);
        ev.stopPropagation();
        ev.preventDefault();
    }

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

    useLayoutEffect(() => {
        if (!canvaEl) {
            return;
        }
        let bits = cvsBitsRef.current;

        let ctx = canvaEl.getContext('2d')!;

        let pr = window.devicePixelRatio;
        let desiredWidth = Math.floor(canvaEl.parentElement!.clientWidth * pr);
        let desiredHeight = Math.floor(canvaEl.parentElement!.clientHeight * pr);

        if (canvaEl.width !== desiredWidth || canvaEl.height !== desiredHeight) {
            canvaEl.width = desiredWidth;
            canvaEl.height = desiredHeight;
        }

        ctx.save();
        ctx.clearRect(0, 0, canvaEl.width, canvaEl.height);
        ctx.scale(pr, pr);
        ctx.transform(...mtx.toTransformParams());

        drawGrid(mtx, ctx, { tileCanvases: bits.extraCanvases }, '#333');

        ctx.restore();

    });

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let schematicPortComps = useMemo(() => {
        let ports = snapshot.comps
            .filter(a => a.defId === compPortDefId) as IComp<ICompPortConfig>[];

        ports = multiSortStableAsc(ports, [a => a.args.type]);

        return ports;
    }, [snapshot.comps]);

    useEffect(() => {
        let portIds = new Set(snapshot.compPorts.map(a => a.id));
        let schematicPortIds = new Set(schematicPortComps.map(a => a.args.portId));

        let schematicPortsToAdd = snapshot.compPorts.filter(a => !schematicPortIds.has(a.id));
        let portsToAdd = schematicPortComps.filter(a => !portIds.has(a.args.portId));

        let currPortPoses = snapshot.compPorts.map(a => a.pos);

        let autogenPorts: ICompPort[] = [];
        for (let schemPort of portsToAdd) {
            let targetPos: Vec3 | null = null;
            for (let pos of iterPorts(snapshot.compSize)) {
                if (!currPortPoses.some(a => a.dist(pos) < 0.001)) {
                    targetPos = pos;
                    break;
                }
            }
            if (targetPos) {
                autogenPorts.push({
                    id: schemPort.args.portId,
                    pos: targetPos,
                    name: schemPort.args.name,
                    type: schemPort.args.type,
                    width: schemPort.args.bitWidth,
                });
                currPortPoses.push(targetPos);
            }
        }

        let newPorts = [...snapshot.compPorts, ...autogenPorts];

        if (autogenPorts.length > 0) {
            setEditorState(editLayoutDirect((snap) => {
                return assignImm(snap, { compPorts: newPorts });
            }));
        }

    }, [schematicPortComps, snapshot.compPorts, snapshot.compSize, setEditorState]);

    function handleCompPosChange(end: boolean, pos: Vec3) {
        setCompPos(pos);
    }

    return <div className='h-[30rem] w-[20rem] bg-white flex flex-col'>

        <ViewLayoutContext.Provider value={{ el: canvaEl!, mtx }}>
            <div className='bg-white flex-1 border-y relative shadow-inner' ref={setCanvasWrapEl}>
                <canvas className='absolute w-full h-full' ref={setCanvasEl} />
                <div className="overflow-hidden absolute left-0 top-0 w-full h-full pointer-events-none">
                    <div className="absolute origin-top-left" style={{ transform: `matrix(${mtx.toTransformParams().join(',')})` }}>
                        <CompBoxEditor size={snapshot.compSize} pos={compPos} setPos={handleCompPosChange} />
                        {snapshot.compPorts.map((port, i) => {
                            let portId = port.id;
                            let schematicComp = schematicPortComps.find(a => a.args.portId === portId) ?? null;
                            return <CompPortEditor
                                key={i}
                                portIdx={i}
                                compPos={compPos}
                                schematicComp={schematicComp}
                                port={port}
                                draggingPortIdx={dragPortIdx}
                                setDraggingPortIdx={setDragPortIdx}
                            />;
                        })}
                    </div>
                </div>
            </div>
        </ViewLayoutContext.Provider>
        <div className='x-compListViewport h-[12rem] overflow-y-auto bg-gray-100'>
            <div className='x-compListBody flex-1 border-y'>
                {schematicPortComps.map((comp, i) => {
                    let args = comp.args;
                    let isInput = hasFlag(args.type, PortType.In);

                    return <div className='x-compListItem flex flex-row items-center py-1 border-b bg-white' key={i}>
                        <div className={clsx('mx-2 w-[1.2rem] text-center font-mono rounded', isInput ? paletteTw.portInputBg : paletteTw.portOutputBg)}>{isInput ? 'I' : 'O'}</div>
                        <div className='flex-1'>{args.name}</div>
                        <div className='px-2'>{args.bitWidth}</div>
                    </div>;
                })}
            </div>
        </div>

    </div>;
});

let pxPerUnit = 15;

function *iterPorts(size: Vec3) {
    for (let i = 1; i < size.x; i++) {
        yield new Vec3(i, 0);
    }
    for (let i = 1; i < size.y; i++) {
        yield new Vec3(size.x, i);
    }
    for (let i = size.x - 1; i >= 1; i--) {
        yield new Vec3(i, size.y);
    }
    for (let i = size.y - 1; i >= 1; i--) {
        yield new Vec3(0, i);
    }
}

export const CompBoxEditor: React.FC<{
    pos: Vec3;
    size: Vec3;
    setPos: (end: boolean, pos: Vec3) => void;
}> = memo(function CompBoxEditor({ pos, size, setPos }) {
    let { setEditorState } = useEditorContext();
    let { mtx, el } = useViewLayout();
    let [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);

    function handleResize(end: boolean, pos: Vec3, size: Vec3) {
        setPos(end, pos);
        setEditorState(editLayout(end, snap => {
            return assignImm(snap, { compSize: size });
        }));
    }

    function evToModel(ev: IPointerEvent) {
        let bcr = el!.getBoundingClientRect();
        let ctxPos = new Vec3(ev.clientX - bcr.left, ev.clientY - bcr.top);
        return mtx.mulVec3Inv(ctxPos);
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(boxEl, () => pos, function handleDrag(ev, ds, end) {
        let delta = evToModel(ev).sub(evToModel(ds));
        setPos(end, ds.data.add(delta).round());
    });

    let zoom = mtx.a;

    return <>
        <div ref={setBoxEl} className={clsx('x_compRect absolute pointer-events-auto border border-black rounded origin-top-left cursor-move', paletteTw.compBg)}
            // style={{ left: pos.x, top: pos.y, width: size.x + 'px', height: size.y + 'px', borderWidth: 1/pxPerUnit }} //, transform: `scale(${1/pxPerUnit})` }}>
            style={{ width: size.x * zoom, height: size.y * zoom, transform: `translate(${pos.x}px, ${pos.y}px) scale(${1/zoom})` }}
            onMouseDown={setDragStart}
        >
            {makeArray(4).map((_, i) => {
                return <Gripper key={i} gripPos={i} pos={pos} size={size} onResize={handleResize} />;
            })}
        </div>
        {/* <div
            className={clsx('absolute origin-top-left')}
            style={{ left: pos.x, top: pos.y, width: size.x * zoom, height: size.y * zoom, transform: `scale(${1/zoom})` }}
        >
        </div> */}
    </>;
});

export const CompPortEditor: React.FC<{
    portIdx: number;
    compPos: Vec3;
    schematicComp: IComp<ICompPortConfig> | null;
    port: ICompPort;
    draggingPortIdx: number | null;
    setDraggingPortIdx: (idx: number | null) => void;
}> = memo(function CompPortEditor({ portIdx, compPos, schematicComp, port, draggingPortIdx, setDraggingPortIdx }) {
    let { setEditorState } = useEditorContext();
    let { mtx, el } = useViewLayout();
    let [portEl, setPortEl] = useState<HTMLDivElement | null>(null);

    function evToModel(ev: IPointerEvent) {
        let bcr = el!.getBoundingClientRect();
        let ctxPos = new Vec3(ev.clientX - bcr.left, ev.clientY - bcr.top);
        return mtx.mulVec3Inv(ctxPos);
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(portEl, () => port.pos, function handleDrag(ev, ds, end) {
        let delta = evToModel(ev).sub(evToModel(ds));
        let newPos = ds.data.add(delta);
        setDraggingPortIdx(end ? null : portIdx);
        setEditorState(editLayout(end, snap => {
            return movePortToNewLocation(snap, portIdx, newPos);
        }));
    });

    let isInput = hasFlag(port.type, PortType.In);
    let pos = compPos.add(port.pos);

    let zoom = mtx.a;

    return <div
        ref={setPortEl}
        className={clsx(
            'x_compPortHit group absolute origin-top-left cursor-crosshair flex items-center justify-center pointer-events-auto',
            isNotNil(draggingPortIdx) && 'transition-transform',
        )}
        style={{ width: 12, height: 12, transform: `translate(${pos.x}px, ${pos.y}px) scale(${1/zoom}) translate(-50%, -50%)` }}
        onMouseDown={setDragStart}
    >
        <div
            className={clsx(
                'x_compPort absolute rounded-[5px] w-[10px] h-[10px] group-hover:shadow border border-black',
                isInput && 'bg-teal-400',
                !isInput && 'bg-orange-400',
            )}
        />
        {dragStart && <CursorDragOverlay className='cursor-crosshair' />}
    </div>;

});

function movePortToNewLocation(snap: IEditSnapshot, portIdx: number, newPos: Vec3): IEditSnapshot {

    let compSize = snap.compSize;
    // note that newPos is not rounded, and will need to be in this function

    // need to a) find the nearest edge position, and b) try to fit it into that edge
    // slots along an edge of length 4 are at positions 1, 2, 3, i.e excluding 0 and 4

    let xMin = 0.55;
    let xMax = compSize.x - 0.55;

    let yMin = 0.55;
    let yMax = compSize.y - 0.55;

    let bestEdge = 0;
    let bestPos: Vec3 | null = null;
    let bestDist = 0;

    for (let edge of [0, 1, 2, 3]) {
        let pos: Vec3;
        if (edge === 0) { // top
            pos = new Vec3(clamp(newPos.x, xMin, xMax), 0);
        } else if (edge === 1) { // right
            pos = new Vec3(compSize.x, clamp(newPos.y, yMin, yMax));
        } else if (edge === 2) { // bottom
            pos = new Vec3(clamp(newPos.x, xMin, xMax), compSize.y);
        } else { // left
            pos = new Vec3(0, clamp(newPos.y, yMin, yMax));
        }

        let dist = pos.dist(newPos);
        if (!bestPos || dist < bestDist) {
            bestPos = pos;
            bestEdge = edge;
            bestDist = dist;
        }
    }

    if (!bestPos) {
        return snap;
    }

    let fixedXPos = bestEdge === 1 || bestEdge === 3; // right or left
    let comparePos = bestEdge === 1 || bestEdge === 2 ? compSize : new Vec3(0, 0);

    let edgeLen = fixedXPos ? compSize.y : compSize.x;

    let portsOnEdge = snap.compPorts
        .map((a, i) => ({
            srcIdx: i,
            pos: a.pos,
            linePos: fixedXPos ? a.pos.y : a.pos.x,
        }))
        .filter(a => a.srcIdx !== portIdx)
        .filter(a => fixedXPos ? a.pos.x === comparePos.x : a.pos.y === comparePos.y);

    portsOnEdge = multiSortStableAsc(portsOnEdge, [a => a.linePos]);

    if (portsOnEdge.length >= edgeLen - 1) {
        // no room for this port
        return snap;
    }

    function tryMovePorts(startIdx: number, delta: number): number[] | null {
        if (startIdx < 0 || startIdx >= portsOnEdge.length) {
            return null;
        }

        // we'll insert at startIdx, and shift all ports after that by delta
        // if there's no room, we'll return false
        let deltas: number[] = portsOnEdge.map(() => 0);

        let prevPos = portsOnEdge[startIdx].linePos; // the position we need to move out from
        for (let i = startIdx; i >= 0 && i < portsOnEdge.length; i += delta) {
            let port = portsOnEdge[i];
            if (port.linePos !== prevPos) { // no need to move this port
                break;
            }
            deltas[i] = delta;
            let movedPos = port.linePos + delta;
            if (movedPos < 1 || movedPos > edgeLen - 1) {
                return null;
            }
            prevPos = movedPos;
        }

        return deltas;
    }

    let insertPos = fixedXPos ? bestPos.y : bestPos.x;

    let insertPosRounded = Math.round(insertPos);
    let matchIdx = portsOnEdge.findIndex(a => a.linePos === insertPosRounded);

    let newPorts = [...snap.compPorts];

    if (matchIdx >= 0) {
        // need to shift ports on the edge to make room for the new port
        // may need to shift either left or right, but the bestPos determines the order
        let matchPos = portsOnEdge[matchIdx].linePos;
        let deltas: number[] | null = null;
        if (true) {
            deltas = tryMovePorts(matchIdx, 1);
            if (!deltas) {
                deltas = tryMovePorts(matchIdx, -1);
                insertPosRounded -= 1;
            }
        } else {
            // this else case doesn't work that well, since it induces a bit of flickering when
            // dragging around (the if condition is whether we're on the left or right of the nearest port).
            deltas = tryMovePorts(matchIdx, -1);
            if (!deltas) {
                deltas = tryMovePorts(matchIdx, 1);
                insertPosRounded += 1;
            }
        }

        if (!deltas) {
            return snap;
        }

        // bestPos = bestPos.withSetAt(fixedXPos ? 1 : 0, insertPosRounded);

        for (let i = 0; i < portsOnEdge.length; i++) {
            let edgePort = portsOnEdge[i];
            let delta = deltas[i];
            if (delta !== 0) {
                let port = newPorts[edgePort.srcIdx];
                newPorts[edgePort.srcIdx] = assignImm(port, {
                    pos: port.pos.withAddAt(fixedXPos ? 1 : 0, delta),
                });
            }
        }
    }


    newPorts[portIdx] = assignImm(newPorts[portIdx], { pos: bestPos.round() });

    return assignImm(snap, { compPorts: newPorts });
}
