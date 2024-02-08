import React from "react";
import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { FontType, makeCanvasFont } from "../render/CanvasRenderHelpers";
import { editCompConfig, useEditorContext } from "../Editor";
import { assignImm } from "@/src/utils/data";
import { EditKvp } from "../sidebars/CompDetails";
import { StringEditor } from "../displayTools/StringEditor";
import { palleteColors } from "../palette";

export interface IBitComparitorConfig extends IBaseCompConfig {
    bitWidth: number; // input bit width
    match: string; // '0' or '1' or 'x' (where x is don't care)
}

interface IBitComparitorData {
    inPort: IExePort;
    outPort: IExePort;
}

export function createBitComparitorComps(_args: ICompBuilderArgs): ICompDef<any>[] {
    let w = 10;
    let h = 2;


    let bitComparitor: ICompDef<IBitComparitorData, IBitComparitorConfig> = {
        defId: 'bits/comparitor',
        name: "Bit Comparitor",
        size: new Vec3(w, h),
        flags: CompDefFlags.HasBitWidth,
        ports: (args) => {
            return [
                { id: 'i', name: '', pos: new Vec3(0, h / 2).round(), type: PortType.In, width: args.bitWidth },
                { id: 'o', name: '', pos: new Vec3(w, h / 2).round(), type: PortType.Out, width: 1 },
            ];
        },
        initConfig: () => ({
            bitWidth: 5,
            match: '01xxx',
        }),
        applyConfig(comp, args) {
        },
        build: (builder) => {
            let args = builder.comp.args;

            let mask = 0;
            let matchValue = 0;
            for (let i = 0; i < args.match.length; i++) {
                let c = args.match[i];
                let bitNo = args.match.length - i - 1;
                mask |= (c === 'x' ? 0 : 1) << bitNo;
                matchValue |= (c === '1' ? 1 : 0) << bitNo;
            }

            let data = builder.addData({
                inPort: builder.getPort('i'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inPort, outPort } }) => {
                outPort.value = (inPort.value & mask) === matchValue ? 1 : 0;
            }, [data.inPort], [data.outPort]);

            return builder.build();
        },
        renderOptions({ editCtx, comp }) {
            return <BitComparitorOptions editCtx={editCtx} comp={comp} />;
        },
        render({ ctx, comp, exeComp, cvs, styles }) {

            ctx.font = makeCanvasFont(1, FontType.Mono);
            let singleW = ctx.measureText('0 ').width;
            let numCanvasFont = makeCanvasFont(1 / singleW, FontType.Mono);

            let fullValue = exeComp?.data.inPort.value ?? 0x00;
            let allBits = [...fullValue.toString(2).padStart(comp.args.bitWidth, '0')];
            let isMatch = exeComp?.data.outPort.value ?? 0;

            if (comp.args.name) {
                ctx.fillStyle = '#000';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(comp.args.name, comp.pos.x + 0.7, comp.pos.y + comp.size.y / 2 + 0.1);
            }

            ctx.textAlign = 'right';
            ctx.fillStyle = isMatch ? palleteColors.green[700] : palleteColors.red[700];
            ctx.fillText(comp.args.match, comp.pos.x + comp.size.x - 0.7, comp.pos.y + comp.size.y / 2 + 0.1);
        },
    };

    return [bitComparitor];
}


const BitComparitorOptions: React.FC<{
    editCtx: IEditContext;
    comp: IComp<IBitComparitorConfig>;
}> = ({ editCtx, comp }) => {
    let [, setEditorState] = useEditorContext();

    return <>
        <EditKvp label="Match">
            <StringEditor value={comp.args.match} update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => {
                let santized = v.replaceAll(/[^x01]/g, '');
                return assignImm(a, {
                    match: santized,
                    bitWidth: santized.length,
                });
            }))} />
        </EditKvp>
    </>;
};
