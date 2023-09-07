import React, { memo, useState } from 'react';
import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, IExeComp, IExePort, PortType } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';
import { CompRectBase } from './RenderHelpers';
import s from './CompStyles.module.scss';
import { HexValueEditor, HexValueInputType } from '../displayTools/HexValueEditor';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { Popup, PopupPos } from '@/src/utils/Portal';
import clsx from 'clsx';

interface IInputConfig {
    value: number;
    valueMode: HexValueInputType;
    bitWidth: number;
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
            { id: 'x', name: 'x', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
        ],
        build: (builder) => {
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


    let constW = 10;
    let const32: ICompDef<ICompDataInput, IInputConfig> = {
        defId: 'const32',
        name: "Const32",
        size: new Vec3(constW, h),
        ports: [
            { id: 'out', name: '', pos: new Vec3(constW, h/2), type: PortType.Out, width: 32 },
        ],
        initConfig: () => ({ value: 4, valueMode: HexValueInputType.Hex, bitWidth: 32 }),
        build: (builder) => {
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
            // ctx.textAlign = 'center';
            // ctx.textBaseline = 'middle';
            // ctx.font = `${styles.fontSize}px monospace`;
            // ctx.fillStyle = 'black';
            // ctx.fillText('' + ensureSigned32Bit(exeComp?.data.value ?? 0), comp.pos.x + comp.size.x / 2, comp.pos.y + comp.size.y * 0.5);
        },

        renderDom: ({ comp, exeComp, styles }) => {
            return <InputEditor comp={comp} exeComp={exeComp} styles={styles} />;
        },
    };

    return [output, const32];
}

export const InputEditor: React.FC<{
    comp: IComp<IInputConfig>,
    exeComp: IExeComp<ICompDataInput>, styles: any,
}> = memo(function InputEditor({ comp, exeComp, styles }) {
    let { setEditorState } = useEditorContext();

    function editValue(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(end, comp, a => assignImm(a, { value, valueMode })));
    }

    function editBitWidth(end: boolean, value: number) {
        setEditorState(editCompConfig(end, comp, a => assignImm(a, { bitWidth: value })));
    }

    return <CompRectBase comp={comp} className={s.inputNumber} hideHover={true}>
        <HexValueEditor inputType={comp.args.valueMode} value={comp.args.value} update={editValue} minimalBackground />
        <ConfigMenu btnClassName={s.configMenuTopRight}>
            <MenuRow title={"Value"}>
                <HexValueEditor inputType={comp.args.valueMode} value={comp.args.value} update={editValue} />
            </MenuRow>
            <MenuRow title={"Bit Width"}>
                <HexValueEditor inputType={HexValueInputType.Dec} hidePrefix value={comp.args.bitWidth} update={editBitWidth} />
             </MenuRow>
        </ConfigMenu>
    </CompRectBase>;
});


export const MenuRow: React.FC<{
    title: string,
    children?: React.ReactNode,
}> = ({ title, children }) => {

    return <div className={s.menuRow}>
        <div className={s.title}>{title}</div>
        <div className={s.content}>{children}</div>
    </div>
};

export const ConfigMenu: React.FC<{
    btnClassName?: string,
    children?: React.ReactNode,
}> = ({ btnClassName: className, children }) => {

    let [btnRef, setBtnRef] = useState<HTMLElement | null>(null);

    let [visible, setVisible] = useState(false);

    return <>
        <button className={clsx(s.configMenuBtn, className)} ref={setBtnRef} onClick={() => setVisible(true)}>
            <FontAwesomeIcon icon={faCog} />
        </button>
        {visible && <Popup targetEl={btnRef} placement={PopupPos.BottomLeft} className={s.compPopup} onClose={() => setVisible(false)} closeBackdrop={true}>
            {children}
        </Popup>}
    </>;
};
