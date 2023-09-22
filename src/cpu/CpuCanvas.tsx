import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useResizeChangeHandler } from "../utils/layout";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import s from "./CpuCanvas.module.scss";
import { AffineMat2d } from "../utils/AffineMat2d";
import { IDragStart } from "../utils/pointer";
import { assignImm, getOrAddToMap, isNil, isNotNil } from "../utils/data";
import { EditorContext, IEditorContext, IViewLayoutContext, ViewLayoutContext } from "./Editor";
import { RefType, IComp, PortType, ICompPort, ICanvasState, IEditorState, IHitTest, IEditSnapshot, IExeSystem, ICompRenderArgs, ISchematic } from "./CpuModel";
import { useLocalStorageState } from "../utils/localstorage";
import { createExecutionModel, stepExecutionCombinatorial } from "./CpuExecution";
import { CpuEditorToolbar } from "./EditorControls";
import { exportData, hydrateFromLS, importData, wiresFromLsState, wiresToLsState } from "./ImportExport";
import { buildCompLibrary } from "./comps/builtins";
import { CompLibraryView } from "./CompLibraryView";
import { CompExampleView } from "./CompExampleView";
import { HoverDisplay } from "./HoverDisplay";
import { renderWire } from "./WireRender";
import { SchematicLibrary } from "./schematics/SchematicLibrary";
import { SchematicLibraryView } from "./schematics/SchematicLIibraryView";
import { CanvasEventHandler } from "./CanvasEventHandler";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { CompLayoutToolbar } from "./CompLayoutEditor";
import { palette } from "./palette";
import { computeSubLayoutMatrix, drawGrid } from "./CanvasRenderHelpers";
import { ICompDef, ISubLayoutArgs } from "./comps/CompBuilder";

interface ICanvasDragState {
    mtx: AffineMat2d;
    hovered: IHitTest | null;
    modelPos: Vec3;
}

function constructEditSnapshot(): IEditSnapshot {
    return {
        selected: [],

        nextWireId: 0,
        nextCompId: 0,
        wires: [],
        comps: [],

        compPorts: [],
        compSize: new Vec3(0, 0),

        subComps: new Map(),
    };
}


