import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, IExeComp, IExePort, PortDir } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { ensureSigned32Bit } from "./RiscvInsDecode";
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';
import { CompRectBase } from './RenderHelpers';
import s from './CompStyles.module.scss';

interface IInputConfig {
    value: number;
}

interface ICompDataOutput {
    inPort: IExePort;
}

export interface ICompDataInput {
    outPort: IExePort;
    value: number;
}

export function createInputOutputComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 6;
    let h = 4;
    let output: ICompDef<ICompDataOutput> = {
        defId: 'output0',
        name: "Output",
        size: new Vec3(w, h),
        ports: [
            { id: 'x', name: 'x', pos: new Vec3(0, 2), type: PortDir.In, width: 32 },
        ],
        build2: (builder) => {
            let data = builder.addData({
                inPort: builder.getPort('x'),
            });

            builder.addPhase(() => { }, [data.inPort], []);

            return builder.build();
        },
        render: ({ comp, cvs, ctx, exeComp, styles }) => {
            if (!exeComp) {
                return;
            }

            ctx.save();
            ctx.font = `${styles.fontSize}px monospace`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let value = exeComp.data.inPort.value;
            ctx.fillText(value.toString(), comp.pos.x + comp.size.x / 2, comp.pos.y + comp.size.y / 2);

            ctx.restore();
        },
    };


    let const32: ICompDef<ICompDataInput, IInputConfig> = {
        defId: 'const32',
        name: "Const32",
        size: new Vec3(w, h),
        ports: [
            { id: 'out', name: '', pos: new Vec3(w, h/2), type: PortDir.Out, width: 32 },
        ],
        initConfig: () => ({ value: 4 }),
        build2: (builder) => {
            let data = builder.addData({
                value: builder.comp.args.value,
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data }) => {
                data.outPort.value = data.value;
            }, [], [data.outPort]);

            return builder.build();
        },
        render: ({ comp, ctx, cvs, exeComp, styles }) => {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${styles.fontSize}px monospace`;
            ctx.fillStyle = 'black';
            ctx.fillText('' + ensureSigned32Bit(exeComp?.data.value ?? 0), comp.pos.x + comp.size.x / 2, comp.pos.y + comp.size.y * 0.5);
        },

        renderDom: ({ comp, cvs, exeComp, styles }) => {

            return <InputEditor comp={comp} exeComp={exeComp} styles={styles} cvs={cvs} />;
        },
    };

    return [output, const32];
}

export const InputEditor: React.FC<{
    comp: IComp<IInputConfig>,
    cvs: ICanvasState,
    exeComp: IExeComp<ICompDataInput>, styles: any,
}> = ({ comp, exeComp, cvs, styles }) => {
    let { setEditorState } = useEditorContext();

    function editValue(e: React.ChangeEvent<HTMLInputElement>, end: boolean) {
        let value = parseInt(e.target.value);
        if (isNaN(value)) {
            return;
        }

        setEditorState(editCompConfig(end, comp, a => assignImm(a, { value })));
    }

    return <CompRectBase comp={comp} cvs={cvs} >
        <input
            type="number"
            className={s.addrInput}
            value={comp.args.value ?? 0}
            onMouseDown={e => e.stopPropagation()}
            onChange={e => editValue(e, false)}
            onBlur={e => editValue(e, true)}
            style={{ maxWidth: '80%' }}
        />
    </CompRectBase>;
}
