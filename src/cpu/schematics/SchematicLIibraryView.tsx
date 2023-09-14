import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { assignImm } from "@/src/utils/data";
import { faCheck, faPencil, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useEffect, useState } from "react";
import { editLayout, useEditorContext } from "../Editor";
import { ISchematicDef } from "./SchematicLibrary";
import s from "./SchematicLibraryView.module.scss";

export const SchematicLibraryView: React.FC = () => {
    let { editorState, setEditorState } = useEditorContext();

    let schematicLib = editorState.schematicLibrary;

    function saveFromState() {
        if (editorState.activeSchematicId) {
            let schematic = schematicLib.getSchematic(editorState.activeSchematicId);
            if (schematic) {
                schematic.model = editorState.snapshot;
                schematic.undoStack = editorState.undoStack;
                schematic.redoStack = editorState.redoStack;
                schematic.mtx = editorState.mtx;
            }
            schematicLib.saveToLocalStorage(editorState.activeSchematicId);
        }
    }

    function loadIntoEditor(schematic: ISchematicDef) {
        setEditorState(() => {
            return assignImm(editorState, {
                activeSchematicId: schematic.id,
                snapshot: schematic.model,
                undoStack: schematic.undoStack ?? [],
                redoStack: schematic.redoStack ?? [],
                mtx: schematic.mtx ?? new AffineMat2d(),
            });
        });
    }

    function handleEntryClick(ev: React.MouseEvent, schematic: ISchematicDef) {
        saveFromState();
        loadIntoEditor(schematic);
    }

    function handleAddNew(ev: React.MouseEvent) {
        let newSchematic = schematicLib.addCustomSchematic('New Schematic')!;
        saveFromState();
        loadIntoEditor(newSchematic);
    }

    interface INameEditState {
        id: string;
        schematic: ISchematicDef;
        name: string;
    }

    let [nameEdit, setNameEdit] = useState<INameEditState | null>(null);

    function handleEditName(ev: React.MouseEvent, schematic: ISchematicDef) {
        setNameEdit({ id: schematic.id, name: schematic.name, schematic });
    }

    function cancelEditName() {
        setNameEdit(null);
    }

    function applyEditName() {
        if (nameEdit) {
            nameEdit.schematic.name = nameEdit.name;
            schematicLib.saveToLocalStorage(nameEdit.id);
            setNameEdit(null);
        }
    }

    async function handleDelete(ev: React.MouseEvent, schematic: ISchematicDef) {
        // show confirmation dialog
        if (confirm(`Are you sure you want to delete schematic "${schematic.name}"?`)) {
            schematicLib.deleteCustomSchematic(schematic.id);
        }
        setEditorState(a => ({ ...a }));
    }

    useEffect(() => {
        saveFromState();
    });

    return <div className={s.libraryView}>
        <div className={s.header}>Schematics</div>
        <div className={s.body}>
            {[...schematicLib.builtinSchematics].map(([id, schematic], idx) => {
                return <div
                    className={s.entry}
                    key={idx}
                >
                    <div
                        className={s.name}
                        onMouseDown={ev => handleEntryClick(ev, schematic)}
                    >
                        {schematic.name}
                    </div>
                </div>
            })}

            <div className={s.divider} />

            {[...schematicLib.customSchematics].map(([id, schematic], idx) => {
                let isEditing = nameEdit?.id === schematic.id;

                return <div
                    className={s.entry}
                    key={idx}
                >
                    {!isEditing && <>
                        <div
                            onMouseDown={ev => handleEntryClick(ev, schematic)}
                            className={s.name}
                        >{schematic.name}</div>
                        <button className={s.btnIcon} onClick={ev => handleEditName(ev, schematic)}>
                            <FontAwesomeIcon icon={faPencil} />
                        </button>
                        <button className={s.btnIcon} onClick={ev => handleDelete(ev, schematic)}>
                            <FontAwesomeIcon icon={faTrash} />
                        </button>
                    </>}
                    {isEditing && <>
                        <input className={s.input} value={nameEdit!.name} onChange={ev => setNameEdit(a => assignImm(a!, { name: ev.target.value }))} />
                        <button className={s.btnIcon} onClick={ev => applyEditName()}>
                            <FontAwesomeIcon icon={faCheck} />
                        </button>
                        <button className={s.btnIcon} onClick={ev => cancelEditName()}>
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </>}
                </div>;
            })}

            <div className={s.divider} />

            <button className={s.btn} onClick={handleAddNew}>Add new</button>
        </div>
    </div>;
};
