import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { createBitWidthMask, rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";

interface IBitExpanderConfig extends IBaseCompConfig {
    rotate: number; // 0, 1, 2, 3
    bitWidth: number;
}

interface IBitExpanderData {
    inPort: IExePort;
    outPort: IExePort;
}

export function createBitMappingComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 2;
    let h = 2;
    let baseSize = new Vec3(w, h);
    let bitExpander: ICompDef<IBitExpanderData, IBitExpanderConfig> = {
        defId: 'bits/expand',
        name: "Bit Expand",
        size: new Vec3(w, h),
        flags: CompDefFlags.CanRotate | CompDefFlags.HasBitWidth,
        ports: (args) => {
            return [
                { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: 1 },
                { id: 'b', name: '', pos: new Vec3(2, 1), type: PortType.Out, width: args.bitWidth },
            ];
        },
        initConfig: () => ({ rotate: 0, bitWidth: 32 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, baseSize);
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
            ctx.translate(comp.pos.x, comp.pos.y);

            let mtx = rotateAboutAffineInt(comp.args.rotate, baseSize);
            ctx.transform(...mtx.toTransformParams());

            // basic structure is a trapezoid, narrower on the right
            // slope passes through (1, 1) i.e. the select button, but doesn't need to be 45deg
            let slope = 0.7;
            let x = 0.5; // comp.pos.x;
            let y = 0; //comp.pos.y;
            let w = baseSize.x - 1.0;
            let h = baseSize.y;

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
