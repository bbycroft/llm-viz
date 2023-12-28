'use client';

import React, { SetStateAction, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import s from "./CpuCanvas.module.scss";
import { AffineMat2d } from "../utils/AffineMat2d";
import { applySetter, assignImm, getOrAddToMap, hasFlag, isNotNil } from "../utils/data";
import { IEditorContext, IViewLayoutContext, MyStoreContext, ViewLayoutContext, useCreateStoreState } from "./Editor";
import { RefType, IComp, PortType, ICompPort, ICanvasState, IEditorState, IExeSystem, ICompRenderArgs, ISchematic, ToolbarTypes, IEditSnapshot, IParentCompInfo } from "./CpuModel";
import { createExecutionModel, stepExecutionCombinatorial } from "./CpuExecution";
import { CompLibraryView } from "./CompLibraryView";
import { CompExampleView } from "./CompExampleView";
import { HoverDisplay } from "./HoverDisplay";
import { renderWire } from "./WireRender";
import { SchematicLibraryView } from "./schematics/SchematicLibraryView";
import { CanvasEventHandler } from "./CanvasEventHandler";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { CompLayoutToolbar } from "./CompLayoutEditor";
import { palette } from "./palette";
import { drawGrid, makeCanvasFont, shouldRenderComp, shouldRenderSubSchematic } from "./CanvasRenderHelpers";
import { computeSubLayoutMatrix, getCompSubSchematic } from "./SubSchematics";
import { compIsVisible, computeModelBoundingBox, computeZoomExtentMatrix, createCpuEditorState } from "./ModelHelpers";
import { MainToolbar } from "./toolbars/CpuToolbars";
import { SharedContextContext, createSharedContext } from "./library/SharedContext";
import { CompBoundingBox } from "./CompBoundingBox";
import { CompDetails } from "./CompDetails";
import { Resizer } from "../utils/Resizer";
import { SchematicDetails } from "./SchematicDetails";
import { CompPortFlags, ICompPortConfig, compPortDefId } from "./comps/CompPort";

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
                snapshot: assignImm(a.snapshot, {
                    mainSchematic: assignImm(a.snapshot.mainSchematic, {
                        comps: ctx.compLibrary.updateAllCompsFromDefs(a.snapshot.mainSchematic.comps),
                    }),
                }),
                needsZoomExtent: true,
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
                    needsZoomExtent: true,
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

                let mtx = computeZoomExtentMatrix(bb, new BoundingBox3d(new Vec3(readonly ? 0 : 330, readonly ? 50 : 0), new Vec3(bcr.width, bcr.height)), 0.05);
                return assignImm(a, { mtx, needsZoomExtent: false });
            });
        }
    }, [setEditorState, cvsState, editorState.needsZoomExtent, readonly, editorState.activeSchematicId]);

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
        cvsState.scale = 1.0 / editorState.mtx.a;
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
            <Resizer className="flex-1 flex flex-row" id={"cpu-tools-right"} defaultFraction={0.8}>
                <div className="relative touch-none flex-1 overflow-hidden shadow-inner-lg">
                    <canvas className="absolute touch-none w-full h-full" ref={setCanvasEl} />
                    {cvsState && <CanvasEventHandler cvsState={cvsState} embedded={embedded}>
                        <div className={"overflow-hidden absolute left-0 top-0 w-full h-full pointer-events-none"}>
                            <div
                                className={"absolute origin-top-left"}
                                style={{ transform: `matrix(${editorState.mtx.toTransformParams().join(',')})` }}>
                                {compDivs}
                                <CompBoundingBox />
                            </div>
                            {editorState.transparentComps && <div className="absolute w-full h-full pointer-events-auto top-0 left-0" />}
                        </div>
                    </CanvasEventHandler>}
                    <div className={s.toolsLeftTop}>
                        {!embedded && <>
                            <CompLibraryView />
                            <CompExampleView />
                            <SchematicLibraryView />
                        </>}
                        {!editorState.snapshotTemp && !editorState.maskHover && <HoverDisplay canvasEl={cvsState?.canvas ?? null} />}
                    </div>
                    {embedded && <div className="absolute left-2 top-2 pointer-events-auto shadow">
                        <MainToolbar readonly={readonly} toolbars={toolbars} />
                    </div>}
                    <div className="cls_toolsTopRight absolute top-0 right-0">
                        {!readonly && <CompLayoutToolbar />}
                    </div>
                    {editorState.compLibraryVisible && <LibraryBrowser />}
                    {children}
                </div>
                {!readonly && <div className="flex-1 flex flex-col border-t">
                    <SchematicDetails />
                    <CompDetails />
                </div>}
            </Resizer>
        </ViewLayoutContext.Provider>
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

