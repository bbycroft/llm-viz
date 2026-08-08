'use client';

import { useEffect } from "react";
import { notifyExeModelUpdated, useEditorContext } from "../Editor";
import { isNotNil } from "@/src/utils/data";
import { IExeComp } from "../CpuModel";
import { stepExecutionCombinatorial } from "../CpuExecution";
import { ICompDataRegFile } from "../comps/Registers";

export const AutoLoadRegisters: React.FC<{
    values: number[]
}> = ({ values }) => {
    let [editorState, setEditorState] = useEditorContext();
    let exeModel = editorState.exeModel;

    useEffect(() => {
        if (exeModel) {

            let regComp = editorState.snapshot.mainSchematic.comps.find(c => c.defId === 'core/riscv/reg32');

            if (regComp) {
                let exeCompIdx = exeModel.lookup.compIdToIdx.get(regComp.id);
                if (isNotNil(exeCompIdx)) {
                    let exeComp = exeModel.comps[exeCompIdx!] as IExeComp<ICompDataRegFile>;

                    exeComp.data.file.set(values, 1)
                    stepExecutionCombinatorial(exeModel);
                    setEditorState(notifyExeModelUpdated);
                }
            } else {
                console.log(editorState.snapshot.mainSchematic.comps);
            }
        }
    }, [setEditorState, exeModel, editorState.snapshot.mainSchematic.comps, values]);

    return null;
}
