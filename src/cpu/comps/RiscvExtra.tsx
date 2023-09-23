import { Vec3 } from "@/src/utils/vector";
import { IExePort, IoDir, PortType } from "../CpuModel";
import { Funct3LoadStore } from "../RiscvIsa";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { signExtend16Bit, signExtend8Bit } from "./RiscvInsDecode";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";

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
        defId: 'riscv/loadStore0',
        altDefIds: ['riscvLoadStore'],
        name: "Load/Store",
        size: new Vec3(lsW, lsH),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: PortType.In, width: 5 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: PortType.In, width: 12 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(5, lsH), type: PortType.In, width: 32 },
            { id: 'dataIn', name: 'Data In', pos: new Vec3(12, lsH), type: PortType.In, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(lsW, 6), type: PortType.OutTri, width: 32 },

            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(4, 0), type: PortType.Out | PortType.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(8, 0), type: PortType.Out | PortType.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(12, 0), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },
        ],
        build: (builder) => {
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
                // when working with a bus, we always:
                // a) have everything write to the bus that it needs to
                // b) have everything read from the bus that it needs to

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
                        // console.log('[L/S] writing value', dataIn.value, 'to addr', addr.toString(16), 'on busData');
                        busData.value = dataIn.value & mask;
                        busData.ioEnabled = true;
                        busData.ioDir = IoDir.Out;
                        dataIn.ioEnabled = true;
                        dataIn.ioDir = IoDir.In;
                        // console.log(`writing value ${dataIn.value} to addr ${addr.toString(16)} on busData`);
                    } else {
                        busData.ioDir = IoDir.In;
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
        defId: 'riscv/insFetch0',
        altDefIds: ['riscvInsFetch'],
        name: "Instruction Fetch",
        size: new Vec3(20, 12),
        ports: [
            { id: 'pc', name: 'PC', pos: new Vec3(5, 3), type: PortType.In, width: 32 },
            { id: 'ins', name: 'Ins', pos: new Vec3(10, 1), type: PortType.Out, width: 32 },
            { id: 'addr', name: 'Addr', pos: new Vec3(0, 1), type: PortType.Out, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                pc: builder.getPort('pc'),
                ins: builder.getPort('ins'),
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
            });

            builder.addPhase(({ data: { pc, addr }}) => {
                addr.value = pc.value;
            }, [data.pc], [data.addr]);

            builder.addPhase(({ data: { data, ins } }) => {
                ins.value = data.value;
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
                ctx.font = makeCanvasFont(textHeight, FontType.Mono);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                ctx.fillText('0x' + word.toString(16).padStart(8, '0'), x, y);
            }
        },
    }

    return [defLs, defIf];
}
