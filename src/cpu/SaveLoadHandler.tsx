import { memo, useEffect } from "react";
import { useEditorContext } from "./Editor";
import { createSchematicCompDef } from "./comps/SchematicComp";

export const SaveLoadHandler: React.FC = memo(function SaveLoadHandler() {
    let [editorState, , editorStore] = useEditorContext({ });

    let compLibrary = editorState.compLibrary;
    let schematicLib = editorState.schematicLibrary;

    useEffect(() => {
        let fullEditorState = editorStore.value;
        let schemId = editorState.activeSchematicId;
        if (schemId) {
            let schematic = schematicLib.customSchematics.get(schemId);

            if (!schematic) {
                let builtin = schematicLib.builtinSchematics.get(schemId);
                if (builtin) {
                    schematicLib.copyBuiltinToCustom(schemId);
                }
                schematic = schematicLib.customSchematics.get(schemId);
            }

            if (schematic) {
                // console.log('updating schematic with id: ' + schemId);
                schematic.snapshot = editorState.snapshot;
                schematic.undoStack = fullEditorState.undoStack;
                schematic.redoStack = fullEditorState.redoStack;
                schematic.mtx = fullEditorState.mtx;

                if (schematic.compArgs) {
                    let libItem = createSchematicCompDef(schematic.id, schematic.name, schematic.snapshot.mainSchematic, schematic.compArgs);
                    compLibrary.addLibraryItem(libItem);
                }
            }
            console.log('saving schematic with id to local storage: ' + schemId);
            schematicLib.saveToLocalStorage(schemId);
        }
    }, [schematicLib, compLibrary, editorStore, editorState.activeSchematicId, editorState.snapshot]);

    return null;
});