export const CpuCanvas: React.FC = () => {
    let [cvsState, setCvsState] = useState<ICanvasState | null>(null);
    let [lsState, setLsState] = useLocalStorageState("cpu-layout", hydrateFromLS);
    let [editorState, setEditorState] = useState<IEditorState>(() => {

        let compLibrary = buildCompLibrary();
        let schematicLibrary = new SchematicLibrary();

        let editSnapshot = constructEditSnapshot();

        return {
            snapshot: editSnapshot, // wiresFromLsState(constructEditSnapshot(), lsState, compLibrary),
            snapshotTemp: null,
            mtx: AffineMat2d.multiply(AffineMat2d.scale1(10), AffineMat2d.translateVec(new Vec3(1920/2, 1080/2).round())),
            compLibrary,
            schematicLibrary,
            activeSchematicId: null,
            redoStack: [],
            undoStack: [],
            hovered: null,
            maskHover: null,
            selectRegion: null,
            addLine: false,
            showExeOrder: false,
            transparentComps: false,
            compLibraryVisible: false,
        };
    });
    let [, redraw] = useReducer((x) => x + 1, 0);

    let [isClient, setIsClient] = useState(false);

    let initialLoad = useRef(true);
    useEffect(() => {
        if (initialLoad.current) {
            initialLoad.current = false;
            setEditorState(a => assignImm(a, {
                snapshot: wiresFromLsState(a.snapshot, lsState, a.compLibrary),
            }));

        }
    }, [lsState]);

    let initialCanvasLoad = useRef(true);
    useEffect(() => {
        if (cvsState && initialCanvasLoad.current) {
            initialCanvasLoad.current = false;
            let w = cvsState.canvas.width;
            let h = cvsState.canvas.height;
            setEditorState(a => {
                // goal: zoom-extent so the canvas fits the entire schematic

                let bb = new BoundingBox3d();
                for (let comp of a.snapshot.comps) {
                    bb.addInPlace(comp.pos);
                    bb.addInPlace(comp.pos.add(comp.size));
                }
                for (let wire of a.snapshot.wires) {
                    for (let node of wire.nodes) {
                        bb.addInPlace(node.pos);
                    }
                }

                bb.expandInPlace(bb.size().mul(0.2).len());

                // tl of view is 0,0
                // br of view is w,h

                // tl of schematic is bb.min
                // br of schematic is bb.max

                let mtx = AffineMat2d.multiply(
                    AffineMat2d.translateVec(new Vec3(w / 2 + 200, h / 2)),
                    AffineMat2d.scale1(Math.min(w / bb.size().x, h / bb.size().y)),
                    AffineMat2d.translateVec(bb.center().mul(-1)),
                );

                return assignImm(a, { mtx });
            });
        }
    }, [cvsState]);

    useEffect(() => {
        // setCtrlDown(false);
        let schematicLibrary = new SchematicLibrary();
        let compLibrary = buildCompLibrary();
        schematicLibrary.populateSchematicLibrary(compLibrary);
        setEditorState(a => {
            return assignImm(a, {
                schematicLibrary,
                compLibrary,
                snapshot: assignImm(a.snapshot, {
                    comps: compLibrary.updateAllCompsFromDefs(a.snapshot.comps),
                }),
            });
        });
        setIsClient(true);
    }, []);

    useResizeChangeHandler(cvsState?.canvas?.parentElement, redraw);

    let prevExeModel = useRef<{ system: IExeSystem, id: string | null } | null>(null);

    let exeModel = useMemo(() => {
        let prev = prevExeModel.current;
        let sameId = prev && prev.id === editorState.activeSchematicId;

        let model = createExecutionModel(editorState.compLibrary, editorState.snapshot, prev && sameId ? prev.system : null);

        if (isClient) {
            stepExecutionCombinatorial(model);
        }

        return model;
    }, [editorState.activeSchematicId, editorState.snapshot, editorState.compLibrary, isClient]);

    prevExeModel.current = { system: exeModel, id: editorState.activeSchematicId };

    let setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {

        if (el) {
            let ctx = el.getContext("2d")!;
            setCvsState({ canvas: el, ctx, size: new Vec3(1, 1), scale: 1, tileCanvases: new Map(), mtx: AffineMat2d.identity() });

        } else {
            setCvsState(null);
        }
    }, []);


    useEffect(() => {
        let newState = wiresToLsState(editorState.snapshot);
        setLsState(a => assignImm(a, newState));
        let strExport = exportData(editorState.snapshot);
        localStorage.setItem("cpu-layout-str", strExport);
        importData(strExport);
    }, [editorState.snapshot, setLsState]);

    useLayoutEffect(() => {
        if (!cvsState) {
            return;
        }

        let { canvas, ctx } = cvsState;

        let bcr = canvas.parentElement!.getBoundingClientRect();
        let w = bcr.width;
        let h = bcr.height;
        canvas.width = Math.floor(w * window.devicePixelRatio);
        canvas.height = Math.floor(h * window.devicePixelRatio);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        cvsState.size.x = w;
        cvsState.size.y = h;
        cvsState.scale = 1.0 / editorState.mtx.a;
        cvsState.mtx = editorState.mtx;
        let pr = window.devicePixelRatio;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(pr, pr);

        ctx.transform(...editorState.mtx.toTransformParams());
        ctx.save();
        renderCpu(cvsState, editorState, editorState.snapshotTemp ?? editorState.snapshot, exeModel);
        // renderDragState(cvsState, editorState, dragStart, grabDirRef.current);
        ctx.restore();

        ctx.restore();
    });


    let ctx: IEditorContext = useMemo(() => {
        return { editorState, setEditorState, cvsState, exeModel };
    }, [editorState, setEditorState, cvsState, exeModel]);

    let singleElRef = editorState.snapshot.selected.length === 1 ? editorState.snapshot.selected[0] : null;

    function getCompDomElements(schematic: ISchematic, idPrefix: string) {
        return schematic.comps
            .map(comp => {
                let def = editorState.compLibrary.getCompDef(comp.defId)!;
                return (def.renderDom || def.subLayout) && cvsState ? {
                    comp,
                    def,
                    renderDom: def.renderDom,
                    subLayout: def.subLayout,
                } : null;
            })
            .filter(isNotNil)
            .map(a => {
                cvsState!.mtx = editorState.mtx;
                let compFullId = idPrefix + a.comp.id;

                let subLayoutDom = null;
                if (a.subLayout) {
                    let subMtx = computeSubLayoutMatrix(a.comp, a.def, a.subLayout);

                    subLayoutDom = <div
                        className={"absolute origin-top-left"}
                        style={{ transform: `matrix(${subMtx.toTransformParams().join(',')})` }}
                    >
                        {getCompDomElements(a.subLayout.layout, idPrefix + a.comp.id + '|')}
                    </div>;
                }

                return <React.Fragment key={a.comp.id}>
                    {a.renderDom?.({
                        comp: a.comp,
                        ctx: cvsState?.ctx!,
                        cvs: cvsState!,
                        exeComp: exeModel.comps[exeModel.lookup.compIdToIdx.get(compFullId) ?? -1],
                        styles: null!,
                        isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
                    }) ?? null}
                    {subLayoutDom}
                </React.Fragment>;
        });
    }

    let compDivs = getCompDomElements(editorState.snapshotTemp ?? editorState.snapshot, '');

    let viewLayout = useMemo<IViewLayoutContext>(() => {
        return { el: cvsState?.canvas ?? null!, mtx: editorState.mtx };
    }, [cvsState, editorState.mtx]);

    return <EditorContext.Provider value={ctx}>
        <ViewLayoutContext.Provider value={viewLayout}>
            <div className={s.canvasWrap + " overflow-hidden"}>
                <canvas className={s.canvas} ref={setCanvasEl} />
                {cvsState && <CanvasEventHandler cvsState={cvsState}>
                    <div className={"overflow-hidden absolute left-0 top-0 w-full h-full pointer-events-none"}>
                        <div
                            className={"absolute origin-top-left"}
                            style={{ transform: `matrix(${editorState.mtx.toTransformParams().join(',')})` }}>
                            {compDivs}
                        </div>
                        {editorState.transparentComps && <div className={s.compDomEventMask} />}
                    </div>
                </CanvasEventHandler>}
                <div className={s.toolsLeftTop}>
                    <CpuEditorToolbar />
                    <CompLibraryView />
                    <CompExampleView />
                    <SchematicLibraryView />
                    {!editorState.snapshotTemp && !editorState.maskHover && <HoverDisplay canvasEl={cvsState?.canvas ?? null} />}
                </div>
                <div className="cls_toolsTopRight absolute top-0 right-0">
                    <CompLayoutToolbar />
                </div>
                {editorState.compLibraryVisible && <LibraryBrowser />}
            </div>
        </ViewLayoutContext.Provider>
    </EditorContext.Provider>;
};

