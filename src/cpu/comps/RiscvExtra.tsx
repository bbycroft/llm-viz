import { Vec3 } from "@/src/utils/vector";
import { IExeComp, IExePort, IoDir, PortDir } from "../CpuModel";
import { Funct3LoadStore } from "../RiscvIsa";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { ensureUnsigned32Bit, signExtend16Bit, signExtend8Bit } from "./RiscvInsDecode";

export interface ICompDataLoadStore {
    ctrl: IExePort;
    addrOffset: IExePort;
    addrBase: IExePort;
    dataIn: IExePort;
    dataOut: IExePort;

    busCtrl: IExePort;
    busAddr: IExePort;
    busData: IExePort;
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
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: PortDir.In, width: 5 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: PortDir.In, width: 12 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(5, lsH), type: PortDir.In, width: 32 },
            { id: 'dataIn', name: 'Data In', pos: new Vec3(12, lsH), type: PortDir.In, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(lsW, 6), type: PortDir.OutTri, width: 32 },

            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(4, 0), type: PortDir.Out | PortDir.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(8, 0), type: PortDir.Out | PortDir.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(12, 0), type: PortDir.In | PortDir.Out | PortDir.Tristate, width: 32 },
        ],
        build: (comp) => {
            let builder = new ExeCompBuilder<ICompDataLoadStore>(comp);
            let data = builder.addData({
                ctrl: builder.getPort('ctrl'),
                addrOffset: builder.getPort('addrOffset'),
                addrBase: builder.getPort('addrBase'),
                dataIn: builder.getPort('dataIn'),
                dataOut: builder.getPort('dataOut'),
                busCtrl: builder.getPort('busCtrl'),
                busAddr: builder.getPort('busAddr'),
                busData: builder.getPort('busData'),
            });

            builder.addPhase(({ data: { ctrl, addrOffset, addrBase, dataIn, busCtrl, busAddr, busData } }) => {
                let ctrlVal = ctrl.value;
                let enabled  = (ctrlVal & 0b00001) !== 0;
                let loadFlag = (ctrlVal & 0b00010) !== 0;
                let funct3   = (ctrlVal & 0b11100) >> 2;

                let isLoad = loadFlag && enabled;
                let isStore = !loadFlag && enabled;

                busData.ioEnabled = false;
                busData.ioDir = isLoad ? 0 : 1;
                busData.value = 0;
                dataIn.ioEnabled = false;
                addrBase.ioEnabled = enabled;
                addrOffset.ioEnabled = enabled;
                busAddr.ioEnabled = enabled;
                busCtrl.ioEnabled = enabled;

                if (enabled) {
                    let addr = addrBase.value + addrOffset.value;
                    busAddr.value = addr;
                    busCtrl.value = funct3 << 2 | (isLoad ? 0b11 : 0b01);
                    if (isStore) {
                        // handle unsigned store
                        let mask = funct3 === Funct3LoadStore.SB ? 0xff : funct3 === Funct3LoadStore.SH ? 0xffff : 0xffffffff;
                        console.log('[L/S] writing value', dataIn.value, 'to addr', addr.toString(16), 'on busData');
                        busData.value = dataIn.value & mask;
                        busData.ioEnabled = true;
                        busData.ioDir = IoDir.Out;
                        dataIn.ioEnabled = true;
                        // console.log(`writing value ${dataIn.value} to addr ${addr.toString(16)} on busData`);
                    }
                } else {
                    busCtrl.value = 0;
                    busData.ioEnabled = false;
                }

            }, [data.ctrl, data.addrOffset, data.addrBase, data.dataIn], [data.busCtrl, data.busAddr, data.busData]);

            builder.addPhase(({ data: { ctrl, busData, dataOut } }) => {
                let ctrlVal = ctrl.value;
                let enabled  = (ctrlVal & 0b00001) !== 0;
                let loadFlag = (ctrlVal & 0b00010) !== 0;
                let funct3   = (ctrlVal & 0b11100) >> 2;

                let isLoad = loadFlag && enabled;

                dataOut.ioEnabled = isLoad;

                if (isLoad) {
                    if (funct3 === Funct3LoadStore.LB) {
                        dataOut.value = signExtend8Bit(busData.value);
                    } else if (funct3 === Funct3LoadStore.LH) {
                        dataOut.value = signExtend16Bit(busData.value);
                    } else {
                        dataOut.value = busData.value;
                    }
                    busData.ioEnabled = true;
                }

            }, [data.ctrl, data.busData], [data.dataOut]);

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
