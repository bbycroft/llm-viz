
import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import s from '../CompStyles.module.scss';
import riscvS from './Riscv.module.scss';

import { assignImm } from '@/src/utils/data';
import { ICanvasState, IComp, IEditContext, IExeComp, IExePort, PortType } from '../../CpuModel';
import { HexValueEditor, HexValueInputType } from '../../displayTools/HexValueEditor';
import { useEditorContext, editCompConfig } from '../../Editor';
import { ICompBuilderArgs, ICompDef } from '../CompBuilder';
import { CompRectBase } from '../RenderHelpers';
import { riscvInColor, riscvOutAColor, riscvOutBColor } from '../Registers';

interface IRegFileCtrlConfig {
    inEnable: boolean;
    inReg: number;

    outAEnable: boolean;
    outAReg: number;

    outBEnable: boolean;
    outBReg: number;
}

interface IRegFileCtrlData extends IRegFileCtrlConfig {
    ctrl: IExePort;
}

export function createRegFileCtrlComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 10;
    let h = 12;
    let regFileCtrl: ICompDef<IRegFileCtrlData, IRegFileCtrlConfig> = {
        defId: 'riscv/regFile0Input',
        altDefIds: ['riscvRegFile0Input'],
        name: "Reg File Input",
        size: new Vec3(w, h),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(w/2, h), type: PortType.Out | PortType.Ctrl, width: 3 * 6 },
        ],
        initConfig: () => ({ inEnable: false, inReg: 0, outAEnable: false, outAReg: 0, outBEnable: false, outBReg: 0 }),
        build: (builder) => {
            let args = builder.comp.args;
            let data = builder.addData({
                ...args,
                ctrl: builder.getPort('ctrl'),
            });

            // read from bus: ctrl, addr, data & wrte to local
            builder.addPhase(({ data: { ctrl } }) => {

                    // 0: read LHS, 1: read RHS, 2: write
                function setRegCtrl(enable: boolean, addr: number, offset: number) {
                    let a = (enable ? 1 : 0) | (addr & 0b11111) << 1;
                    let val = ctrl.value;
                    val = (val & ~(0b111111 << (offset * 6))) | (a << (offset * 6));
                    ctrl.value = val;
                }

                setRegCtrl(args.outAEnable, args.outAReg, 0);
                setRegCtrl(args.outBEnable, args.outBReg, 1);
                setRegCtrl(args.inEnable, args.inReg, 2);

            }, [], [data.ctrl]);

            return builder.build();
        },
        renderDom: ({ editCtx, comp, exeComp }) => {
            return <RegFileCtrl editCtx={editCtx} comp={comp} exeComp={exeComp} />;
        },
    };

    return [regFileCtrl];
}

export const RegFileCtrl: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IRegFileCtrlConfig>,
    exeComp: IExeComp<IRegFileCtrlData>,
}> = ({ editCtx, comp, exeComp }) => {

    let { setEditorState } = useEditorContext();

    function editAddrOffset(end: boolean, enabled: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { inReg: value, inEnable: enabled })));
    }

    function editOutRegA(end: boolean, enabled: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { outAReg: value, outAEnable: enabled })));
    }

    function editOutRegB(end: boolean, enabled: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { outBReg: value, outBEnable: enabled })));
    }

    return <CompRectBase comp={comp} className={s.compRegFileCtrl} hideHover>
        <RegSelect name={"In"} enabled={comp.args.inEnable} value={comp.args.inReg} setValue={editAddrOffset} color={riscvInColor} />
        <RegSelect name={"OutA"} enabled={comp.args.outAEnable} value={comp.args.outAReg} setValue={editOutRegA} color={riscvOutAColor} />
        <RegSelect name={"OutB"} enabled={comp.args.outBEnable} value={comp.args.outBReg} setValue={editOutRegB} color={riscvOutBColor} />
    </CompRectBase>;
};

export const RegSelect: React.FC<{
    name: string,
    enabled: boolean,
    value: number,
    color?: string,
    setValue: (end: boolean, enabled: boolean, value: number) => void,
}> = ({ name, enabled, value, setValue, color }) => {

    function editEnabled(ev: React.ChangeEvent, end: boolean, enabled: boolean) {
        setValue(end, enabled, value);
        ev.stopPropagation();
        ev.preventDefault();
    }

    function editValue(end: boolean, value: number) {
        setValue(end, enabled, value);
    }

    return <div className={s.regSelect}>
        <label onDoubleClick={ev => ev.preventDefault()}>
            <div className={s.text} style={{ backgroundColor: color }}>{name}</div>
            <input type="checkbox" checked={enabled} onChange={ev => editEnabled(ev, true, ev.target.checked)} />
        </label>
        <HexValueEditor
            className={s.regHex}
            value={value}
            update={editValue}
            inputType={HexValueInputType.Dec}
            fixedInputType
            hidePrefix
            minimalBackground
            padBits={5}
        />
    </div>;
};
