import React, { useEffect } from "react";
import { useEditorContext } from "./Editor";
import s from "./CompExampleView.module.scss";
import { IElfTextSection, listElfTextSections, readElfHeader } from "./ElfParser";
import { ICompDataRom } from "./comps/SimpleMemory";
import { IExeComp } from "./CpuModel";

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
        let romComp = exeModel.comps.find(comp => comp.comp.defId === 'rom0') as IExeComp<ICompDataRom> | undefined;
        if (romComp) {
            romComp.data.rom.set(example.elfSection.arr);
        }
        setEditorState(a => ({ ...a }));
    }

    function onStepClicked() {
        console.log('we should step here!');
        let order = exeModel.compExecutionOrder;

        for (let i = 0; i < order.length; i++) {
            let comp = order[i];
        }
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
            <button onClick={onStepClicked}>Step</button>
        </div>

    </div>;
};
