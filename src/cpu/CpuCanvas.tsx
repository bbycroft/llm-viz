'use client';

import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { AffineMat2d } from "../utils/AffineMat2d";
import { assignImm, getOrAddToMap, hasFlag, isNotNil } from "../utils/data";
import { IViewLayoutContext, MyStoreContext, ViewLayoutContext, useCreateStoreState } from "./Editor";
import { RefType, IComp, PortType, ICompPort, ICanvasState, IEditorState, IExeSystem, ICompRenderArgs, ISchematic, ToolbarTypes, IEditSnapshot, IParentCompInfo, IWireRenderInfo, IWirePortBinding } from "./CpuModel";
import { createExecutionModel, stepExecutionCombinatorial } from "./CpuExecution";
import { HoverDisplay } from "./HoverDisplay";
import { renderWire } from "./WireRender";
import { CanvasEventHandler } from "./CanvasEventHandler";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { CompLayoutToolbar } from "./CompLayoutEditor";
import { palette } from "./palette";
import { drawGrid, makeCanvasFont, scaleFromMtx, shouldRenderComp } from "./CanvasRenderHelpers";
import { computeSubLayoutMatrix, getCompSubSchematic } from "./SubSchematics";
import { compIsVisible, computeModelBoundingBox, computeZoomExtentMatrix, createCpuEditorState } from "./ModelHelpers";
import { MainToolbar } from "./toolbars/CpuToolbars";
import { SharedContextContext, createSharedContext } from "./library/SharedContext";
import { CompBoundingBox, InnerDisplayBoundingBox } from "./CompBoundingBox";
import { CompDetails } from "./sidebars/CompDetails";
import { Resizer } from "../utils/Resizer";
import { SchematicDetails } from "./sidebars/SchematicDetails";
import { CompPortFlags, ICompPortConfig, compPortDefId } from "./comps/CompPort";
import { WireRenderCache } from "./WireRenderCache";
import { rotateCompPortPos, rotatePos } from "./comps/CompHelpers";
import { LeftSidebar } from "./sidebars/LeftSidebar";
import { SaveLoadHandler } from "./SaveLoadHandler";

