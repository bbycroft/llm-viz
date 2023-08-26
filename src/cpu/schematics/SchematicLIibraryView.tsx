import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { assignImm } from "@/src/utils/data";
import React, { useEffect } from "react";
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
                schematic.model = editorState.layout;
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
                layout: schematic.model,
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
                    onMouseDown={ev => handleEntryClick(ev, schematic)}
                >{schematic.name}</div>;
            })}

            <div className={s.divider} />

            {[...schematicLib.customSchematics].map(([id, schematic], idx) => {
                return <div
                    className={s.entry}
                    key={idx}
                    onMouseDown={ev => handleEntryClick(ev, schematic)}
                >
                    <div>{schematic.name}</div>
                    <div><button className={s.deleteButton} onClick={ev => handleDelete(ev, schematic)}>Delete</button></div>
                </div>;
            })}

            <div className={s.divider} />

            <button className={s.button} onClick={handleAddNew}>Add new</button>
        </div>
    </div>;
};
