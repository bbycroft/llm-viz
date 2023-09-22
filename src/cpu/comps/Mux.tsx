import { Vec3 } from "@/src/utils/vector";
import { PortType, IExePort } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";

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
    let h = 6;
    let mux2: ICompDef<ICompDataMux> = {
        defId: 'flow/mux2',
        altDefIds: ['mux2'],
        name: "Mux",
        size: new Vec3(w, h),
        ports: [
            { id: 'sel', name: 'S', pos: new Vec3(1, 1), type: PortType.In, width: 1 },

            { id: 'a', name: '0', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
            { id: 'b', name: '1', pos: new Vec3(0, 4), type: PortType.In, width: 32 },

            { id: 'out', name: 'Z', pos: new Vec3(w, 3), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
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
            // basic structure is a trapezoid, narrower on the right
            // slope passes through (1, 1) i.e. the select button, but doesn't need to be 45deg
            let slope = 0.9;
            let x = comp.pos.x;
            let y = comp.pos.y;
            let w = comp.size.x;
            let h = comp.size.y;

            let yTl = y + 1 - slope * comp.size.x / 2;
            let yTr = y + 1 + slope * comp.size.x / 2;

            let yBl = y + h - 1 + slope * comp.size.x / 2;
            let yBr = y + h - 1 - slope * comp.size.x / 2;

            ctx.moveTo(x, yTl);
            ctx.lineTo(x + w, yTr);
            ctx.lineTo(x + w, yBr);
            ctx.lineTo(x, yBl);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();


            let srcPos = comp.ports[exeComp?.data.inSelPort.value ? 2 : 1].pos;
            let destPos = comp.ports[3].pos;
            let xMid = comp.size.x / 2;

            let dashScale = Math.min(cvs.scale, 0.03);
            ctx.beginPath();
            ctx.moveTo(x + srcPos.x, y + srcPos.y);
            ctx.lineTo(x + xMid, y + srcPos.y);
            ctx.lineTo(x + xMid, y + destPos.y);
            ctx.lineTo(x + destPos.x, y + destPos.y);
            // ctx.setLineDash([10 * dashScale, 10 * dashScale]);
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.setLineDash([]);

        },
    };

    let aH = 4;
    let adder: ICompDef<ICompDataAdder> = {
        defId: 'math/adder',
        altDefIds: ['adder'],
        name: "+",
        size: new Vec3(w, aH),
        ports: [
            { id: 'a', name: 'A', pos: new Vec3(0, 1), type: PortType.In, width: 32 },
            { id: 'b', name: 'B', pos: new Vec3(0, 3), type: PortType.In, width: 32 },

            { id: 'out', name: 'O', pos: new Vec3(w, 3), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value + inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
    };


    return [mux2, adder];
}
