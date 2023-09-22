import React, { memo, useState } from 'react';
import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, IEditContext, IExeComp, IExePort, PortType } from "../CpuModel";
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
        defId: 'io/output0',
        altDefIds: ['output0'],
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
        defId: 'io/const32',
        altDefIds: ['const32'],
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

        renderDom: ({ comp, exeComp, styles, editCtx }) => {
            return <InputEditor editCtx={editCtx} comp={comp} exeComp={exeComp} styles={styles} />;
        },
    };

    return [output, const32];
}

export const InputEditor: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IInputConfig>,
    exeComp: IExeComp<ICompDataInput>, styles: any,
}> = memo(function InputEditor({ editCtx, comp, exeComp, styles }) {
    let { setEditorState } = useEditorContext();

    function editValue(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { value, valueMode })));
    }

    function editBitWidth(end: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { bitWidth: value })));
    }

    return <CompRectBase comp={comp} className={s.inputNumber} hideHover={true}>
        <HexValueEditor inputType={comp.args.valueMode} value={comp.args.value} update={editValue} minimalBackground />
        <ConfigMenu className={s.configMenuTopRight}>
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
    title: React.ReactNode,
    children?: React.ReactNode,
    disabled?: boolean,
}> = ({ title, children, disabled }) => {

    return <div className={clsx("flex flex-col mx-4 my-2", disabled && "opacity-50")}>
        <div className={"text-sm"}>{title}</div>
        <div className={""}>{children}</div>
    </div>
};

export const CheckboxMenuTitle: React.FC<{
    title: React.ReactNode,
    value: boolean,
    update: (end: boolean, value: boolean) => void,
}> = ({ title, value, update }) => {

    return <label className="text-sm flex items-center group cursor-pointer">
        <input type="checkbox" className="mr-2 relative group-hover:drop-shadow" checked={value} onChange={e => update(true, e.target.checked)} />
        {title}
    </label>;
};

export const ConfigMenu: React.FC<{
    className?: string,
    children?: React.ReactNode,
}> = ({ className, children }) => {

    let [btnRef, setBtnRef] = useState<HTMLElement | null>(null);

    let [visible, setVisible] = useState(false);

    return <>
        <button className={clsx(s.configMenuBtn, className)} ref={setBtnRef} onClick={() => setVisible(true)}>
            <FontAwesomeIcon icon={faCog} />
        </button>
        {visible && <Popup
            targetEl={btnRef}
            placement={PopupPos.BottomLeft}
            className={"tex-lg shadow-lg border-gray-700 bg-gray-400 rounded"}
            onClose={() => setVisible(false)}
            closeBackdrop={true}>

            {children}
        </Popup>}
    </>;
};
