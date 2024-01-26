import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { getOrAddToMap, hasFlag } from "@/src/utils/data";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { ICanvasState, IEditorState, ISchematic, IExeSystem, IParentCompInfo, IWirePortInfo, RefType, CompDefFlags, ICompRenderArgs, IComp, ICompPort, PortType, RectSide, IEditSnapshot } from "../CpuModel";
import { compIsVisible } from "../ModelHelpers";
import { getCompSubSchematic, computeSubLayoutMatrix } from "../SubSchematics";
import { rotateCompPortPos, rotatePos, rotateRectSide } from "../comps/CompHelpers";
import { compPortDefId, ICompPortConfig, CompPortFlags } from "../comps/CompPort";
import { palette } from "../palette";
import { drawGrid, shouldRenderComp, scaleFromMtx, makeCanvasFont } from "./CanvasRenderHelpers";
import { renderWire } from "./WireRender";
import { renderWireLabels } from "./WireLabelRender";


const innerOffset = 0.5;
const fontSize = 1.1;
const lineHeight = 1.4;


export function renderSchematic(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix = '', parentInfo?: IParentCompInfo) {
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
        let isWiresOnly = hasFlag(comp.flags, CompDefFlags.WiresOnly);
        let isAtomic = hasFlag(comp.flags, CompDefFlags.IsAtomic);
        let isCompPort = comp.defId === compPortDefId;


        let fillColor = !isValidExe ? "#aaa"
            : isCompPort ? palette.compPortBg
            : isWiresOnly ? palette.compWireBg
            : isAtomic ? palette.compAtomicBg
            : palette.compBg;

        let compRenderArgs: ICompRenderArgs<any> = {
            comp,
            ctx,
            cvs,
            exeComp,
            editCtx: { idPrefix },
            styles: {
                fontSize: fontSize,
                lineHeight: lineHeight,
                fillColor: fillColor,
                strokeColor: isHover ? "#aaa" : isWiresOnly ? "#999" : "#000",
                lineWidth: 1 * cvs.scale,
            },
            bb: comp.bb,
            portBindingLookup,
            isActive: !!singleElRef && singleElRef.type === RefType.Comp && singleElRef.id === compFullId,
        };

        ctx.fillStyle = compRenderArgs.styles.fillColor;
        ctx.strokeStyle = compRenderArgs.styles.strokeColor;
        ctx.lineWidth = (isHover ? 2 : 1) * cvs.scale;

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

            renderSchematic(subCvs, editorState, subSchematic, exeSystem, idPrefix + comp.id + '|', parentInfo);

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

    renderWireLabels(cvs, editorState, layout, exeSystem, idPrefix);

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
        portBindingLookup: new Map(),
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

    let x = portPos.x;
    let y = portPos.y;

    let side = port.pos.x === 0 ? RectSide.Left : port.pos.x === comp.size.x ? RectSide.Right : port.pos.y === 0 ? RectSide.Top : RectSide.Bottom;

    let innerOffset = 0.5;
    let innerPos = new Vec3(port.pos.x, port.pos.y);
    if (side === RectSide.Left) {
        innerPos.x += innerOffset;
    } else if (side === RectSide.Right) {
        innerPos.x -= innerOffset;
    } else if (side === RectSide.Top) {
        innerPos.y += innerOffset;
    } else if (side === RectSide.Bottom) {
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
        let sideRot = rotateRectSide(comp.rotation, side);

        let isTop = sideRot === RectSide.Top;
        let isBot = sideRot === RectSide.Bottom;
        let isLeft = sideRot === RectSide.Left;
        let isRight = sideRot === RectSide.Right;

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

    if (bb) {
        let size = bb.size();
        ctx.beginPath();
        ctx.rect(bb.min.x, bb.min.y, size.x, size.y);

        ctx.lineWidth = 1 * cvs.scale;
        ctx.strokeStyle = "#77f";
        ctx.stroke();
    }

    ctx.restore();
}

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
