import React, { memo } from "react";
import { StateSetter, assignImm, hasFlag } from "@/src/utils/data";
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditorState, IExeComp, IExePort, PortType } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import { editCompConfig, useEditorContext } from "../Editor";
import { HexValueEditor, HexValueInputType, clampToSignedWidth } from "../displayTools/HexValueEditor";
import { CheckboxMenuTitle, ConfigMenu, MenuRow } from "./InputOutput";

export interface ICompPortConfig {
    portId: string;
    name: string;
    type: PortType;
    width: number;
    signed: boolean;
    inputOverride: boolean;
    inputValueOverride: number;
    valueMode: HexValueInputType;
}

export interface ICompPortData {
    port: IExePort;
    value: number;
}

export function createCompIoComps(args: ICompBuilderArgs) {

    let w = 6;
    let h = 6;
    let compPort: ICompDef<ICompPortData, ICompPortConfig> = {
        defId: 'comp/port',
        name: "Port",
        size: new Vec3(w, h),
        ports: (args, compDef) => {

            let internalPortDir = switchPortDir(args.type);

            return [
                { id: 'a', name: '', pos: new Vec3(w, 3), type: internalPortDir, width: args.width },
            ];
        },
        initConfig: () => ({
            portId: '',
            name: '',
            type: PortType.Out,
            width: 1,
            signed: false,
            valueMode: HexValueInputType.Dec,
            inputOverride: false,
            inputValueOverride: 0,
        }),
        applyConfig(comp, args) {
            // let mat = rotateAboutAffineInt(args.rotate, rotateCenter);
            // comp.ports = comp.ports.map(p => {
            //     return { ...p, pos: mat.mulVec3(p.pos) }
            // });
        },
        build: (builder) => {
            let args = builder.comp.args;
            let isInput = hasFlag(args.type, PortType.In);

            let data = builder.addData({
                port: builder.getPort('a'),
                value: isInput && args.inputOverride ? args.inputValueOverride : 0,
            });

            if (isInput) {
                builder.addPhase(({ data }) => {
                    data.port.value = data.value;
                    data.port.ioEnabled = true;
                }, [], [data.port]);

            } else {
                builder.addPhase(({ data }) => {
                    data.value = data.port.value;
                    data.port.ioEnabled = true;
                }, [data.port], []);
            }

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            ctx.fillStyle = 'rgb(251, 146, 60)';
            // let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            // ctx.transform(...mtx.toTransformParams());

            ctx.beginPath();
            // basic structure is a circle
            let p = comp.pos;
            let s = comp.size;
            let center = p.mulAdd(s, 0.5);
            ctx.moveTo(p.x + s.x, center.y);
            ctx.arc(center.x, center.y, s.x / 2, 0, 2 * Math.PI);

            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        renderDom: ({ comp, exeComp, ctx, styles }) => {

            return <PortEditor comp={comp} exeComp={exeComp} styles={styles} />;
        },
    };

    return [compPort];
}

export function switchPortDir(dir: PortType) {
    let newDir = dir & ~(PortType.In | PortType.Out);

    if (hasFlag(dir, PortType.In)) {
        newDir |= PortType.Out;
    }
    if (hasFlag(dir, PortType.Out)) {
        newDir |= PortType.In;
    }

    return newDir;
}

function makeEditFunction<T, A>(setEditorState: StateSetter<IEditorState>, comp: IComp<T>, updateFn: (value: A, prev: T) => Partial<T>) {
    return (end: boolean, value: A) => {
        setEditorState(editCompConfig(end, comp, a => assignImm(a, updateFn(value, a))));
    };
}

const PortEditor: React.FC<{
    comp: IComp<ICompPortConfig>,
    exeComp: IExeComp<ICompPortData>, styles: any,
}> = memo(function PortEditor({ comp, exeComp, styles }) {
    let { setEditorState } = useEditorContext();

    let editIsOverriden = makeEditFunction(setEditorState, comp, (value: boolean) => ({ inputOverride: value }));
    let editBitWidth = makeEditFunction(setEditorState, comp, (value: number) => ({ width: value, inputValueOverride: clampToSignedWidth(comp.args.inputValueOverride ?? 0, value, comp.args.signed) }));
    let editSigned = makeEditFunction(setEditorState, comp, (value: boolean) => ({ signed: value, inputValueOverride: clampToSignedWidth(comp.args.inputValueOverride ?? 0, comp.args.width, value) }));
    let editPortType = makeEditFunction(setEditorState, comp, (isInputPort: boolean, prev) => {
            let type = prev.type;
            if (isInputPort) {
                type |= PortType.In;
                type &= ~PortType.Out;
            } else {
                type |= PortType.Out;
                type &= ~PortType.In;
            }
            return { type };
    });

    function editValueOverride(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(end, comp, a => assignImm(a, { inputValueOverride: value, valueMode })));
    }

    let isInput = hasFlag(comp.args.type, PortType.In);
    let isInputOverride = comp.args.inputOverride;

    return <CompRectBase comp={comp} className={"pr-1"} hideHover={true}>
        {isInput && <HexValueEditor
            className="absolute inset-0 px-2"
            inputType={comp.args.valueMode}
            value={comp.args.inputValueOverride}
            update={editValueOverride}
            minimalBackground
            inputClassName="text-center"
            maxBits={comp.args.width}
            padBits={comp.args.width}
            signed={comp.args.signed}
            hidePrefix
        />}
        {!isInput && <HexValueEditor
            className="absolute inset-0 px-2"
            value={exeComp?.data.value ?? 0}
            minimalBackground
            inputClassName="text-center"
            update={(end, _val, inputType) => editValueOverride(end, comp.args.inputValueOverride, inputType)}
            inputType={comp.args.valueMode}
            padBits={comp.args.width}
            signed={comp.args.signed}
            readonly
            hidePrefix
        />}
        <ConfigMenu className={"absolute top-[12px] right-[12px]"}>
            <MenuRow title={<CheckboxMenuTitle title="Input" value={isInput} update={editPortType} />} />
            <MenuRow title={<CheckboxMenuTitle title="Override Value" value={isInputOverride} update={editIsOverriden} />} disabled={!isInput}>
                <HexValueEditor
                    inputType={comp.args.valueMode}
                    value={comp.args.inputValueOverride}
                    update={editValueOverride}
                    maxBits={comp.args.width}
                    padBits={comp.args.width}
                    signed={comp.args.signed}
                />
            </MenuRow>
            <MenuRow title={"Bit Width"}>
                <HexValueEditor inputType={HexValueInputType.Dec} hidePrefix value={comp.args.width} update={editBitWidth} />
             </MenuRow>
            <MenuRow title={<CheckboxMenuTitle title="Signed" value={comp.args.signed} update={editSigned} />} />
        </ConfigMenu>
    </CompRectBase>;
});