function renderCpu(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix = '', parentInfo?: IParentCompInfo) {
    let ctx = cvs.ctx;
    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    drawGrid(editorState.mtx, ctx, cvs, '#aaa', !!idPrefix);

    for (let wire of layout.wires) {
        let exeNet = exeSystem.nets[exeSystem.lookup.wireIdToNetIdx.get(idPrefix + wire.id) ?? -1];
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
                fontSize: 1.6,
                lineHeight: 2.0,
                fillColor: isValidExe ? palette.compBg : "#aaa",
                strokeColor: isHover ? "#a00" : "#000",
                lineWidth: 1 * cvs.scale,
            },
            isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
        };

        let subSchematic = getCompSubSchematic(editorState, comp);

        function drawPath() {
            if (compDef?.renderCanvasPath) {
                compDef.renderCanvasPath(compRenderArgs);
            } else {
                ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
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
                renderCompPort(cvs, editorState, comp, node);
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

            let subCvs: ICanvasState = {
                ...cvs,
                mtx: cvs.mtx.mul(subMtx),
                scale: cvs.scale / subMtx.a,
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
            let px = comp.pos.x + (comp.size.x) / 2;
            let py = comp.pos.y + (comp.size.y) / 2;
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
        ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
    }
    ctx.strokeStyle = "#77f";
    ctx.lineWidth = 2 * cvs.scale;
    ctx.filter = "blur(1px)";
    ctx.stroke();
    ctx.restore();

    renderSelectRegion(cvs, editorState, idPrefix);

    if (idPrefix === '') {
        renderComponentBoundingBox(cvs, editorState, snapshot, idPrefix);
    }

    if (snapshot.mainSchematic.parentComp && idPrefix === '') {
        let mtx = computeSubLayoutMatrix(snapshot.mainSchematic.parentComp, snapshot.mainSchematic);
        let subMtx = mtx.inv();

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.transform(...subMtx.toTransformParams());

        let subCvs: ICanvasState = {
            ...cvs,
            mtx: cvs.mtx.mul(subMtx),
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

        let innerPos = subMtx.mulVec3Inv(parentComp.pos.add(parentPort.pos));

        parentInfo.linkedCompPorts.set(comp.id, { compPort: comp, port: parentPort, innerPos });
    }

    return parentInfo;
}

function renderParentComp(cvs: ICanvasState, editorState: IEditorState, comp: IComp) {
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
        editCtx: { idPrefix: "" },
        styles: {
            fontSize: 1.6,
            lineHeight: 2.0,
            fillColor: "#aaa",
            strokeColor: "#000",
            lineWidth: 1 * cvs.scale,
        },
        isActive: false,
    };


    ctx.beginPath();

    // the entire canvas
    ctx.save();
    ctx.transform(...cvs.mtx.inv().toTransformParams());
    ctx.rect(cvs.region.min.x, cvs.region.min.y, cvs.region.size().x, cvs.region.size().y);
    ctx.restore();

    if (compDef?.renderCanvasPath) {
        compDef.renderCanvasPath(compRenderArgs);
    } else {
        ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
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
        renderCompPort(cvs, editorState, comp, node);
    }

    ctx.restore();
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

function renderCompPort(cvs: ICanvasState, editorState: IEditorState, comp: IComp, node: ICompPort) {
    if (hasFlag(node.type, PortType.Hidden)) {
        return;
    }

    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.CompNode && hoverRef.id === comp.id && hoverRef.compNodeId === node.id;
    let type = node.type ?? 0;
    let isInput = (type & PortType.In) !== 0;
    let isTristate = (type & PortType.Tristate) !== 0;
    let ctx = cvs.ctx;
    let x = comp.pos.x + node.pos.x;
    let y = comp.pos.y + node.pos.y;

    let scale = Math.min(cvs.scale, 1 / 15);

    let r = 3 * scale;
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
        let textHeight = 12 * scale;
        ctx.font = makeCanvasFont(textHeight);
        ctx.textAlign = (isTop || isBot) ? 'center' : isLeft ? 'start' : 'end';
        ctx.textBaseline = (isLeft || isRight) ? "middle" : isTop ? 'top' : 'bottom';
        ctx.fillStyle = "#000";
        let deltaAmt = 8 * scale;
        let deltaX = isLeft ? deltaAmt : isRight ? -deltaAmt : 0;
        let deltaY = isTop ? deltaAmt : isBot ? -deltaAmt : 0;
        ctx.fillText(text, x + deltaX, y + deltaY);
    }
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
