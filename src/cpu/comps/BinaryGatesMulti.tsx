import React from "react";
import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from "../Editor";
import { assignImm, clamp, makeArray } from "@/src/utils/data";
import { rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";
import { EditKvp } from "../CompDetails";
import { HexValueEditor, HexValueInputType } from "../displayTools/HexValueEditor";

interface IBinGateMultiConfig extends IBaseCompConfig {
    rotate: number; // 0, 1, 2, 3
    bitWidth: number;
    numInPorts: number;
}

interface IBinGateMultiData {
    inPorts: IExePort[];
    outPort: IExePort;
}

interface INotGateData {
    inPort: IExePort;
    outPort: IExePort;
}

export function createBinaryGateMultiComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 3;
    let h = 4;
    let rotateCenter = new Vec3(1, 2);
    let orGate: ICompDef<IBinGateMultiData, IBinGateMultiConfig> = {
        defId: 'gate/or-multi',
        name: "Or Multi",
        size: new Vec3(w, h),
        flags: (args) => CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | (args.bitWidth === 1 && args.numInPorts <= 4 ? CompDefFlags.IsAtomic : 0),
        ports: (args) => {
            let height = args.numInPorts + 1;
            let gapPoint = height;
            if (height % 2 === 1) {
                height += 1;
                gapPoint = (args.numInPorts - 1) / 2;
            }

            return [
                ...makeArray(args.numInPorts, 0).map((_, i) => ({ id: `i${i}`, name: '', pos: new Vec3(0, i + 1 + (i > gapPoint ? 1 : 0)), type: PortType.In, width: args.bitWidth })),
                { id: 'o', name: '', pos: new Vec3(w, height / 2).round(), type: PortType.Out, width: args.bitWidth },
            ]
        },
        initConfig: () => ({ rotate: 0, bitWidth: 1, numInPorts: 2 }),
        applyConfig(comp, args) {
            let height = args.numInPorts + 1;
            if (height % 2 === 1) {
                height += 1;
            }
            comp.size = new Vec3(w, height);
            rotatePortsInPlace(comp, args.rotate, rotateCenter);
        },
        build: (builder) => {
            let data = builder.addData({
                inPorts: builder.ports.filter(p => p.type === PortType.In),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inPorts, outPort } }) => {
                let outValue = 0;
                for (let port of inPorts) {
                    outValue |= port.value;
                }
                outPort.value = outValue;
            }, data.inPorts, [data.outPort]);

            return builder.build();
        },
        renderOptions({ editCtx, comp }) {
            return <BinGateMultiOptions editCtx={editCtx} comp={comp} />;
        },
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();

            let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            ctx.transform(...mtx.toTransformParams());

            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.2;
            let x = comp.pos.x - dx;
            let y = comp.pos.y + 0.5;
            let rightX = x + comp.size.x;
            let w = comp.size.x + dx;
            let h = comp.size.y - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            ctx.lineTo(x + w, y + h / 2);

            ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            ctx.closePath();
            ctx.restore();
        },
    };


    return [orGate];
}

const BinGateMultiOptions: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IBinGateMultiConfig>,
}> = ({ editCtx, comp }) => {
    let { setEditorState } = useEditorContext();

    return <>
    <EditKvp label="Num Inputs">
        <HexValueEditor
            className="w-[4rem] bg-slate-200 mx-2 rounded"
            inputClassName="text-center active:bg-slate-300"
            value={comp.args.numInPorts}
            update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { numInPorts: clamp(v, 2, 32) })))}
            inputType={HexValueInputType.Dec}
            hidePrefix
            fixedInputType
            minimalBackground
        />
    </EditKvp>
</>;
}
