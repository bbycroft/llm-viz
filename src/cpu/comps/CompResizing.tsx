import { CursorDragOverlay } from '@/src/utils/CursorDragOverlay';
import { assignImm, hasFlag } from '@/src/utils/data';
import { IPointerEvent, useCombinedMouseTouchDrag } from '@/src/utils/pointer';
import { Vec3, BoundingBox3d } from '@/src/utils/vector';
import { faEllipsisVertical, faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import React, { memo } from 'react';
import { IEditContext, IComp } from '../CpuModel';
import { useEditorContext, editComp, useViewLayout } from '../Editor';
import { rotatedBbPivotPoint } from './CompHelpers';
import { PortPlacement } from './CompPort';
import { RectCorner } from './SchematicComp';

export const PortResizer: React.FC<{
    editCtx: IEditContext,
    comp: IComp<{ w: number, h: number }>,
}> = memo(function PortResizer({ editCtx, comp }) {

    let [editorState, setEditorState] = useEditorContext();

    let scale = editorState.mtx.a;

    function handleResize(end: boolean, pos: Vec3, size: Vec3) {
        setEditorState(editComp(editCtx, end, comp, a => {
            let p0 = new Vec3(pos.x - 0.5, pos.y - 0.5);
            let p1 = new Vec3(p0.x + size.x + 1, p0.y + size.y + 1);
            let bb = new BoundingBox3d(p0, p1);
            let size2 = bb.size(); // p1Unrotated.sub(p0Unrotated).abs();
            if (comp.rotation === 1 || comp.rotation === 3) {
                size2 = new Vec3(size2.y, size2.x);
            }

            return assignImm(a, {
                pos: rotatedBbPivotPoint(comp.rotation, bb),
                args: assignImm(a.args, { w: Math.max(2, size2.x), h: Math.max(2, size2.y) }),
                size,
            });
        }));
    }

    let pos = comp.bb.min;
    let size = comp.bb.size();

    return <div className="absolute origin-top-left" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${1/scale})`, width: size.x * scale, height: size.y * scale }}>
        {[...new Array(4)].map((_, idx) => {
            // return <SideGripper key={idx} gripPos={idx} size={comp.size} pos={comp.pos} onResize={handleResize} centerY />;
            return <CornerGripper key={idx} gripPos={1 << idx} size={size} pos={pos} onResize={handleResize} />;
        })}
    </div>;
});

export const SideGripper: React.FC<{
    gripPos: PortPlacement,
    pos: Vec3,
    size: Vec3,
    centerY?: boolean,
    onResize: (end: boolean, pos: Vec3, size: Vec3) => void,
}> = ({ gripPos, pos, size, onResize, centerY }) => {
    let { mtx } = useViewLayout();
    let [el, setEl] = React.useState<HTMLElement | null>(null);

    function evToModel(ev: IPointerEvent) {
        return mtx.mulVec3Inv(new Vec3(ev.clientX, ev.clientY));
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, _ev => ({ size, pos }), (ev, ds, end) => {
        let oldPos = ds.data.pos;
        let oldSize = ds.data.size;
        let delta = evToModel(ev).sub(evToModel(ds)).round();
        let isHoriz = gripPos === PortPlacement.Left || gripPos === PortPlacement.Right;

        if (isHoriz) {
            delta.y = 0;
        } else {
            delta.x = 0;
        }

        if (gripPos === PortPlacement.Left) {
            onResize(end, oldPos.add(delta), oldSize.sub(delta));
        } else if (gripPos === PortPlacement.Right) {
            onResize(end, oldPos, oldSize.add(delta));
        } else if (gripPos === PortPlacement.Top) {
            onResize(end, oldPos.add(delta), oldSize.mulAdd(delta, centerY ? -2 : -1));
        } else {
            onResize(end, oldPos.mulAdd(delta, centerY ? -1 : 0), oldSize.mulAdd(delta, centerY ? 2 : 1));
        }
        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.preventDefault();
        ev.stopPropagation();
    }

    let isVertical = gripPos === PortPlacement.Left || gripPos === PortPlacement.Right;
    let classNameHit = clsx(
        "group absolute pointer-events-auto flex items-center justify-center",
        isVertical ? "cursor-ew-resize my-auto top-0 bottom-0 h-12 w-6" : "cursor-ns-resize mx-auto left-0 right-0 h-6 w-12",
        gripPos === PortPlacement.Left && "left-0 -translate-x-1/2",
        gripPos === PortPlacement.Right && "right-0 translate-x-1/2",
        gripPos === PortPlacement.Top && "top-0 -translate-y-1/2",
        gripPos === PortPlacement.Bottom && "bottom-0 translate-y-1/2",
    );

    let className = clsx(
        "bg-blue-200 hover:bg-blue-300 rounded-xs flex items-center justify-center",
        isVertical ? "h-6 w-2" : "h-2 w-6",
    );

    return <div className={classNameHit} ref={setEl} onMouseDown={handleMouseDown}>
        <div className={className}>
            <FontAwesomeIcon icon={isVertical ? faEllipsisVertical : faEllipsis} className="text-md text-white group-hover:text-gray-100" />
        </div>
        {dragStart && <CursorDragOverlay className={isVertical ? "cursor-ew-resize" : "cursor-ns-resize"} /> }
    </div>;
}


export const CornerGripper: React.FC<{
    gripPos: RectCorner,
    pos: Vec3,
    size: Vec3,
    onResize: (end: boolean, pos: Vec3, size: Vec3) => void,
}> = ({ gripPos, pos, size, onResize }) => {
    let { mtx } = useViewLayout();
    let [el, setEl] = React.useState<HTMLElement | null>(null);

    function evToModel(ev: IPointerEvent) {
        return mtx.mulVec3Inv(new Vec3(ev.clientX, ev.clientY));
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, _ev => ({ size, pos }), (ev, ds, end) => {
        let oldPos = ds.data.pos;
        let oldSize = ds.data.size;
        let delta = evToModel(ev).sub(evToModel(ds)).round();
        let newPos = oldPos.clone();
        let newSize = oldSize.clone();

        if (hasFlag(RectCorner.IsLeft, gripPos)) {
            newPos.x += delta.x;
            newSize.x -= delta.x;
        } else {
            newSize.x += delta.x;
        }

        if (hasFlag(RectCorner.IsTop, gripPos)) {
            newPos.y += delta.y;
            newSize.y -= delta.y;
        } else {
            newSize.y += delta.y;
        }

        onResize(end, newPos, newSize);
        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.preventDefault();
        ev.stopPropagation();
    }

    let isCrossDiag = hasFlag(RectCorner.IsLeft, gripPos) !== hasFlag(RectCorner.IsTop, gripPos);

    let cursor = isCrossDiag ? "cursor-nesw-resize" : "cursor-nwse-resize";

    let classNameHit = clsx("group absolute pointer-events-auto w-8 h-8 flex items-center justify-center", cursor);

    let className = clsx(
    );

    return <div className={classNameHit} ref={setEl} onMouseDown={handleMouseDown} style={{
        transform: 'translate(-50%, -50%)',
        left: hasFlag(RectCorner.IsLeft, gripPos) ? '0' : '100%',
        top: hasFlag(RectCorner.IsTop, gripPos) ? '0' : '100%',
        }}>
        <div className={"border-2 border-blue-400 group-hover:border-blue-600 bg-white rounded-xs h-4 w-4"} />
        {dragStart && <CursorDragOverlay className={cursor} /> }
    </div>;
}
