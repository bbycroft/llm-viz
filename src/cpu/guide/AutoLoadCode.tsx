'use client';

import { useEffect } from "react";
import { useEditorContext } from "../Editor";
import { useGetCodeSuite } from "../library/CodeSuiteManager";
import { isNotNil } from "@/src/utils/data";
import { IExeComp } from "../CpuModel";
import { IRomExeData } from "../comps/SimpleMemory";

export const AutoLoadCode: React.FC<{
    fileName: string,
    section?: string;
}> = ({ fileName, section }) => {
    let { editorState, setEditorState, exeModel } = useEditorContext();
    let codeSuite = useGetCodeSuite(editorState.codeLibrary, fileName);

    useEffect(() => {
        if (exeModel && codeSuite && codeSuite.entries.length > 0 && editorState.snapshot.mainSchematic.comps.length > 0) {

            let entry = section ? codeSuite.entries.find(e => e.name === section) : codeSuite.entries[0];

            if (!entry) {
                console.warn(`Could not find code entry ${section} in ${fileName}`);
                return;
            }

            let romComp = editorState.snapshot.mainSchematic.comps.find(c => c.defId === 'core/mem/rom0');

            if (romComp) {
                let exeCompIdx = exeModel.lookup.compIdToIdx.get(romComp.id);
                if (isNotNil(exeCompIdx)) {
                    let exeComp = exeModel.comps[exeCompIdx!] as IExeComp<IRomExeData>;

                    let romArr = exeComp.data.rom;
                    romArr.set(entry.elfSection.arr);
                    romArr.fill(0, entry.elfSection.arr.length);
                    exeComp.data.updateCntr += 1;
                    setEditorState(e => ({ ...e }));
                }
            } else {
                console.log(editorState.snapshot.mainSchematic.comps);
            }
        }
    }, [setEditorState, exeModel, codeSuite, editorState.snapshot.mainSchematic.comps, section, fileName]);

    return null;
}