function renderCpu(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix = '') {
    let ctx = cvs.ctx;

    drawGrid(editorState.mtx, ctx, cvs);

    for (let wire of layout.wires) {
        let exeNet = exeSystem.nets[exeSystem.lookup.wireIdToNetIdx.get(idPrefix + wire.id) ?? -1];
        renderWire(cvs, editorState, wire, exeNet, exeSystem, idPrefix);
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

        let isHover = editorState.hovered?.ref.type === RefType.Comp && editorState.hovered.ref.id === compFullId;

        let isValidExe = !!exeComp;
        ctx.fillStyle = isValidExe ? palette.compBg : "#aaa";
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
            isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
        };

        if (compDef?.render) {
            compDef.render(compRenderArgs);
        } else if (compDef?.renderDom) {
            // handled elsewhere
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

        if (compDef?.subLayout) {
            // nested rendering!!!!
            ctx.save();

            let subMtx = computeSubLayoutMatrix(comp, compDef, compDef.subLayout);

            ctx.transform(...subMtx.toTransformParams());
            let subCvs: ICanvasState = { ...cvs, mtx: subMtx, scale: cvs.scale / subMtx.a };

            renderCpu(subCvs, editorState, compDef.subLayout.layout, exeSystem, idPrefix + comp.id + '|');

            ctx.restore();
        }

        if (editorState.showExeOrder) {
            let orders = compIdxToExeOrder.get(exeCompIdx) ?? [];
            let text = orders.join(', ');
            ctx.save();
            ctx.fillStyle = "#a3a";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3 * cvs.scale;
            ctx.font = `${30 * cvs.scale}px Arial`;
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

    renderSelectRegion(cvs, editorState);
}


function renderSelectRegion(cvs: ICanvasState, editorState: IEditorState) {

    if (!editorState.selectRegion) {
        return;
    }

    let region = editorState.selectRegion;
    let ctx = cvs.ctx;
    let p0 = region.min; // editorState.mtx.mulVec3Inv(region.min);
    let p1 = region.max; // editorState.mtx.mulVec3Inv(region.max);

    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1 * cvs.scale;
    ctx.beginPath();
    ctx.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.stroke();
    ctx.restore();
}

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

function renderNode(cvs: ICanvasState, editorState: IEditorState, comp: IComp, node: ICompPort) {
    let hoverRef = editorState.hovered?.ref;
    let isHover = hoverRef?.type === RefType.CompNode && hoverRef.id === comp.id && hoverRef.compNodeId === node.id;
    let type = node.type ?? 0;
    let isInput = (type & PortType.In) !== 0;
    let isTristate = (type & PortType.Tristate) !== 0;
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

