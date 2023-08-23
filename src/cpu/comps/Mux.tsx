import { Vec3 } from "@/src/utils/vector";
import { exec } from "child_process";
import { PortDir, IExePort, IComp } from "../CpuModel";
import { ICompBuilderArgs, ICompDef, ExeCompBuilder } from "./CompBuilder";
import { ensureSigned32Bit } from "./RiscvInsDecode";

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

export interface ICompDataConst {
    value: number;
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

    let aH = 4;
    let adder: ICompDef<ICompDataAdder> = {
        defId: 'adder',
        name: "+",
        size: new Vec3(w, aH),
        ports: [
            { id: 'a', name: 'A', pos: new Vec3(0, 1), type: PortDir.In, width: 32 },
            { id: 'b', name: 'B', pos: new Vec3(0, 3), type: PortDir.In, width: 32 },

            { id: 'out', name: 'O', pos: new Vec3(w, 3), type: PortDir.Out, width: 32 },
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
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
    };

    let const32: ICompDef<ICompDataConst> = {
        defId: 'const32',
        name: "Const32",
        size: new Vec3(2, 2),
        ports: [
            { id: 'out', name: '', pos: new Vec3(2, 1), type: PortDir.Out, width: 32 },
        ],
        build: (comp: IComp) => {
            let builder = new ExeCompBuilder<ICompDataConst>(comp);
            let data = builder.addData({
                value: 4,
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
            ctx.font = `${styles.fontSize}px monospace`;
            ctx.fillStyle = 'black';
            ctx.fillText('' + ensureSigned32Bit(exeComp?.data.value ?? 0), comp.pos.x + comp.size.x / 2, comp.pos.y + comp.size.y * 0.6);
        },
    };

    return [mux2, adder, const32];
}
