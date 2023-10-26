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
    let { editorState, exeModel } = useEditorContext();
    let codeSuite = useGetCodeSuite(editorState.codeLibrary, fileName);

    useEffect(() => {
        if (exeModel && codeSuite) {

            let entry = section ? codeSuite.entries.find(e => e.name === section) : codeSuite.entries[0];

            if (!entry) {
                return;
            }

            let romComp = editorState.snapshot.comps.find(c => c.defId === 'core/mem/rom0');

            if (romComp) {
                let exeCompIdx = exeModel.lookup.compIdToIdx.get(romComp.id);
                if (isNotNil(exeCompIdx)) {
                    let exeComp = exeModel.comps[exeCompIdx!] as IExeComp<IRomExeData>;

                    let romArr = exeComp.data.rom;
                    romArr.set(entry.elfSection.arr);
                    romArr.fill(0, entry.elfSection.arr.length);
                    exeComp.data.updateCntr += 1;
                }
            }
        }
    }, [exeModel, codeSuite, editorState.snapshot.comps, section]);

    return null;
}
