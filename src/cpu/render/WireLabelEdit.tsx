import React, { useState } from "react";
import { ICanvasState, IEditContext, IWireLabel } from "../CpuModel";
import { wireLabelTriangle } from "./WireLabelRender";
import { Vec3 } from "@/src/utils/vector";
import { canvasEvToModel, editSubSchematic, editWireLabel, useEditorContext, useViewLayout } from "../Editor";
import { assignImm } from "@/src/utils/data";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripLines, faGripLinesVertical } from "@fortawesome/free-solid-svg-icons";
import { useCombinedMouseTouchDrag } from "@/src/utils/pointer";
import { getMatrixForEditContext } from "../SubSchematics";

export const WireLabelEdit: React.FC<{
    cvs: ICanvasState,
    editCtx: IEditContext,
    wireLabel: IWireLabel;
}> = ({ cvs, editCtx, wireLabel }) => {
    let viewLayout = useViewLayout();
    let [editorState, setEditorState] = useEditorContext();

    let [leftIsNearest, trianglePoint] = wireLabelTriangle(wireLabel);
    let [dragEl, setDragEl] = useState<HTMLElement | null>(null);

    let [, setDragStart] = useCombinedMouseTouchDrag(dragEl, (ev) => {
        let mtx = getMatrixForEditContext(editCtx, editorState);
        return {
            modelPos: canvasEvToModel(viewLayout.el, ev, mtx),
        };
    }, function handleDrag(ev, ds, end) {

        let mtxLocal = getMatrixForEditContext(editCtx, editorState);
        let deltaModel = canvasEvToModel(viewLayout.el, ev, mtxLocal).sub(ds.data.modelPos);

        setEditorState(editWireLabel(editCtx, end, wireLabel.id, function updateWireLabel(label) {
            let newPos = label.rectRelPos.add(deltaModel);

            newPos = newPos.mul(2.0).round().mul(0.5); // snap to 0.5 grid

            return assignImm(label, { rectRelPos: newPos });
        }));
    });

    let rectPos = wireLabel.anchorPos.add(wireLabel.rectRelPos);
    let xPos = leftIsNearest ? rectPos.x : rectPos.x + wireLabel.rectSize.x;
    let triTop = new Vec3(xPos, rectPos.y);
    let triBot = new Vec3(xPos, rectPos.y + wireLabel.rectSize.y);

    let scale = Math.max(viewLayout.mtx.a, 15);

    let hitSize = 0.8 * scale;

    return <div
        className="bg-opacity-40 absolute origin-top-left"
        style={{
            transform: `translate(${wireLabel.anchorPos.x + wireLabel.rectRelPos.x}px, ${wireLabel.anchorPos.y + wireLabel.rectRelPos.y}px) scale(${1/scale})`,
            width: wireLabel.rectSize.x * scale,
            height: wireLabel.rectSize.y * scale,
        }}>

        <div className="absolute rounded-full my-auto cursor-move flex items-center justify-center pointer-events-auto group" style={{
            width: hitSize,
            height: hitSize,
            left: leftIsNearest ? -hitSize : undefined,
            right: leftIsNearest ? undefined : -hitSize,
            top: 0,
            bottom: 0,
        }}
        onMouseDown={(ev) => {
            setDragStart(ev);
            ev.stopPropagation();
            ev.preventDefault();
        }}>
            <FontAwesomeIcon icon={faGripLines} className="text-gray-200 m-auto group-hover:text-gray-400" style={{ fontSize: hitSize * 0.4 }} />
        </div>

    </div>;
};