export const CpuCanvas: React.FC<{
    embedded?: boolean;
    readonly?: boolean;
    schematicId?: string;
    toolbars?: ToolbarTypes[],
    children?: React.ReactNode;
}> = ({ schematicId, readonly, embedded, toolbars, children }) => {
    let [cvsState, setCvsState] = useState<ICanvasState | null>(null);
    let sharedContext = useContext(SharedContextContext);
    // let [lsState, setLsState] = useLocalStorageState("cpu-layout", hydrateFromLS);
    let [editorState, setEditorState, editorStore] = useCreateStoreState<IEditorState>(() => {
        return createCpuEditorState(sharedContext);
    });

    let [, redraw] = useReducer((x) => x + 1, 0);

    let [isClient, setIsClient] = useState(false);
    useEffect(() => setIsClient(true), []);

    // let initialLoad = useRef(true);
    // useEffect(() => {
    //     if (initialLoad.current) {
    //         initialLoad.current = false;
    //         setEditorState(a => assignImm(a, {
    //             snapshot: wiresFromLsState(a.snapshot, lsState, a.compLibrary),
    //             needsZoomExtent: true,
    //         }));
    //     }
    // }, [lsState]);

    useEffect(() => {
        if (schematicId) {
            setEditorState(a => assignImm(a, { desiredSchematicId: schematicId ?? null }));
        }
    }, [setEditorState, schematicId]);


    useEffect(() => {
        // setCtrlDown(false);
        let ctx = sharedContext ?? createSharedContext();
        setEditorState(a => {
            return assignImm(a, {
                sharedContext: ctx,
                codeLibrary: ctx.codeLibrary,
                schematicLibrary: ctx.schematicLibrary,
                compLibrary: ctx.compLibrary,
                wireRenderCache: new WireRenderCache(),
                snapshot: assignImm(a.snapshot, {
                    mainSchematic: assignImm(a.snapshot.mainSchematic, {
                        comps: ctx.compLibrary.updateAllCompsFromDefs(a.snapshot.mainSchematic.comps),
                    }),
                }),
                needsZoomExtent: false,
            });
        });
    }, [setEditorState, sharedContext]);

    useEffect(() => {
        if (editorState.activeSchematicId !== editorState.desiredSchematicId && editorState.desiredSchematicId && editorState.schematicLibrary.localStorageSchematicsLoaded) {
            const schematic = editorState.schematicLibrary.getSchematic(editorState.desiredSchematicId);

            if (schematic) {
                setEditorState(a => assignImm(a, {
                    activeSchematicId: schematic.id,
                    snapshot: schematic.snapshot,
                    undoStack: schematic.undoStack ?? [],
                    redoStack: schematic.redoStack ?? [],
                    mtx: schematic.mtx ?? new AffineMat2d(),
                    needsZoomExtent: true, // schematic.id !== editorState.activeSchematicId,
                }));
            } else {
                setEditorState(a => assignImm(a, {
                    desiredSchematicId: null,
                }));
            }
        }
    }, [setEditorState, editorState.desiredSchematicId, editorState.schematicLibrary, editorState.activeSchematicId, editorState.schematicLibrary.localStorageSchematicsLoaded]);

    useLayoutEffect(() => {
        if (cvsState && editorState.activeSchematicId) {
            let bcr = cvsState.canvas.getBoundingClientRect();
            setEditorState(a => {
                // goal: zoom-extent so the canvas fits the entire schematic
                if (!a.needsZoomExtent) {
                    return a;
                }
                let bb = computeModelBoundingBox(a.snapshot);

                if (bb.empty) {
                    bb = new BoundingBox3d(new Vec3(0, 0), new Vec3(20, 20));
                }

                let mtx = computeZoomExtentMatrix(bb, new BoundingBox3d(new Vec3(0, embedded ? 50 : 0), new Vec3(bcr.width, bcr.height)), embedded ? 0 : 0.01, 15);
                return assignImm(a, { mtx, needsZoomExtent: false });
            });
        }
    }, [setEditorState, cvsState, editorState.needsZoomExtent, readonly, editorState.activeSchematicId, embedded]);

    useResizeChangeHandler(cvsState?.canvas?.parentElement, redraw);

    let prevExeModel = useRef<{ system: IExeSystem, id: string | null } | null>(null);

    let exeModel = useMemo(() => {
        let prev = prevExeModel.current;
        let sameId = prev && prev.id === editorState.activeSchematicId;

        let model = createExecutionModel(editorState.sharedContext, editorState.snapshot, prev && sameId ? prev.system : null);

        if (isClient) {
            stepExecutionCombinatorial(model);
        }

        return model;
    }, [editorState.sharedContext, editorState.snapshot, editorState.activeSchematicId, isClient]);

    prevExeModel.current = { system: exeModel, id: editorState.activeSchematicId };

    useEffect(() => {

        setEditorState(a => assignImm(a, {
            exeModel,
            exeModelUpdateCntr: a.exeModelUpdateCntr + 1,
        }));
    }, [exeModel, setEditorState]);

    let setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {
        setCvsState(el ? {
            canvas: el,
            ctx: el.getContext('2d')!,
            size: new Vec3(1, 1),
            scale: 1,
            region: new BoundingBox3d(new Vec3(0, 0), new Vec3(1, 1)),
            tileCanvases: new Map(),
            mtx: AffineMat2d.identity(),
            t: 0,
            rafHandle: 0,
        } : null);
    }, []);

    // useEffect(() => {
    //     let newState = wiresToLsState(editorState.snapshot);
    //     setLsState(a => assignImm(a, newState));
    //     let strExport = exportData(editorState.snapshot);
    //     localStorage.setItem("cpu-layout-str", strExport);
    //     // importData(strExport);
    // }, [editorState.snapshot, setLsState]);

    function renderAll(timestamp: number) {
        if (!cvsState) {
            return;
        }

        let swCanvasRenderStart = performance.now();
        let { canvas, ctx } = cvsState;

        let bcr = canvas.parentElement!.getBoundingClientRect();
        let w = bcr.width;
        let h = bcr.height;

        let wS = Math.floor(w * window.devicePixelRatio);
        let hS = Math.floor(h * window.devicePixelRatio);
        if (canvas.width !== wS || canvas.height !== hS) {
            canvas.width = wS;
            canvas.height = hS;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
        }
        cvsState.size.x = w;
        cvsState.size.y = h;
        cvsState.region = new BoundingBox3d(new Vec3(0, 0), new Vec3(w, h));
        cvsState.scale = scaleFromMtx(editorState.mtx);
        cvsState.mtx = editorState.mtx;
        let pr = window.devicePixelRatio;

        ctx.reset();
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(pr, pr);

        ctx.transform(...editorState.mtx.toTransformParams());
        ctx.save();
        renderCpu(cvsState, editorState, (editorState.snapshotTemp ?? editorState.snapshot).mainSchematic, exeModel);
        // renderDragState(cvsState, editorState, dragStart, grabDirRef.current);
        ctx.restore();

        ctx.restore();

        ctx.save();
        ctx.scale(pr, pr);
        let swCanvasRender = performance.now() - swCanvasRenderStart;
        ctx.font = makeCanvasFont(12);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = "#000";
        ctx.fillText(`${swCanvasRender.toFixed(1)}ms`, w - 5, h - 5);
        ctx.restore();

        cancelAnimationFrame(cvsState.rafHandle);
        // cvsState.rafHandle = requestAnimationFrame(renderAll);
    };

    useLayoutEffect(() => {
        cancelAnimationFrame(cvsState?.rafHandle ?? 0);
        renderAll(performance.now());
    });

    useEffect(() => {
        if (cvsState) {
            return () => {
                cancelAnimationFrame(cvsState!.rafHandle);
            };
        }
    }, [cvsState]);

    // let ctx: IEditorContext = useMemo(() => {
    //     return { editorState, setEditorState, exeModel };
    // }, [editorState, setEditorState, exeModel]);

    let singleElRef = editorState.snapshot.selected.length === 1 ? editorState.snapshot.selected[0] : null;

    let numEls = 0;

    function getCompDomElements(schematic: ISchematic, idPrefix: string) {
        let comps = schematic.comps
            .map(comp => {
                let def = editorState.compLibrary.getCompDef(comp.defId)!;
                return (def.renderDom || def.subLayout || comp.subSchematicId) && cvsState && compIsVisible(comp, idPrefix) ? {
                    comp,
                    def,
                    renderDom: def.renderDom,
                } : null;
            })
            .filter(isNotNil)
            .map(a => {
                cvsState!.mtx = editorState.mtx;
                let compFullId = idPrefix + a.comp.id;
                numEls += 1;

                let subLayoutDom = null;
                let subSchematic = getCompSubSchematic(editorState, a.comp);
                if (subSchematic) {
                    let subMtx = computeSubLayoutMatrix(a.comp, subSchematic);

                    subLayoutDom = <div
                        className={"absolute origin-top-left"}
                        style={{ transform: `matrix(${subMtx.toTransformParams().join(',')})` }}
                    >
                        {getCompDomElements(subSchematic, idPrefix + a.comp.id + '|')}
                    </div>;
                }

                return <React.Fragment key={a.comp.id}>
                    {a.renderDom?.({
                        comp: a.comp,
                        ctx: cvsState?.ctx!,
                        cvs: cvsState!,
                        editCtx: { idPrefix },
                        exeComp: exeModel.comps[exeModel.lookup.compIdToIdx.get(compFullId) ?? -1],
                        styles: null!,
                        isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
                        bb: a.comp.bb,
                    }) ?? null}
                    {subLayoutDom}
                </React.Fragment>;

        });

        return <>
            {comps}
        </>;
    }

    let compDivs = getCompDomElements((editorState.snapshotTemp ?? editorState.snapshot).mainSchematic, '');

    // console.log('numEls = ', numEls);

    let viewLayout = useMemo<IViewLayoutContext>(() => {
        return { el: cvsState?.canvas ?? null!, mtx: editorState.mtx };
    }, [cvsState, editorState.mtx]);

    return <MyStoreContext.Provider value={editorStore}>
        <ViewLayoutContext.Provider value={viewLayout}>
            {!embedded && <MainToolbar readonly={readonly} toolbars={toolbars} />}
            <Resizer className="flex-1 flex flex-row" id={"cpu-tools-right"} defaultAmt={250} fixedWidthRight>
                <Resizer className="flex-1 flex flex-row" id={"cpu-tools-left"} defaultAmt={280} fixedWidthLeft>
                    {!embedded && <LeftSidebar />}
                    <div className="relative touch-none flex-1 overflow-hidden shadow-inner-lg">
                        <canvas className="absolute touch-none w-full h-full" ref={setCanvasEl} />
                        {cvsState && <CanvasEventHandler cvsState={cvsState} embedded={embedded}>
                            <div className={"overflow-hidden absolute left-0 top-0 w-full h-full pointer-events-none"}>
                                <div
                                    className={"absolute origin-top-left"}
                                    style={{ transform: `matrix(${editorState.mtx.toTransformParams().join(',')})` }}>
                                    {compDivs}
                                    <CompBoundingBox />
                                    <InnerDisplayBoundingBox />
                                </div>
                                {editorState.transparentComps && <div className="absolute w-full h-full pointer-events-auto top-0 left-0" />}
                            </div>
                        </CanvasEventHandler>}
                        {!editorState.snapshotTemp && !editorState.maskHover && <HoverDisplay canvasEl={cvsState?.canvas ?? null} />}
                        {embedded && <div className="absolute left-2 top-2 pointer-events-auto shadow">
                            <MainToolbar readonly={readonly} toolbars={toolbars} />
                        </div>}
                        <div className="cls_toolsTopRight absolute top-0 right-0">
                            {!readonly && <CompLayoutToolbar />}
                        </div>
                        {editorState.compLibraryVisible && <LibraryBrowser />}
                        {children}
                    </div>
                </Resizer>
                {!readonly && <div className="flex-1 flex flex-col border-t">
                    <SchematicDetails />
                    <CompDetails />
                </div>}
            </Resizer>
        </ViewLayoutContext.Provider>
        {!readonly && <SaveLoadHandler />}
    </MyStoreContext.Provider>;
};

