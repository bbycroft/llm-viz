import { ICanvasState, IEditorState, IExeSystem, ISchematic, RefType } from "../CpuModel";

export function renderWireLabels(cvs: ICanvasState, editorState: IEditorState, layout: ISchematic, exeSystem: IExeSystem, idPrefix: string) {
    let ctx = cvs.ctx;
    ctx.save();

    let hovered = editorState.hovered;
    let selected = (editorState.snapshotTemp ?? editorState.snapshot).selected;

    let selectedWireLabelAnchorFullIds = new Set(selected.filter(a => a.type === RefType.WireLabelAnchor).map(a => a.id));

    let anchorRadius = Math.min(0.3, 16 * cvs.scale);

    for (let label of layout.wireLabels) {
        let fullLabelId = idPrefix + label.id;

        let isSelected = selectedWireLabelAnchorFullIds.has(fullLabelId);
        let isHovered = hovered?.ref.type === RefType.WireLabelAnchor && hovered?.ref.id === fullLabelId;

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

        ctx.fillStyle = '#ffffff44';
        ctx.strokeStyle = '#ff33ff';
        ctx.lineWidth = 1 * cvs.scale;
        ctx.fill();
        ctx.stroke();

    }

    ctx.restore();
}
