'use client';

import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { AffineMat2d } from "../utils/AffineMat2d";
import { assignImm, isNotNil } from "../utils/data";
import { IViewLayoutContext, MyStoreContext, ViewLayoutContext, useCreateStoreState } from "./Editor";
import { RefType, ICanvasState, IEditorState, IExeSystem, ISchematic, ToolbarTypes } from "./CpuModel";
import { createExecutionModel, stepExecutionCombinatorial } from "./CpuExecution";
import { HoverDisplay } from "./HoverDisplay";
import { CanvasEventHandler } from "./CanvasEventHandler";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { CompLayoutToolbar } from "./CompLayoutEditor";
import { makeCanvasFont, scaleFromMtx } from "./render/CanvasRenderHelpers";
import { computeSubLayoutMatrix, getCompSubSchematic } from "./SubSchematics";
import { compIsVisible, computeModelBoundingBox, computeZoomExtentMatrix, createCpuEditorState } from "./ModelHelpers";
import { MainToolbar } from "./toolbars/CpuToolbars";
import { SharedContextContext, createSharedContext } from "./library/SharedContext";
import { CompBoundingBox, InnerDisplayBoundingBox } from "./CompBoundingBox";
import { Resizer } from "../utils/Resizer";
import { SchematicDetails } from "./sidebars/SchematicDetails";
import { WireRenderCache } from "./render/WireRenderCache";
import { LeftSidebar } from "./sidebars/LeftSidebar";
import { SaveLoadHandler } from "./SaveLoadHandler";
import { renderSchematic } from "./render/SchematicRender";
import { SelectionDetails } from "./sidebars/SelectionDetails";
import { WireLabelEdit } from "./render/WireLabelEdit";

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
        renderSchematic(cvsState, editorState, (editorState.snapshotTemp ?? editorState.snapshot).mainSchematic, exeModel);
        // renderDragState(cvsState, editorState, dragStart, grabDirRef.current);
        ctx.restore();

        ctx.restore();

        cvsState.t += 1;
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

    function getSchematicDomElements(schematic: ISchematic, idPrefix: string) {
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
                        {getSchematicDomElements(subSchematic, idPrefix + a.comp.id + '|')}
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
                        portBindingLookup: new Map(),
                        bb: a.comp.bb,
                    }) ?? null}
                    {subLayoutDom}
                </React.Fragment>;
        });

        let wireLabelEl: React.ReactNode = null;

        if (singleElRef?.type === RefType.WireLabel) {
            let wireLabel = schematic.wireLabels.find(a => idPrefix + a.id === singleElRef!.id);
            if (wireLabel) {
                wireLabelEl = <WireLabelEdit cvs={cvsState!} editCtx={{ idPrefix }} wireLabel={wireLabel} />;
            }
        }

        return <>
            {comps}
            {wireLabelEl}
        </>;
    }

    let schematicDomEls = getSchematicDomElements((editorState.snapshotTemp ?? editorState.snapshot).mainSchematic, '');

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
                                    {schematicDomEls}
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
                    <SelectionDetails />
                </div>}
            </Resizer>
        </ViewLayoutContext.Provider>
        {!readonly && <SaveLoadHandler />}
    </MyStoreContext.Provider>;
};