function renderAxes(cvs: ICanvasState, editorState: IEditorState) {
    let ctx = cvs.ctx;
    ctx.save();
    ctx.lineWidth = 4 * cvs.scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(4, 0);
    ctx.strokeStyle = "#f00";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 4);
    ctx.strokeStyle = "#0f0";
    ctx.stroke();
    ctx.restore();
}

const innerOffset = 0.5;
const fontSize = 1.1;
const lineHeight = 1.4;

interface IWirePortInfo {
    wireInfo: IWireRenderInfo;
    portInfo: IWirePortBinding;
}

function renderCpu(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix = '', parentInfo?: IParentCompInfo) {
    let ctx = cvs.ctx;
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    drawGrid(editorState.mtx, ctx, cvs, '#aaa', !!idPrefix);

    let portBindingLookup = new Map<string, IWirePortInfo>();

    for (let wire of layout.wires) {
        let exeNet = exeSystem.nets[exeSystem.lookup.wireIdToNetIdx.get(idPrefix + wire.id) ?? -1];

        let wireInfo = editorState.wireRenderCache.lookupWire(editorState, idPrefix, wire);
        for (let [key, info] of wireInfo.portBindings) {
            portBindingLookup.set(key, { wireInfo, portInfo: info });
        }

        renderWire(cvs, editorState, wire, exeNet, exeSystem, idPrefix, parentInfo);
    }

    let compIdxToExeOrder = new Map<number, number[]>();
    let idx = 0;
    for (let step of exeSystem.executionSteps) {
        getOrAddToMap(compIdxToExeOrder, step.compIdx, () => []).push(idx++);
    }

    let singleElRef = editorState.snapshot.selected.length === 1 ? editorState.snapshot.selected[0] : null;

    ctx.save();
    ctx.globalAlpha = editorState.transparentComps ? 0.5 : 1.0;
    for (let comp of layout.comps) {
        let compFullId = idPrefix + comp.id;
        let exeCompIdx = exeSystem.lookup.compIdToIdx.get(compFullId) ?? -1;
        let exeComp = exeSystem.comps[exeCompIdx];
        let compDef = editorState.compLibrary.getCompDef(comp.defId);

        if (!compIsVisible(comp, idPrefix)) {
            continue;
        }

        let [compVisible, compPortsVisible, subSchematicVisible] = shouldRenderComp(comp, cvs);

        if (!compVisible) {
            continue;
        }

        let isHover = editorState.hovered?.ref.type === RefType.Comp && editorState.hovered.ref.id === compFullId;

        let isValidExe = !!exeComp;
        ctx.fillStyle = isValidExe ? palette.compBg : "#aaa";
        ctx.strokeStyle = isHover ? "#444" : "#000";
        ctx.lineWidth = (isHover ? 2 : 1) * cvs.scale;

        let compRenderArgs: ICompRenderArgs<any> = {
            comp,
            ctx,
            cvs,
            exeComp,
            editCtx: { idPrefix },
            styles: {
                fontSize: fontSize,
                lineHeight: lineHeight,
                fillColor: isValidExe ? palette.compBg : "#aaa",
                strokeColor: isHover ? "#a00" : "#000",
                lineWidth: 1 * cvs.scale,
            },
            bb: comp.bb,
            isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
        };

        let subSchematic = getCompSubSchematic(editorState, comp);

        if (subSchematic && subSchematicVisible && subSchematic.innerDisplayBbox) {
            let subMtx = computeSubLayoutMatrix(comp, subSchematic);
            compRenderArgs.bb = subMtx.mulBb(subSchematic.innerDisplayBbox);
        }

        function drawPath() {
            if (compDef?.renderCanvasPath) {
                compDef.renderCanvasPath(compRenderArgs);
            } else {
                defaultCanvasPath(ctx, comp);
            }
        }

        if (isHover) {
            ctx.beginPath();
            drawPath();
            ctx.save();
            // ctx.globalAlpha = 0.2;
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2 * cvs.scale;
            ctx.filter = "blur(2px)";
            ctx.stroke();
            ctx.restore();
        }

        if (subSchematic && subSchematicVisible) {
            ctx.beginPath();
            drawPath();
            ctx.save();
            ctx.fillStyle = "#fff";
            ctx.fill('evenodd');
            ctx.clip('evenodd');

            ctx.filter = "blur(4px)";
            ctx.lineWidth = 8 * cvs.scale;
            ctx.strokeStyle = compRenderArgs.styles.fillColor;
            ctx.stroke(); // stroke the inside

            ctx.restore();

            ctx.stroke(); // stroke the outline

        } else {
            ctx.beginPath();
            drawPath();
            ctx.fill('evenodd');
            ctx.stroke();
        }

        if (compPortsVisible) {
            if (compDef?.render) {
                compDef.render(compRenderArgs);
            } else if (compDef?.renderDom) {
                // handled elsewhere
            } else {
                /*
                let text = comp.name;
                let textHeight = 3;
                ctx.font = makeCanvasFont(textHeight / 4);
                ctx.textAlign = 'center';
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#000";
                ctx.fillText(text, comp.pos.x + (comp.size.x) / 2, comp.pos.y + (comp.size.y) / 2);
                */
            }

            for (let node of comp.ports) {
                renderCompPort(cvs, editorState, idPrefix, comp, node, portBindingLookup);
            }
        }

        if (subSchematicVisible && compDef && subSchematic) {
            // nested rendering!!!!

            ctx.save();
            ctx.beginPath();
            drawPath();
            ctx.clip('evenodd');

            let subMtx = computeSubLayoutMatrix(comp, subSchematic);

            ctx.transform(...subMtx.toTransformParams());

            let innerMtx = cvs.mtx.mul(subMtx.inv());
            let newMtx = cvs.mtx.mul(subMtx);

            let subCvs: ICanvasState = {
                ...cvs,
                mtx: newMtx,
                scale: scaleFromMtx(newMtx),
                region: innerMtx.mulBb(new BoundingBox3d(comp.pos, comp.pos.add(comp.size))),
            };

            let parentInfo = constructParentCompInfo(comp, subSchematic, subMtx);

            renderCpu(subCvs, editorState, subSchematic, exeSystem, idPrefix + comp.id + '|', parentInfo);

            ctx.restore();
        }

        if (editorState.showExeOrder) {
            let orders = compIdxToExeOrder.get(exeCompIdx) ?? [];
            let text = orders.join(', ');
            ctx.save();
            ctx.fillStyle = "#a3a";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3 * cvs.scale;
            ctx.font = makeCanvasFont(30 * cvs.scale);
            ctx.textAlign = 'center';
            ctx.textBaseline = "middle";
            let px = comp.bb.center().x;
            let py = comp.bb.center().y;
            // ctx.filter = "blur(1px)";
            ctx.strokeText(text, px, py);
            // ctx.filter = "none";
            ctx.fillText(text, px, py);
            ctx.restore();
        }
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    let selectedCompSet = new Set(editorState.snapshot.selected.filter(a => a.type === RefType.Comp).map(a => a.id));
    for (let comp of layout.comps.filter(c => selectedCompSet.has(idPrefix + c.id))) {
        defaultCanvasPath(ctx, comp);
    }
    ctx.strokeStyle = "#77f";
    ctx.lineWidth = 2 * cvs.scale;
    ctx.filter = "blur(1px)";
    ctx.stroke();
    ctx.restore();

    renderSelectRegion(cvs, editorState, idPrefix);

    if (idPrefix === '') {
        renderComponentBoundingBox(cvs, editorState, snapshot, idPrefix);
        renderInnerDisplayBoundingBox(cvs, editorState, snapshot, idPrefix);
    }

    if (snapshot.mainSchematic.parentComp && idPrefix === '') {
        let mtx = computeSubLayoutMatrix(snapshot.mainSchematic.parentComp, snapshot.mainSchematic);
        let subMtx = mtx.inv();

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.transform(...subMtx.toTransformParams());
        let newMtx = cvs.mtx.mul(subMtx);

        let subCvs: ICanvasState = {
            ...cvs,
            mtx: newMtx,
            scale: cvs.scale / subMtx.a,
        };

        renderParentComp(subCvs, editorState, snapshot.mainSchematic.parentComp);

        ctx.restore();
    }

    // renderAxes(cvs, editorState);
}

function constructParentCompInfo(parentComp: IComp, subSchematic: ISchematic, subMtx: AffineMat2d): IParentCompInfo {
    let parentInfo: IParentCompInfo = {
        comp: parentComp,
        parentToInnerMtx: subMtx,
        linkedCompPorts: new Map(),
    };

    let parentPortsById = new Map<string, ICompPort>(parentComp.ports.map(a => [a.id, a]));

    for (let comp of subSchematic.comps) {
        if (comp.defId !== compPortDefId) {
            continue;
        }
        let args = comp.args as ICompPortConfig;

        if (!hasFlag(args.flags, CompPortFlags.HiddenInParent) || !hasFlag(args.flags, CompPortFlags.NearParentPort)) {
            continue;
        }

        let parentPort = parentPortsById.get(args.portId);

        if (!parentPort) {
            continue;
        }

        let innerPos = subMtx.mulVec3Inv(parentComp.pos.add(parentPort.pos).add(new Vec3(0.0, 0.0)));

        parentInfo.linkedCompPorts.set(comp.id, { compPort: comp, port: parentPort, innerPos });
    }

    return parentInfo;
}

function renderParentComp(cvs: ICanvasState, editorState: IEditorState, comp: IComp) {
    let idPrefix = "";
    let ctx = cvs.ctx;
    let compDef = editorState.compLibrary.getCompDef(comp.defId);
    let isValidExe = false;
    ctx.save();

    ctx.fillStyle = isValidExe ? palette.compBg : "#aaa";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1 * cvs.scale;

    let compRenderArgs: ICompRenderArgs<any> = {
        comp,
        ctx,
        cvs,
        exeComp: null as any,
        editCtx: { idPrefix },
        styles: {
            fontSize: fontSize,
            lineHeight: lineHeight,
            fillColor: "#aaa",
            strokeColor: "#000",
            lineWidth: 1 * cvs.scale,
        },
        bb: comp.bb,
        isActive: false,
    };


    ctx.beginPath();

    // the entire canvas
    ctx.save();
    ctx.transform(...cvs.mtx.inv().toTransformParams());
    let region = cvs.region.clone().expandInPlace(10);
    ctx.rect(region.min.x, region.min.y, region.size().x, region.size().y);
    ctx.restore();

    if (compDef?.renderCanvasPath) {
        compDef.renderCanvasPath(compRenderArgs);
    } else {
        defaultCanvasPath(ctx, comp);
    }
    ctx.fill('evenodd');
    ctx.stroke();

    // if (compDef?.render) {
    //     compDef.render(compRenderArgs);
    // } else if (compDef?.renderDom) {
    //     // handled elsewhere
    // } else {
    //     let text = comp.name;
    //     let textHeight = 3;
    //     ctx.font = makeCanvasFont(textHeight / 4);
    //     ctx.textAlign = 'center';
    //     ctx.textBaseline = "middle";
    //     ctx.fillStyle = "#000";
    //     ctx.fillText(text, comp.pos.x + (comp.size.x) / 2, comp.pos.y + (comp.size.y) / 2);
    // }

    for (let node of comp.ports) {
        renderCompPort(cvs, editorState, idPrefix, comp, node, new Map());
    }

    ctx.restore();
}

function defaultCanvasPath(ctx: CanvasRenderingContext2D, comp: IComp<any>) {
    let x = comp.bb.min.x;
    let y = comp.bb.min.y;
    ctx.rect(x, y, comp.bb.max.x - x, comp.bb.max.y - y);
}

function renderSelectRegion(cvs: ICanvasState, editorState: IEditorState, idPrefix: string) {

    if (!editorState.selectRegion || editorState.selectRegion.idPrefix !== idPrefix) {
        return;
    }

    let region = editorState.selectRegion;
    let ctx = cvs.ctx;
    let p0 = region.bbox.min; // editorState.mtx.mulVec3Inv(region.min);
    let p1 = region.bbox.max; // editorState.mtx.mulVec3Inv(region.max);

    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1 * cvs.scale;
    ctx.beginPath();
    ctx.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.stroke();
    ctx.restore();
}

/*
function renderDragState(cvs: ICanvasState, editorState: IEditorState, dragStart: IDragStart<ICanvasDragState> | null, dragDir: Vec3 | null) {
    let ctx = cvs.ctx;
    if (!dragStart || !dragStart.data.hovered) {
        return;
    }

    let hover = dragStart.data.hovered;

    if (hover.ref.type === RefType.WireSeg && !isNil(hover.ref.wireNode0Id) && isNil(hover.ref.wireNode1Id)) {
        let wireNodeId = hover.ref.wireNode0Id;
        let node = editorState.snapshot.wires.find(w => w.id === hover.ref.id)?.nodes[wireNodeId!];

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
*/

function renderCompPort(cvs: ICanvasState, editorState: IEditorState, idPrefix: string, comp: IComp, port: ICompPort, lookup: Map<string, IWirePortInfo>) {
    if (hasFlag(port.type, PortType.Hidden)) {
        return;
    }

    let info = lookup.get(comp.id + ':' + port.id);

    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.CompNode && hoverRef.id === comp.id && hoverRef.compNodeId === port.id;
    let type = port.type ?? 0;
    let isInput = (type & PortType.In) !== 0;
    let isTristate = (type & PortType.Tristate) !== 0;
    let ctx = cvs.ctx;

    let portPos = rotateCompPortPos(comp, port);

    let x = comp.pos.x + port.pos.x;
    let y = comp.pos.y + port.pos.y;

    //
    let innerOffset = 0.5;
    let innerPos = new Vec3(port.pos.x, port.pos.y);
    if (port.pos.x === 0) {
        innerPos.x += innerOffset;
    } else if (port.pos.x === comp.size.x) {
        innerPos.x -= innerOffset;
    } else if (port.pos.y === 0) {
        innerPos.y += innerOffset;
    } else if (port.pos.y === comp.size.y) {
        innerPos.y -= innerOffset;
    }

    innerPos = rotatePos(comp.rotation, innerPos).add(comp.pos);

    let scale = Math.min(cvs.scale, 1 / 15);

    ctx.save();
    ctx.beginPath();
    // ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.moveTo(portPos.x, portPos.y);
    ctx.lineTo(innerPos.x, innerPos.y);

    if (info) {
        let noFlowColor = '#D3D3D3';
        let zeroFlowColor = '#fec44f';
        let nonZeroFlowColor = '#d95f0e';
        let flowColor = info.wireInfo.isNonZero ? nonZeroFlowColor : zeroFlowColor;

        ctx.lineCap = "round";
        ctx.lineWidth = info.wireInfo.width * cvs.scale;
        let isFlow = info.wireInfo.flowNodes.has(info.portInfo.nodeId);
        ctx.strokeStyle = isFlow ? flowColor : noFlowColor;
        ctx.stroke();


        let r = Math.max(3, info.wireInfo.width) * cvs.scale * 0.5;
        ctx.beginPath();
        ctx.arc(innerPos.x, innerPos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#000';
        ctx.globalAlpha = 0.7;
        ctx.fill();

    } else {
        ctx.strokeStyle = isHover ? "#f00" : "#000";
        ctx.stroke();
    }
    // ctx.fillStyle = isInput ? "#fff" : isTristate ? "#a3f" : "#00fa";
    // ctx.fill();

    if (port.name) {
        // ALL BROKEN with rotation
        let isTop = port.pos.y === 0;
        let isBot = port.pos.y === comp.size.y;
        let isLeft = port.pos.x === 0;
        let isRight = port.pos.x === comp.size.x;
        if (isTop || isBot) {
            let px = innerPos.x;
            let py = innerPos.y;
            ctx.translate(px, py);
            ctx.rotate(Math.PI / 2);
            ctx.translate(-px, -py);
        }

        let text = port.name;
        let textHeight = 12 * scale;
        ctx.font = makeCanvasFont(textHeight);
        ctx.textAlign = isTop ? 'end' : isBot ? 'start' : isLeft ? 'end' : 'start';
        ctx.textBaseline = (isLeft || isRight) ? "top" : isTop ? 'bottom' : 'bottom';
        ctx.fillStyle = "#000";
        let deltaX = isTop ? -0.1 : isBot ? 0.1 : isLeft ? 0.4 : isRight ? -0.4 : 0;
        let deltaY = (isLeft || isRight) ? 0.2 : isTop ? 0.4 : isBot ? -0.6 : 0;
        ctx.fillText(text, x + deltaX, y + deltaY);
    }
    ctx.restore();
}

function renderComponentBoundingBox(cvs: ICanvasState, editorState: IEditorState, layout: IEditSnapshot, idPrefix: string) {
    let ctx = cvs.ctx;
    ctx.save();

    let bb = layout.mainSchematic.compBbox;
    let size = bb.size();
    ctx.beginPath();
    ctx.rect(bb.min.x, bb.min.y, size.x, size.y);

    ctx.lineWidth = 1 * cvs.scale;
    ctx.strokeStyle = "#000";
    ctx.stroke();

    ctx.restore();
}

function renderInnerDisplayBoundingBox(cvs: ICanvasState, editorState: IEditorState, layout: IEditSnapshot, idPrefix: string) {
    let ctx = cvs.ctx;
    ctx.save();

    let bb = layout.mainSchematic.innerDisplayBbox;

    if (!bb) {
        return;
    }

    let size = bb.size();
    ctx.beginPath();
    ctx.rect(bb.min.x, bb.min.y, size.x, size.y);

    ctx.lineWidth = 1 * cvs.scale;
    ctx.strokeStyle = "#77f";
    ctx.stroke();

    ctx.restore();
}
