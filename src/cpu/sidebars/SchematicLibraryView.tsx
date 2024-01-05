import { assignImm } from "@/src/utils/data";
import React, { memo } from "react";
import { useEditorContext } from "../Editor";
import s from "./SchematicLibraryView.module.scss";
import { ISchematicDef } from "../CpuModel";
import { useSubscriptions } from "@/src/utils/hooks";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

export const SchematicLibraryView: React.FC = memo(function SchematicLibraryView() {
    let [editorState, setEditorState] = useEditorContext({ });
    let schematicLib = editorState.schematicLibrary;
    useSubscriptions(schematicLib.subs);

    function loadIntoEditor(schematic: ISchematicDef) {
        setEditorState(() => {
            return assignImm(editorState, { desiredSchematicId: schematic.id });
        });
    }

    function handleEntryClick(ev: React.MouseEvent, schematic: ISchematicDef) {
        loadIntoEditor(schematic);
    }

    function handleAddNew(ev: React.MouseEvent) {
        let newSchematic = schematicLib.addCustomSchematic('New Schematic')!;
        loadIntoEditor(newSchematic);
    }

    async function handleDelete(ev: React.MouseEvent, schematic: ISchematicDef) {
        // show confirmation dialog
        if (confirm(`Are you sure you want to delete schematic "${schematic.name}"?`)) {
            schematicLib.deleteCustomSchematic(schematic.id);
        }
        setEditorState(a => ({ ...a }));
    }

    return <div>
        <div className={s.body + " overflow-y-auto"}>
            {[...schematicLib.builtinSchematics].map(([id, schematic], idx) => {
                let custom = schematicLib.customSchematics.get(id);

                return <div
                    className={s.entry}
                    key={idx}
                >
                    <div
                        className={s.name}
                        onMouseDown={ev => handleEntryClick(ev, schematic)}
                    >
                        {schematic.name}
                        {custom && <span className={"ml-auto text-red-800"}>*</span>}
                    </div>
                </div>
            })}

            <div className={s.divider} />

            {[...schematicLib.customSchematics].map(([id, schematic], idx) => {

                let builtin = schematicLib.builtinSchematics.get(id);
                if (builtin) {
                    return null;
                }

                return <div
                    className={s.entry}
                    key={idx}
                >
                    <div
                        onMouseDown={ev => handleEntryClick(ev, schematic)}
                        className={s.name}
                    >{schematic.snapshot.mainSchematic.name}</div>

                    <button className={s.btnIcon} onClick={ev => handleDelete(ev, schematic)}>
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>;
            })}
        </div>

        <div className={s.divider} />

        <div>
            <button className={s.btn} onClick={handleAddNew}>Add new</button>
        </div>
    </div>;
});
