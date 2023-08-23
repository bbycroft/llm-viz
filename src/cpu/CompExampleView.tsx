import React, { useEffect } from "react";
import { useEditorContext } from "./Editor";
import s from "./CompExampleView.module.scss";
import { IElfTextSection, listElfTextSections, readElfHeader } from "./ElfParser";
import { ICompDataRom } from "./comps/SimpleMemory";
import { IExeComp } from "./CpuModel";
import { runNet } from "./comps/ComponentDefs";
import { ICompDataRegFile, ICompDataSingleReg } from "./comps/Registers";
import { stepExecutionCombinatorial, stepExecutionLatch } from "./CpuExecution";
import { ensureSigned32Bit } from "./comps/RiscvInsDecode";

interface IExampleEntry {
    name: string;
    elfSection: IElfTextSection;
}

export const CompExampleView: React.FC = () => {
    let { editorState, setEditorState, exeModel } = useEditorContext();

    let [examples, setExamples] = React.useState<IExampleEntry[]>([]);

    useEffect(() => {
        let basePath = (process.env.BASE_URL ?? '') + '/riscv/examples/';

        async function run() {
            let resp = await fetch(basePath + 'add_tests');

            if (resp.ok) {
                let elfFile = new Uint8Array(await resp.arrayBuffer());

                let header = readElfHeader(elfFile)!;
                let sections = listElfTextSections(elfFile, header);

                let examples = sections.map(section => {
                    // name is '.text_add0', and we want 'add0'
                    return {
                        name: section.name.slice(6),
                        elfSection: section,
                    };
                });

                setExamples(examples);
            }
        }

        run();

    }, []);

    function handleEntryClick(example: IExampleEntry) {
        let romComp = getRomComp();
        if (romComp) {
            let romArr = romComp.data.rom;
            romArr.set(example.elfSection.arr);
            romArr.fill(0, example.elfSection.arr.length);
        }
        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    function onStepClicked() {
        // console.log('--- running execution (latching followed by steps) ---', exeModel);
        if (!exeModel.runArgs.halt) {
            stepExecutionLatch(exeModel);
        }

        if (!exeModel.runArgs.halt) {
            console.log('--- halted ---');
            stepExecutionCombinatorial(exeModel);
        }

        setEditorState(a => ({ ...a }));
    }

    function onRunAllTestsClicked() {
        console.log('running all tests...');
        let startTime = performance.now();
        let successCount = 0;
        let totalCount = 0;
        for (let test of examples) {
            handleEntryClick(test);
            onResetClicked();
            totalCount += 1;
            let completed = false;

            for (let i = 0; i < 200; i++) {
                if (exeModel.runArgs.halt) {
                    let regs = getRegsComp();
                    let resRegValue = regs?.data.file[10] ?? 0;

                    if (resRegValue !== 44 && resRegValue !== 911) {
                        console.log(`--- halted with unknown result in reg[a0]: ${ensureSigned32Bit(resRegValue)} ---`);
                    } else {
                        let isSuccess = (resRegValue === 44) !== test.name.startsWith('must_fail');

                        if (isSuccess) {
                            successCount += 1;
                            console.log(`--- halted with success ---`);
                        } else {
                            console.log(`--- halted with FAILURE ---`);
                        }
                    }
                    completed = true;
                    break;
                }

                stepExecutionLatch(exeModel);
                stepExecutionCombinatorial(exeModel);
            }

            if (!completed) {
                console.log(`--- halted after too many instructions ---`);
            }
        }
        let endTime = performance.now();
        console.log(`All tests done in ${(endTime - startTime).toFixed(1)}ms. Success: ${successCount}/${totalCount}.`);
    }

    function findCompByDefId(defId: string) {
        return exeModel.comps.find(comp => comp.comp.defId === defId);
    }

    function getPcComp() {
        return findCompByDefId('reg1') as IExeComp<ICompDataSingleReg> | undefined;
    }
    function getRegsComp() {
        return findCompByDefId('reg32Riscv') as IExeComp<ICompDataRegFile> | undefined;
    }
    function getRomComp() {
        return findCompByDefId('rom0') as IExeComp<ICompDataRom> | undefined;
    }

    function onResetClicked() {
        let pcComp = getPcComp();
        let regComp = getRegsComp();

        if (pcComp && regComp) {
            pcComp.data.value = 0;
            for (let i = 0; i < regComp.data.file.length; i++) {
                regComp.data.file[i] = 0;
            }
        } else {
            console.log('could not find pc or reg comp');
        }

        exeModel.runArgs.halt = false;

        stepExecutionCombinatorial(exeModel);

        setEditorState(a => ({ ...a }));
    }

    return <div className={s.exampleView}>
        <div className={s.header}>Examples</div>

        <div className={s.body}>
            {examples.map((example, idx) => {

                return <div
                    className={s.entry}
                    onClick={() => handleEntryClick(example)}
                    key={idx}
                >{example.name}</div>;
            })}
        </div>

        <div className={s.divider} />

        <div className={s.body}>
            <button className={s.btn} disabled={exeModel.runArgs.halt} onClick={onStepClicked}>Step</button>
            <button className={s.btn} onClick={onResetClicked}>Reset</button>
            <button className={s.btn} onClick={onRunAllTestsClicked}>Run all</button>
        </div>

    </div>;
};
