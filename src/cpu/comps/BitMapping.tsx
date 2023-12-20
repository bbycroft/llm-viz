import React from "react";
import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditContext, IExeComp, IExePort, PortType } from "../CpuModel";
import { CompDefFlags, IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from "../Editor";
import { CompRectBase } from "./RenderHelpers";
import { assignImm } from "@/src/utils/data";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "@/src/utils/keyboard";
import { createBitWidthMask, rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";
import { ensureUnsigned32Bit } from "./RiscvInsDecode";

interface IBitExpanderConfig extends IBaseCompConfig {
    rotate: number; // 0, 1, 2, 3
    bitWidth: number;
}

interface IBitExpanderData {
    inPort: IExePort;
    outPort: IExePort;
}

export function createBitMappingComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 1;
    let h = 2;
    let rotateCenter = new Vec3(1, 1);
    let bitExpander: ICompDef<IBitExpanderData, IBitExpanderConfig> = {
        defId: 'bits/expand',
        name: "Bit Expand",
        size: new Vec3(w, h),
        flags: CompDefFlags.CanRotate | CompDefFlags.HasBitWidth,
        ports: (args) => {
            return [
                { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: 1 },
                { id: 'b', name: '', pos: new Vec3(1, 1), type: PortType.Out, width: args.bitWidth },
            ];
        },
        initConfig: () => ({ rotate: 0, bitWidth: 32 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, rotateCenter);
        },
        build: (builder) => {
            let mask = createBitWidthMask(builder.comp.args.bitWidth);

            let data = builder.addData({
                inPort: builder.getPort('a'),
                outPort: builder.getPort('b'),
            });

            builder.addPhase(({ data: { inPort, outPort } }) => {
                outPort.value = inPort.value ? mask : 0;
            }, [data.inPort], [data.outPort]);

            return builder.build();
        },
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();

            let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            ctx.transform(...mtx.toTransformParams());

            // basic structure is a trapezoid, narrower on the right
            // slope passes through (1, 1) i.e. the select button, but doesn't need to be 45deg
            let slope = 0.7;
            let x = comp.pos.x;
            let y = comp.pos.y;
            let w = comp.size.x;
            let h = comp.size.y;

            ctx.moveTo(x, y + slope);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h - slope);
            ctx.closePath();

            ctx.restore();
        },
    };


    return [bitExpander];
}
