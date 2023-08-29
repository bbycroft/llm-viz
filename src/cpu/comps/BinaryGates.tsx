import { Vec3 } from "@/src/utils/vector";
import { IComp, IExePort, PortDir } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

interface ICompDataBinaryGate {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}


export function createBinaryGateComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 3;
    let h = 4;
    let orGate: ICompDef<ICompDataBinaryGate> = {
        defId: 'or',
        name: "Or",
        size: new Vec3(w, h),
        ports: [
            { id: 'a', name: 'A', pos: new Vec3(0, 1), type: PortDir.In, width: 32 },
            { id: 'b', name: 'B', pos: new Vec3(0, 3), type: PortDir.In, width: 32 },
            { id: 'o', name: 'O', pos: new Vec3(w, 2), type: PortDir.Out, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value | inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.beginPath();
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
            // ctx.arcTo(x + w, y + h, x    , y + h, w / 2);

            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            // ctx.lineTo(x, y + h);
            // ctx.lineTo(x + w, y + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        },
    };

    return [orGate];
}
