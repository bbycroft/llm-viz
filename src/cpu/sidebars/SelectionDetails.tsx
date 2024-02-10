import React from "react";
import { IElRef, RefType } from "../CpuModel";
import { editWireLabel, useEditorContext } from "../Editor";
import { CompDetails, EditKvp } from "./CompDetails";
import { editCtxFromRefId, getWireLabelFromRef } from "../SubSchematics";
import { assignImm } from "@/src/utils/data";
import { StringEditor } from "../displayTools/StringEditor";

export const SelectionDetails: React.FC<{
}> = ({  }) => {
    let [editorState] = useEditorContext();

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let numSelected = snapshot.selected.length;

    let singleRef = numSelected === 1 ? snapshot.selected[0] : null;

    let singleCompRef = singleRef?.type === RefType.Comp ? singleRef : null;
    let singleWireLabelRef = singleRef?.type === RefType.WireLabel ? singleRef : null;

    console.log('singleRef', singleRef);

    if (singleCompRef) {
        return <CompDetails compRef={singleCompRef} />;
    } else if (singleWireLabelRef) {
        return <WireLabelDetails wireLabelRef={singleWireLabelRef} />;
    }

    return <div className="flex flex-col">
        <div className="text-gray-500 m-2">Select an element to view details</div>
    </div>;
};


export const WireLabelDetails: React.FC<{
    wireLabelRef: IElRef;
}> = ({ wireLabelRef }) => {
    let [editorState, setEditorState] = useEditorContext();

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let editCtx = editCtxFromRefId(wireLabelRef);
    let singleWireLabel = getWireLabelFromRef(editorState, wireLabelRef);

    function handleNameUpdate(end: boolean, value: string) {
        setEditorState(editWireLabel(editCtx, end, singleWireLabel!.id, label => assignImm(label, { text: value })));
    }

    return <div className="flex flex-col">
        {singleWireLabel && <>
            <div className="text-gray-500 m-2">Wire Label</div>
            <div>rect pos = {singleWireLabel.rectRelPos.toString()}, size = {singleWireLabel.rectSize.toString()}</div>
            <EditKvp label={'Text'}><StringEditor className="bg-slate-100 rounded flex-1" value={singleWireLabel.text} update={handleNameUpdate} /></EditKvp>
        </>}
    </div>;
};
