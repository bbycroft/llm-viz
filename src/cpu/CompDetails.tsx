import React from "react";
import { editComp, editCompConfig, useEditorContext } from "./Editor";
import { CompDefFlags, IComp, RefType } from "./CpuModel";
import { StringEditor } from "./displayTools/StringEditor";
import { assignImm, hasFlag } from "../utils/data";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { getCompFromRef, getCompSubSchematic } from "./SubSchematics";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "../utils/keyboard";
import { HexValueEditor, HexValueInputType } from "./displayTools/HexValueEditor";
import { ButtonStandard } from "./EditorControls";

export const CompDetails: React.FC<{
}> = ({  }) => {

    let editCtx = useEditorContext();
    let { editorState, setEditorState } = editCtx;

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let numSelected = snapshot.selected.length;

    let singleCompRef = numSelected === 1 && snapshot.selected[0].type === RefType.Comp ? snapshot.selected[0] : null;
    let singleComp = singleCompRef ? getCompFromRef(editorState, singleCompRef.id) : null;
    let compDef = singleComp ? editorState.compLibrary.getCompDef(singleComp.defId) : null;

    function handleNameUpdate(end: boolean, value: string) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp!, comp => assignImm(comp, { name: value })));
    }

    function handleExtIdUpdate(end: boolean, value: string) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp!, comp => assignImm(comp, { extId: value })));
    }

    function handleBitWidthUpdate(end: boolean, value: number) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp! as IComp<{ bitWidth: number }>, comp => assignImm(comp, { bitWidth: value })));
    }

    function handleInternalSchematicAddNew() {
        let newSchematic = editorState.schematicLibrary.addCustomSchematic('New Schematic')!;
        newSchematic.snapshot.mainSchematic.parentCompDefId = singleComp!.defId;
        // probably want to zoom into the new schematic??
        setEditorState(editComp({ idPrefix: "" }, true, singleComp!, comp => assignImm(comp, { subSchematicId: newSchematic.id })));
    }

    useGlobalKeyboard(KeyboardOrder.Element, ev => {
        if (singleComp && compDef) {
            if (isKeyWithModifiers(ev, 'r') && singleComp.flags && hasFlag(singleComp.flags, CompDefFlags.CanRotate)) {
                setEditorState(editCompConfig({ idPrefix: "" }, true, singleComp as IComp<{ rotate: number }>, a => assignImm(a, { rotate: (a.rotate + 1) % 4 })));
                ev.preventDefault();
                ev.stopPropagation();
            }
        }
    }, { isActive: !!singleComp && !!compDef });

    let subSchematic = singleComp ? getCompSubSchematic(editorState, singleComp) : null;

    let isAtomic = singleComp && hasFlag(singleComp.flags, CompDefFlags.IsAtomic);

    return <div className="flex flex-col flex-1">
        {numSelected === 0 && <div className="my-2 mx-2">No component selected</div>}
        {numSelected === 1 && singleComp && compDef && <div>
            <div className="my-2 mx-2">Selected Component: <b>{singleComp.name}</b></div>
            <div className="mx-2">
                <EditKvp label={'Id'}>
                    <span className="font-mono">
                        <code>{singleComp.id}</code>, <code>{singleComp.defId}</code>, ({singleComp.pos.x},{singleComp.pos.y})
                    </span>
                </EditKvp>
                {/* <EditKvp label={'Def Id'}></EditKvp> */}
                <EditKvp label={'Name'}><StringEditor className="bg-slate-100 rounded flex-1" value={singleComp.args.name ?? singleComp.name} update={handleNameUpdate} /></EditKvp>
                <EditKvp label={'Ext Id'}><StringEditor className="bg-slate-100 rounded font-mono flex-1" value={singleComp.args.extId ?? ''} update={handleExtIdUpdate} /></EditKvp>
                {/* <EditKvp label={'Pos'}>{}</EditKvp> */}

                {singleComp.flags && hasFlag(singleComp.flags, CompDefFlags.HasBitWidth) && <EditKvp label={'Bit Width'}>
                    <HexValueEditor
                        className="text-lg bg-slate-100 rounded"
                        inputType={HexValueInputType.Dec}
                        fixedInputType
                        hidePrefix
                        signed={false}
                        value={(singleComp.args as any).bitWidth ?? 0}
                        update={handleBitWidthUpdate}
                    />

                </EditKvp>}

                {compDef.renderOptions && compDef.renderOptions({ comp: singleComp, exeComp: null, editCtx: { idPrefix: "" } })}

            </div>
            {!isAtomic && <div className="m-2">
                <div className="mb-2">Internal Schematic</div>
                {!subSchematic && <ButtonStandard onClick={handleInternalSchematicAddNew}>
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Add New
                </ButtonStandard>}
                {singleComp.subSchematicId && <EditKvp label={'Id'}><code>{singleComp.subSchematicId}</code></EditKvp>}
                {subSchematic && <EditKvp label={'Name'}><code>{subSchematic?.name}</code></EditKvp>}
            </div>}
        </div>}
    </div>;
};

export const EditKvp: React.FC<{
    label: string;
    children?: React.ReactNode;
}> = ({ label, children }) => {
    return <div className="flex flex-row items-center my-2">
        <div className="w-[6rem] mr-3 text-end text-gray-500">{label}</div>
        <div className="flex-1">{children}</div>
    </div>;
};
