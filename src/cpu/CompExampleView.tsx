import React, { useEffect, useState } from "react";
import { useEditorContext } from "./Editor";
import s from "./CompExampleView.module.scss";
import { listElfTextSections, readElfHeader } from "./ElfParser";
import { IRomExeData } from "./comps/SimpleMemory";
import { IExeComp } from "./CpuModel";
import { ICompDataRegFile, ICompDataSingleReg } from "./comps/Registers";
import { resetExeModel, stepExecutionCombinatorial, stepExecutionLatch } from "./CpuExecution";
import { ensureSigned32Bit } from "./comps/RiscvInsDecode";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { ICodeEntry } from "./library/CodeSuiteManager";


export const CompExampleView: React.FC = () => {
    let { editorState, setEditorState, exeModel } = useEditorContext();

    let [examples, setExamples] = useState<ICodeEntry[]>([]);
    let [reloadCntr, setReloadCntr] = useState(0);

    useEffect(() => {
        let basePath = (process.env.BASE_URL ?? '') + '/riscv/examples/';

        async function run() {
            let fileName = 'add_tests.elf';
            // let fileName = 'blinky2.elf';

            let resp = await fetch(basePath + fileName);

            if (resp.ok) {
                let elfFile = new Uint8Array(await resp.arrayBuffer());

                let header = readElfHeader(elfFile)!;
                let sections = listElfTextSections(elfFile, header);

                let examples = sections.map(section => {
                    // name is '.text_add0', and we want 'add0'
                    let name = section.name.slice(6) || section.name;
                    return {
                        name,
                        elfSection: section,
                        expectFail: name.startsWith('must_fail'),
                    };
                });

                setExamples(examples);
            }
        }

        run();

    }, [reloadCntr]);

    function handleEntryClick(example: ICodeEntry) {
        loadEntryData(example);
        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    function onStepClicked() {
        // console.log('--- running execution (latching followed by steps) ---', exeModel);
        if (!exeModel.runArgs.halt) {
            stepExecutionLatch(exeModel);
        }

        if (!exeModel.runArgs.halt) {
            stepExecutionCombinatorial(exeModel);
        }

        setEditorState(a => ({ ...a }));
    }

    function loadEntryData(example: ICodeEntry) {
        let romComp = getRomComp();
        if (romComp) {
            let romArr = romComp.data.rom;
            romArr.set(example.elfSection.arr);
            romArr.fill(0, example.elfSection.arr.length);
            romComp.data.updateCntr += 1;
        }
    }

    function onRunAllTestsClicked() {
        console.log('Running all tests...');
        let startTime = performance.now();
        let successCount = 0;
        let totalCount = 0;
        let insCount = 0;
        let repeatCount = 0;
        for (; repeatCount < 100 && successCount === totalCount; repeatCount++) {
            for (let test of examples) {
                loadEntryData(test);
                resetExeModel(exeModel, { hardReset: false });
                stepExecutionCombinatorial(exeModel, true);

                totalCount += 1;
                let completed = false;

                for (let i = 0; i < 400; i++) {
                    if (exeModel.runArgs.halt) {
                        let regs = getRegsComp();
                        let resRegValue = regs?.data.file[10] ?? 0;
                        let testNumValue = regs?.data.file[11] ?? 0;

                        if (resRegValue !== 44 && resRegValue !== 911) {
                            console.log(`--- test '${test.name}' halted with unknown result in reg[a0]: ${ensureSigned32Bit(resRegValue)} ---`);
                        } else {
                            let isSuccess = (resRegValue === 44) !== test.expectFail;

                            if (isSuccess) {
                                successCount += 1;
                                // console.log(`--- halted with success ---`);
                            } else {
                                console.log(`--- test '${test.name}' halted with FAILURE (test ${testNumValue}) ---`);
                            }
                        }
                        completed = true;
                        break;
                    }

                    insCount += 1;
                    stepExecutionLatch(exeModel);
                    stepExecutionCombinatorial(exeModel, true);
                }

                if (!completed) {
                    console.log(`--- test '${test.name}' halted after too many instructions ---`);
                }
            }
        }
        let endTime = performance.now();
        let timeMs = endTime - startTime;
        console.log(`All tests done in ${timeMs.toFixed(1)}ms. Success: ${successCount}/${totalCount} (repeats=${repeatCount}). Instructions: ${insCount} (${(insCount / timeMs).toFixed(0)} kHz)`);

        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    async function runTestsQuickly() {
        for (let test of examples) {
            loadEntryData(test);
            resetExeModel(exeModel, { hardReset: false });
            stepExecutionCombinatorial(exeModel);

            let completed = false;

            for (let i = 0; i < 200; i++) {
                await new Promise(resolve => setTimeout(resolve, 10));
                setEditorState(a => ({ ...a }));

                stepExecutionCombinatorial(exeModel);
                if (exeModel.runArgs.halt) {
                    let regs = getRegsComp();
                    let resRegValue = regs?.data.file[10] ?? 0;
                    let testNumValue = regs?.data.file[11] ?? 0;

                    if (resRegValue !== 44 && resRegValue !== 911) {
                        console.log(`--- test '${test.name}' halted with unknown result in reg[a0]: ${ensureSigned32Bit(resRegValue)} ---`);
                    } else {
                        let isSuccess = (resRegValue === 44) !== test.expectFail;

                        if (isSuccess) {
                            // console.log(`--- halted with success ---`);
                        } else {
                            console.log(`--- test '${test.name}' halted with FAILURE (test ${testNumValue}) ---`);
                        }
                    }
                    completed = true;
                    break;
                }

                stepExecutionLatch(exeModel);
            }

            if (!completed) {
                console.log(`--- test '${test.name}' halted after too many instructions ---`);
            }
        }
    }

    function findCompByDefId(defId: string) {
        return exeModel.comps.find(comp => comp.comp.defId === defId);
    }

    function getPcComp() {
        return findCompByDefId('core/flipflop/reg1') as IExeComp<ICompDataSingleReg> | undefined;
    }
    function getRegsComp() {
        return findCompByDefId('core/riscv/reg32') as IExeComp<ICompDataRegFile> | undefined;
    }
    function getRomComp() {
        return findCompByDefId('core/mem/rom0') as IExeComp<IRomExeData> | undefined;
    }

    function onResetClicked() {
        resetExeModel(exeModel, { hardReset: false });
        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    return <div className={s.exampleView}>
        <div className={s.header}>Examples
            <div className={s.reloadBtn} onClick={() => setReloadCntr(a => a + 1)}>
                <FontAwesomeIcon icon={faRotate} />
            </div>
        </div>

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
            <button className={s.btn} onClick={runTestsQuickly}>Run all (slow)</button>
        </div>

    </div>;
};
