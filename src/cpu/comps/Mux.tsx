import { Vec3 } from "@/src/utils/vector";
import { PortDir, IExePort, IComp } from "../CpuModel";
import { ICompBuilderArgs, ICompDef, ExeCompBuilder } from "./CompBuilder";

interface ICompDataMux {
    inSelPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

interface ICompDataAdder {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

export function createMuxComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 2;
    let h = 8;
    let mux2: ICompDef<ICompDataMux> = {
        defId: 'mux2',
        name: "Mux",
        size: new Vec3(w, h),
        ports: [
            { id: 'sel', name: 'S', pos: new Vec3(1, 1), type: PortDir.In, width: 1 },

            { id: 'a', name: '0', pos: new Vec3(0, 2), type: PortDir.In, width: 32 },
            { id: 'b', name: '1', pos: new Vec3(0, 6), type: PortDir.In, width: 32 },

            { id: 'out', name: 'Z', pos: new Vec3(w, 4), type: PortDir.Out, width: 32 },
        ],
        build: (comp: IComp) => {
            let builder = new ExeCompBuilder<ICompDataMux>(comp);
            let data = builder.addData({
                inSelPort: builder.getPort('sel'),
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inSelPort, inAPort, inBPort, outPort } }) => {
                let isAPort = inSelPort.value === 0;
                outPort.value = isAPort ? inAPort.value : inBPort.value;
                inAPort.ioEnabled = isAPort;
                inBPort.ioEnabled = !isAPort;
            }, [data.inSelPort, data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.beginPath();
            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let x = comp.pos.x;
            let y = comp.pos.y;
            let w = comp.size.x;
            let h = comp.size.y;
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y + w);
            ctx.lineTo(x + w, y + h - w);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        },
    };

    let adder: ICompDef<ICompDataAdder> = {
        defId: 'adder',
        name: "+",
        size: new Vec3(w, h),
        ports: [
            { id: 'a', name: 'A', pos: new Vec3(0, 1), type: PortDir.In, width: 32 },
            { id: 'b', name: 'B', pos: new Vec3(0, 3), type: PortDir.In, width: 32 },

            { id: 'out', name: 'Out', pos: new Vec3(w, 3), type: PortDir.Out, width: 32 },
        ],
        build: (comp: IComp) => {
            let builder = new ExeCompBuilder<ICompDataAdder>(comp);
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value + inBPort.value;
                console.log(`adding ${inAPort.value} + ${inBPort.value} = ${outPort.value}`);
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
    };

    return [mux2, adder];
}
