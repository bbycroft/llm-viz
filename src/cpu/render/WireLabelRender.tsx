import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IEditorState, IExeSystem, ISchematic, IWireLabel, RefType } from "../CpuModel";
import { FontType, makeCanvasFont } from "./CanvasRenderHelpers";

export function renderWireLabels(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix: string) {
    let ctx = cvs.ctx;
    ctx.save();

    let hovered = editorState.hovered;
    let selected = (editorState.snapshotTemp ?? editorState.snapshot).selected;

    let selectedWireLabelAnchorFullIds = new Set(selected.filter(a => a.type === RefType.WireLabel).map(a => a.id));

    let anchorRadius = Math.min(0.3, 16 * cvs.scale);

    let wireIdLookup = new Map(layout.wires.map(w => [w.id, w]));

    for (let label of layout.wireLabels) {
        let fullLabelId = idPrefix + label.id;

        let isSelected = selectedWireLabelAnchorFullIds.has(fullLabelId);
        let isHovered = hovered?.ref.type === RefType.WireLabel && hovered?.ref.id === fullLabelId;

        let wire = wireIdLookup.get(label.wireId);
        let wireInfo = wire ? editorState.wireRenderCache.lookupWire(editorState, idPrefix, wire) : null;
        // draw the anchor-point circle (usually on a wire)

        ctx.beginPath();
        ctx.arc(label.anchorPos.x, label.anchorPos.y, anchorRadius, 0, Math.PI * 2);

        if (isHovered) {
            ctx.save();
            ctx.filter = 'blur(2px)';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.restore();
        }

        if (isSelected) {
            ctx.strokeStyle = '#33f';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
        }

        // ctx.fillStyle = '#ffffff44';
        // ctx.strokeStyle = '#ff33ff';
        // ctx.lineWidth = 1 * cvs.scale;
        // ctx.fill();
        // ctx.stroke();

        // draw the label

        let rectPos = label.anchorPos.add(label.rectRelPos);
        let rectSize = label.rectSize;

        let [leftIsNearest, trianglePoint] = wireLabelTriangle(label);

        ctx.save();
        ctx.lineWidth = 1 * cvs.scale;
        ctx.strokeStyle = '#888';
        ctx.beginPath();
        ctx.moveTo(label.anchorPos.x, label.anchorPos.y);
        ctx.lineTo(trianglePoint.x, trianglePoint.y);
        ctx.setLineDash([4 * cvs.scale, 4 * cvs.scale]);
        ctx.stroke();

        if (isHovered) {
            ctx.save();
            ctx.filter = 'blur(2px)';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.restore();
        }

        if (isSelected) {
            ctx.strokeStyle = '#33f';
            ctx.lineWidth = 1 * cvs.scale;
            ctx.stroke();
        }

        ctx.restore();

        // we draw a triangle on the left or right of the label, whose point is then connected to the anchor point with a line
        // the region is then the 5 points of the rect unioned with the triangle

        ctx.beginPath();
        ctx.moveTo(rectPos.x, rectPos.y);
        ctx.lineTo(rectPos.x + rectSize.x, rectPos.y);
        if (!leftIsNearest) {
            ctx.lineTo(trianglePoint.x, trianglePoint.y);
        }
        ctx.lineTo(rectPos.x + rectSize.x, rectPos.y + rectSize.y);
        ctx.lineTo(rectPos.x, rectPos.y + rectSize.y);
        if (leftIsNearest) {
            ctx.lineTo(trianglePoint.x, trianglePoint.y);
        }
        ctx.closePath();

        if (isHovered) {
            ctx.save();
            ctx.filter = 'blur(2px)';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.restore();
        }

        if (isSelected) {
            ctx.strokeStyle = '#33f';
            ctx.lineWidth = 3 * cvs.scale;
            ctx.stroke();
        }

        ctx.lineWidth = 1 * cvs.scale;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#fff';

        ctx.fill();
        ctx.stroke();

        // draw the text
        // top line is the text, bottom line is the associated wire value

        let padLeft = 0.1;
        let padTop = 0.1;
        let text = label.text;
        ctx.font = makeCanvasFont(0.6, FontType.Default);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#555';
        ctx.fillText(text, rectPos.x + padLeft, rectPos.y + 1.0 - padTop);

        if (wire && wireInfo) {
            ctx.font = makeCanvasFont(0.8, FontType.Default);
            let wireValue = wireInfo.wireValue;
            let wireText = wireValue.toString();
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#000';
            ctx.fillText(wireText, rectPos.x +  padLeft, rectPos.y + 2.0 - padTop);
        }
    }

    ctx.restore();
}

export function wireLabelTriangle(label: IWireLabel): [leftSide: boolean, trianglePoint: Vec3] {
    let rectPos = label.anchorPos.add(label.rectRelPos);
    let rectSize = label.rectSize;

    let yMid = rectPos.y + rectSize.y / 2;
    let leftPos = new Vec3(rectPos.x, yMid);
    let rightPos = new Vec3(rectPos.x + rectSize.x, yMid);
    let triangleOffset = 1.0;

    let leftIsNearest = leftPos.distSq(label.anchorPos) < rightPos.distSq(label.anchorPos);

    return [leftIsNearest, new Vec3(leftIsNearest ? rectPos.x - triangleOffset : rectPos.x + rectSize.x + triangleOffset, yMid)];
}
