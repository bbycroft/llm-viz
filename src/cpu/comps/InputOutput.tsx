import React, { memo, useState } from 'react';
import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IExeComp, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';
import { CompRectBase, CompRectUnscaled, makeEditFunction, CheckboxMenuTitle, ConfigMenu, MenuRow } from './RenderHelpers';
import s from './CompStyles.module.scss';
import { HexValueEditor, HexValueInputType, clampToSignedWidth } from '../displayTools/HexValueEditor';
import { FontType, makeCanvasFont } from '../CanvasRenderHelpers';
import { PortPlacement, PortResizer, portPlacementToPos } from './CompPort';
import { ensureSigned32Bit } from './RiscvInsDecode';
import { EditKvp } from '../CompDetails';
import { BooleanEditor } from '../displayTools/BooleanEditor';

interface IInputConfig extends IBaseCompConfig {
    value: number;
    valueMode: HexValueInputType;
    bitWidth: number;
    w: number;
    h: number;
    portPos: PortPlacement;
    rotate: number;
    signed: boolean;
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
    let output: ICompDef<ICompDataOutput, IInputConfig> = {
        defId: 'io/output0',
        altDefIds: ['output0'],
        name: "Output",
        size: new Vec3(w, h),
        flags: CompDefFlags.HasBitWidth | CompDefFlags.CanRotate | CompDefFlags.IsAtomic,
        ports: (args, compDef) => {
            let portType = PortType.In;
            let pos = portPlacementToPos(0, args.w, args.h);

            return [
                { id: 'x', name: '', pos, type: portType, width: args.bitWidth },
            ];
        },
        initConfig: () => ({
            value: 4,
            valueMode: HexValueInputType.Hex,
            bitWidth: 32,
            h: 4,
            w: constW,
            portPos: PortPlacement.Right,
            rotate: 0,
            signed: false,
        }),
        applyConfig: (comp, args) => {
            // args.portPos ??= PortPlacement.Right;
            // args.rotate ??= args.portPos;
            comp.size = new Vec3(args.w, args.h);
        },
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
            ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let value = exeComp.data.inPort.value;
            let bb = comp.bb;
            ctx.fillText(value.toString(), bb.center().x, bb.center().y + 0.1);

            ctx.restore();
        },
        renderDom: ({ comp, editCtx, isActive }) => {
            return isActive && <PortResizer editCtx={editCtx} comp={comp} />;
        },
    };


    let constW = 10;
    let const32: ICompDef<ICompDataInput, IInputConfig> = {
        defId: 'io/const32',
        altDefIds: ['const32'],
        name: "Const32",
        size: new Vec3(constW, h),
        flags: CompDefFlags.HasBitWidth | CompDefFlags.CanRotate | CompDefFlags.IsAtomic,
        ports: (args, compDef) => {
            let portType = PortType.Out;
            let pos = portPlacementToPos(0, args.w, args.h);

            return [
                { id: 'out', name: '', pos, type: portType, width: args.bitWidth },
            ];
        },
        initConfig: () => ({
            value: 4,
            valueMode: HexValueInputType.Hex,
            bitWidth: 32,
            h: 4,
            w: constW,
            portPos: PortPlacement.Right,
            rotate: 0,
            signed: false,
        }),
        applyConfig: (comp, args) => {
            // args.portPos ??= PortPlacement.Right;
            // args.rotate ??= args.portPos;
            comp.size = new Vec3(args.w, args.h);
        },
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
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
            ctx.fillStyle = 'black';
            let bb = comp.bb;
            ctx.fillText('' + ensureSigned32Bit(exeComp?.data.value ?? 0), bb.center().x, bb.center().y + 0.1);
        },
        renderOptions: ({ comp, exeComp, editCtx }) => {
            return <InputOptions editCtx={editCtx} comp={comp} exeComp={exeComp} />;
        },
        renderDom: ({ comp, editCtx, isActive }) => {
            return isActive && <PortResizer editCtx={editCtx} comp={comp} />;
        },
    };

    return [output, const32];
}

const InputOptions: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IInputConfig>,
    exeComp: IExeComp<ICompDataInput> | null,
}> = memo(function InputEditor({ editCtx, comp }) {
    let [, setEditorState] = useEditorContext();

    let editBitWidth = makeEditFunction(setEditorState, editCtx, comp, (value: number) => ({ bitWidth: value }));
    let editSigned = makeEditFunction(setEditorState, editCtx, comp, (value: boolean) => ({
        signed: value,
        value: clampToSignedWidth(comp.args.value, comp.args.bitWidth, value),
    }));

    function editValue(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { value, valueMode })));
    }

    return <>
        <EditKvp label='Value'>
            <HexValueEditor
                inputType={comp.args.valueMode}
                value={comp.args.value}
                update={editValue}
                maxBits={comp.args.bitWidth}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
                minimalBackground
            />
        </EditKvp>
        <EditKvp label='Signed'>
            <BooleanEditor value={comp.args.signed} update={editSigned} />
        </EditKvp>
    </>;
});


const InputEditor: React.FC<{
    editCtx: IEditContext,
    isActive: boolean,
    comp: IComp<IInputConfig>,
    exeComp: IExeComp<ICompDataInput>, styles: any,
}> = memo(function InputEditor({ editCtx, comp, isActive }) {
    let [, setEditorState] = useEditorContext();

    let editBitWidth = makeEditFunction(setEditorState, editCtx, comp, (value: number) => ({ bitWidth: value }));
    let editSigned = makeEditFunction(setEditorState, editCtx, comp, (value: boolean) => ({
        signed: value,
        value: clampToSignedWidth(comp.args.value, comp.args.bitWidth, value),
    }));

    function editValue(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { value, valueMode })));
    }

    return <>
        <CompRectBase comp={comp} className={s.inputNumber} hideHover={true}>
            <HexValueEditor
                    className="absolute inset-0 px-2 text-2xl"
                    inputType={comp.args.valueMode}
                    value={comp.args.value}
                    update={editValue}
                    minimalBackground
                    readonly={false}
                    inputClassName="text-center"
                    maxBits={comp.args.bitWidth}
                    // padBits={comp.args.bitWidth}
                    signed={comp.args.signed}
                    hidePrefix
            />
        </CompRectBase>
        {isActive && <CompRectUnscaled comp={comp} hideHover>
            <ConfigMenu className="absolute top-1 right-1 text-2xl">
                <MenuRow title={"Value"}>
                    <HexValueEditor
                        inputType={comp.args.valueMode}
                        value={comp.args.value}
                        update={editValue}
                        maxBits={comp.args.bitWidth}
                        padBits={comp.args.bitWidth}
                        signed={comp.args.signed}
                    />
                </MenuRow>
                <MenuRow title={"Bit Width"}>
                    <HexValueEditor inputType={HexValueInputType.Dec} hidePrefix value={comp.args.bitWidth} update={editBitWidth} />
                </MenuRow>
                <MenuRow title={<CheckboxMenuTitle title="Signed" value={comp.args.signed} update={editSigned} />} />
            </ConfigMenu>
        </CompRectUnscaled>}
        {isActive && <PortResizer editCtx={editCtx} comp={comp} />}
    </>;
});


