import { Vec3 } from "@/src/utils/vector";
import { IExeComp, IExePort, PortDir } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

export interface ICompDataLoadStore {
    ctrl: IExePort;
    addrOffset: IExePort;
    addrBase: IExePort;
    dataIn: IExePort;
    dataOut: IExePort;
}

export interface ICompDataInsFetch {
    pc: IExePort;
    ins: IExePort;
    addr: IExePort;
    data: IExePort;
}

export function createRiscvExtraComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let lsW = 24;
    let lsH = 12;
    let defLs: ICompDef<ICompDataLoadStore> = {
        defId: 'riscvLoadStore',
        name: "Load/Store",
        size: new Vec3(lsW, lsH),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: PortDir.In, width: 4 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: PortDir.In, width: 12 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(5, lsH), type: PortDir.In, width: 32 },
            { id: 'dataIn', name: 'Data In', pos: new Vec3(12, lsH), type: PortDir.In, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(lsW, 6), type: PortDir.OutTri, width: 32 },
        ],
        build: (comp) => {
            let builder = new ExeCompBuilder<ICompDataLoadStore>(comp);
            let data = builder.addData({
                ctrl: builder.getPort('ctrl'),
                addrOffset: builder.getPort('addrOffset'),
                addrBase: builder.getPort('addrBase'),
                dataIn: builder.getPort('dataIn'),
                dataOut: builder.getPort('dataOut'),
            });

            builder.addPhase(({ data: { ctrl, addrOffset, addrBase, dataIn, dataOut } }) => {
                if (ctrl.value === 0b0000) {
                    addrOffset.ioEnabled = false;
                    addrBase.ioEnabled = false;
                    dataIn.ioEnabled = false;
                    dataOut.ioEnabled = false;
                }

            }, [data.ctrl, data.addrOffset, data.addrBase, data.dataIn], [data.dataOut]);

            return builder.build();
        },
    };

    let defIf: ICompDef<ICompDataInsFetch> = {
        defId: 'riscvInsFetch',
        name: "Instruction Fetch",
        size: new Vec3(20, 12),
        ports: [
            { id: 'pc', name: 'PC', pos: new Vec3(5, 3), type: PortDir.In, width: 32 },
            { id: 'ins', name: 'Ins', pos: new Vec3(10, 1), type: PortDir.Out, width: 32 },
            { id: 'addr', name: 'Addr', pos: new Vec3(0, 1), type: PortDir.Out, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(0, 2), type: PortDir.In, width: 32 },
        ],
        build: (comp) => {
            let builder = new ExeCompBuilder<ICompDataInsFetch>(comp);
            let data = builder.addData({
                pc: builder.getPort('pc'),
                ins: builder.getPort('ins'),
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
            });

            builder.addPhase(({ data: { pc, addr }}) => {
                addr.value = pc.value;
                console.log('setting addr', '0x' + pc.value.toString(16));
            }, [data.pc], [data.addr]);

            builder.addPhase(({ data: { data, ins } }) => {
                ins.value = data.value;
                console.log('setting ins', '0x' + ins.value.toString(16));
            }, [data.data], [data.ins]);

            return builder.build();
        },
        render: ({ comp, ctx, cvs, exeComp }) => {
            if (exeComp) {
                let lineHeight = 0.5;
                let textHeight = lineHeight * 0.8;
                let x = comp.pos.x + 0.3;
                let y = comp.pos.y + 0.3;
                let word = exeComp.data.data.value;
                ctx.fillStyle = 'black';
                ctx.font = `${textHeight}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                ctx.fillText('0x' + word.toString(16).padStart(8, '0'), x, y);
            }
        },
    }

    return [defLs, defIf];
}
