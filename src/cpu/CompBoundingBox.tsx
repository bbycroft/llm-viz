import React, { useState } from "react";
import { IViewLayoutContext, editMainSchematic, editSnapshot, useEditorContext, useViewLayout } from "./Editor";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { RectCorner, RectSide } from "./comps/SchematicComp";
import clsx from "clsx";
import { IPointerEvent, useCombinedMouseTouchDrag } from "../utils/pointer";
import { assignImm } from "../utils/data";
import { CursorDragOverlay } from "../utils/CursorDragOverlay";

export const CompBoundingBox: React.FC<{

}> = () => {
    let { editorState, setEditorState } = useEditorContext();
    let viewLayout = useViewLayout();
    let schematic = (editorState.snapshotTemp ?? editorState.snapshot).mainSchematic;
    let compBb = schematic.compBbox;

    function handleEdgeDrag(end: boolean, side: RectSide, dest: Vec3) {
        setEditorState(editMainSchematic(end, (layout) => {
            let prev = layout.compBbox;

            let tl = prev.min.clone();
            let br = prev.max.clone();

            let isVertical = side === RectSide.Left || side === RectSide.Right;

            if (isVertical) {
                if (side === RectSide.Left) { tl.x = dest.x; } else { br.x = dest.x; }
            } else {
                if (side === RectSide.Top) { tl.y = dest.y; } else { br.y = dest.y; }
            }

            tl = roundToHalfway(tl);
            br = roundToHalfway(br);

            return assignImm(layout, { compBbox: new BoundingBox3d(tl, br) });
        }));

    }

    function handleCornerDrag(end: boolean, corner: RectCorner, dest: Vec3) {
        setEditorState(editMainSchematic(end, (layout) => {
            let prev = layout.compBbox;

            let tl = prev.min.clone();
            let br = prev.max.clone();

            if (corner & RectCorner.IsLeft) { tl.x = dest.x; } else { br.x = dest.x; }
            if (corner & RectCorner.IsTop) { tl.y = dest.y; } else { br.y = dest.y; }

            tl = roundToHalfway(tl);
            br = roundToHalfway(br);

            return assignImm(layout, { compBbox: new BoundingBox3d(tl, br) });
        }));
    }

    let scale = viewLayout.mtx.a;
    let dirs = [RectSide.Top, RectSide.Right, RectSide.Bottom, RectSide.Left];
    let corners = [RectCorner.TopLeft, RectCorner.TopRight, RectCorner.BottomRight, RectCorner.BottomLeft];

    return <div style={{ position: 'absolute', transformOrigin: 'top left', transform: `scale(${1/scale})` }}>
        {dirs.map(side => <EdgeHitTarget key={side} bb={compBb} side={side} viewLayout={viewLayout} onEdgeDrag={handleEdgeDrag} />)}
        {corners.map(corner => <CornerHitTarget key={corner} bb={compBb} corner={corner} viewLayout={viewLayout} onCornerDrag={handleCornerDrag} />)}
    </div>;
};

export const EdgeHitTarget: React.FC<{
    viewLayout: IViewLayoutContext,
    bb: BoundingBox3d;
    side: RectSide;
    onEdgeDrag: (end: boolean, side: RectSide, dest: Vec3) => void;
}> = ({ bb, side, onEdgeDrag, viewLayout }) => {
    let [el, setEl] = useState<HTMLDivElement | null>(null);

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        return 0;
    }, (ev, _ds, end) => {
        onEdgeDrag(end, side, evToModel(viewLayout, ev));
        ev.stopPropagation();
        ev.preventDefault();
    });

    let isVertical = side === RectSide.Left || side === RectSide.Right;
    let size = bb.size();
    let scale = viewLayout.mtx.a;
    let hitWidth = 16;

    let transform: string | undefined;
    if (isVertical) {
        let left = side === RectSide.Left ? bb.min.x : bb.max.x;
        transform = `translate(${left * scale}px, ${bb.min.y * scale}px) translateX(-50%)`;
    } else {
        let top = side === RectSide.Top ? bb.min.y : bb.max.y;
        transform = `translate(${bb.min.x * scale}px, ${top * scale}px) translateY(-50%)`;
    }

    return <div
        ref={setEl}
        className={clsx("pointer-events-auto absolute")}
        style={{
            cursor: isVertical ? "ew-resize" : "ns-resize",
            transform: transform,
            width: isVertical ? `${hitWidth}px` : `${size.x * scale}px`,
            height: isVertical ? `${size.y * scale}px` : `${hitWidth}px`,
        }}
        onMouseDown={setDragStart}
    >
        {dragStart && <CursorDragOverlay className={isVertical ? "cursor-ew-resize" : "cursor-ns-resize"} />}
    </div>;
};

export const CornerHitTarget: React.FC<{
     viewLayout: IViewLayoutContext,
     bb: BoundingBox3d;
     corner: RectCorner;
     onCornerDrag: (end: boolean, corner: RectCorner, dest: Vec3) => void;
}> = ({ bb, corner, viewLayout, onCornerDrag }) => {
    let [el, setEl] = useState<HTMLDivElement | null>(null);

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        return 0;
    }, (ev, _ds, end) => {
        onCornerDrag(end, corner, evToModel(viewLayout, ev));
        ev.stopPropagation();
        ev.preventDefault();
    });

    let isMainDiag = corner === RectCorner.TopLeft || corner === RectCorner.BottomRight;

    let hitWidth = 16;
    let left = (corner & RectCorner.IsLeft) ? bb.min.x : bb.max.x;
    let top = (corner & RectCorner.IsTop) ? bb.min.y : bb.max.y;
    let scale = viewLayout.mtx.a;

    return <div
        ref={setEl}
        className={clsx("pointer-events-auto absolute")}
        style={{
            cursor: isMainDiag ? "nwse-resize" : "nesw-resize",
            transform: `translate(${left * scale}px, ${top * scale}px) translate(-50%, -50%)`,
            width: `${hitWidth}px`,
            height: `${hitWidth}px`,
        }}
        onMouseDown={setDragStart}
    >
        {dragStart && <CursorDragOverlay className={isMainDiag ? "cursor-nwse-resize" : "cursor-nesw-resize"} />}
    </div>;
};

function evToScreen(viewLayout: IViewLayoutContext, ev: IPointerEvent) {
    let bcr = viewLayout.el.getBoundingClientRect();
    return new Vec3(ev.clientX - bcr.left, ev.clientY - bcr.top);
}

function evToModel(viewLayout: IViewLayoutContext, ev: IPointerEvent) {
    return screenToModel(viewLayout, evToScreen(viewLayout, ev));
}

function screenToModel(viewLayout: IViewLayoutContext, screenPos: Vec3) {
    return viewLayout.mtx.mulVec3Inv(screenPos);
}

function modelToScreen(viewLayout: IViewLayoutContext, modelPos: Vec3) {
    return viewLayout.mtx.mulVec3(modelPos);
}

function roundToHalfway(a: Vec3) {
    return new Vec3(
        Math.round(a.x - 0.5) + 0.5,
        Math.round(a.y - 0.5) + 0.5);
}
