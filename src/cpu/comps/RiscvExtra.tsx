import { Vec3 } from "@/src/utils/vector";
import { IExePort, IoDir, PortType } from "../CpuModel";
import { Funct3LoadStore } from "../RiscvIsa";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { FontType, makeCanvasFont } from "../render/CanvasRenderHelpers";
import { signExtend8Bit, signExtend16Bit, aluValToStr, transformCanvasToRegion } from "./CompHelpers";
import { info } from "console";

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

export interface IRiscvLoadStoreConfig extends IBaseCompConfig {
}

export interface IRiscvInsFetchConfig extends IBaseCompConfig {
}

export function createRiscvExtraComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let lsW = 18;
    let lsH = 12;
    let defLs: ICompDef<ICompDataLoadStore, IRiscvLoadStoreConfig> = {
        defId: 'riscv/loadStore0',
        altDefIds: ['riscvLoadStore'],
        name: "Load/Store",
        size: new Vec3(lsW, lsH),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: PortType.In, width: 5 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(5, lsH), type: PortType.In, width: 32 },
            { id: 'dataIn', name: 'Data In', pos: new Vec3(12, lsH), type: PortType.In, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(lsW, 6), type: PortType.Out, width: 32 },

            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(4, 0), type: PortType.Out | PortType.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(8, 0), type: PortType.Out | PortType.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(12, 0), type: PortType.InOutTri, width: 32 },
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

                let isLoad = enabled && loadFlag;
                let isStore = enabled && !loadFlag;

                busData.ioEnabled = true;
                busData.ioDir = isLoad ? IoDir.In : IoDir.Out;
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
                        // busData.ioEnabled = true;
                        dataIn.ioEnabled = true;
                        dataIn.ioDir = IoDir.In;
                        // console.log(`writing value ${dataIn.value} to addr ${addr.toString(16)} on busData`);
                    } else {
                        busData.ioDir = IoDir.In;
                    }
                } else {
                    busCtrl.value = 0;
                    // busData.ioEnabled = false;
                }

            }, [data.ctrl, data.addrOffset, data.addrBase, data.dataIn], [data.busCtrl, data.busAddr, data.busData]);

            builder.addPhase(({ data: { ctrl, busData, dataOut } }) => {
                let ctrlVal = ctrl.value;
                let enabled  = (ctrlVal & 0b00001) !== 0;
                let loadFlag = (ctrlVal & 0b00010) !== 0;
                let funct3   = (ctrlVal & 0b11100) >> 2;

                let isLoad = loadFlag && enabled;

                if (isLoad) {
                    if (funct3 === Funct3LoadStore.LB) {
                        dataOut.value = signExtend8Bit(busData.value);
                    } else if (funct3 === Funct3LoadStore.LH) {
                        dataOut.value = signExtend16Bit(busData.value);
                    } else {
                        dataOut.value = busData.value;
                    }
                    // busData.ioEnabled = true;
                }

            }, [data.ctrl, data.busData], [data.dataOut]);

            return builder.build();
        },
        render: ({ ctx, cvs, comp, exeComp, bb, styles }) => {
            if (!exeComp) {
                return;
            }

            let { ctrl, addrBase, addrOffset, busAddr, busCtrl, busData, dataIn, dataOut } = exeComp.data;

            let ctrlVal = ctrl.value;
            let isEnabled  = (ctrlVal & 0b00001) !== 0;
            let loadFlag = (ctrlVal & 0b00010) !== 0;
            let func3   = (ctrlVal & 0b11100) >> 2;
            let sizeBits = func3 & 0b11;
            let isUnsigned = (func3 & 0b100) !== 0;

            let sizeText = sizeBits === 0b00 ? 'byte (1 byte)' : sizeBits === 0b01 ? 'half (2 bytes)' : 'word (4 bytes)';
            let signedText = isUnsigned ? 'u' : 's';

            let isLoad = loadFlag && isEnabled;

            ctx.save();

            transformCanvasToRegion(cvs, styles, comp, bb);

            let w = comp.size.x;
            let h = comp.size.y;

            ctx.font = makeCanvasFont(styles.fontSize, FontType.Default);
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Load/Store', w/2, 1.0);

            let lineY = styles.lineHeight;

            interface ILinePart {
                text: string;
                color: string;
                type?: FontType;
            }

            function drawTextLine(line: number, parts: ILinePart[], noBullet?: boolean) {
                let x = 1;
                let y = line * lineY + 1.2;

                if (!noBullet) {
                    parts = [{ text: '• ', color: infoColor }, ...parts];
                }

                for (let i = 0; i < parts.length; i++) {
                    let part = parts[i];
                    ctx.textAlign = 'left';
                    ctx.fillStyle = part.color;
                    ctx.font = makeCanvasFont(styles.fontSize, part.type);
                    let width = ctx.measureText(part.text).width;
                    ctx.fillText(part.text, x, y);
                    x += width;
                }
            }

            // let opColor = '#e33';

            // let rs1Color = '#3e3';
            // let rs2Color = '#33e';
            // let rdColor = '#ee3';
            // let immColor = '#a3a';
            // let func3Color = '#333';
            // let infoColor = '#555';

            let baseColor = '#000';
            let isBranchColor = '#a3a';
            let enabledColor = '#e33';
            let func3Color = '#000';
            let lhsColor = '#3f3';
            let rhsColor = '#33e';
            let immColor = '#a3a';
            let resColor = '#ee3';
            let unusedColor = '#666';
            let infoColor = '#555';


            drawTextLine(1, [
                { text: 'Ctrl: ', color: infoColor, type: FontType.Italic },
                { text: func3.toString(2).padStart(3, '0'), color: isEnabled ? func3Color : unusedColor },
                { text: loadFlag ? '1' : '0', color: isEnabled ? isBranchColor : unusedColor },
                { text: isEnabled ? '1' : '0', color: enabledColor },
            ], true);

            let actionLine: ILinePart[] = [];

            if (!isEnabled) {
                actionLine.push({ text: 'disabled', color: enabledColor, type: FontType.Italic });
            } else {

                if (isLoad) {
                    actionLine.push({ text: 'read ', color: isBranchColor });
                    actionLine.push({ text: sizeText + ' (' + signedText + ')', color: func3Color });
                    actionLine.push({ text: ' from bus', color: infoColor });

                } else {
                    actionLine.push({ text: 'write ', color: isBranchColor });
                    actionLine.push({ text: sizeText, color: func3Color });
                    actionLine.push({ text: ' to bus', color: infoColor });
                }
            }

            drawTextLine(2, actionLine);

            if (isEnabled) {
                let lineNo = 3;

                let isByte = sizeBits === 0b00;
                let isHalf = sizeBits === 0b01;
                let isWord = sizeBits === 0b10;

                lineNo += 0.2;

                if (!isLoad) {
                    let storeValTrunc = dataIn.value & (isByte ? 0xff : isHalf ? 0xffff : 0xffffffff);
                    let storeNumHexVals = isByte ? 2 : isHalf ? 4 : 8;

                    drawTextLine(lineNo++, [
                        { text: 'value ', color: infoColor, type: FontType.Italic },
                        { text: aluValToStr(storeValTrunc, storeNumHexVals, !isUnsigned), color: rhsColor },
                    ]);
                    lineNo += 0.2;
                }

                drawTextLine(lineNo++, [
                    { text: 'at address ', color: infoColor, type: FontType.Italic },
                    { text: aluValToStr(addrBase.value, 8, false), color: lhsColor },
                ]);
                drawTextLine(lineNo++, [
                    { text: '   + ', color: infoColor },
                    { text: aluValToStr(addrOffset.value, 0, true), color: immColor },
                ]);
                drawTextLine(lineNo++, [
                    { text: '   = ', color: infoColor },
                    { text: aluValToStr(busAddr.value, 8, false), color: '#333' },
                ]);

                if (isLoad) {
                    let loadValTrunc = dataOut.value;
                    let storeNumHexVals = isByte ? 2 : isHalf ? 4 : 8;
                    lineNo += 0.2;

                    drawTextLine(lineNo++, [
                        { text: '=> ', color: infoColor, type: FontType.Italic },
                        { text: aluValToStr(loadValTrunc, storeNumHexVals, !isUnsigned), color: resColor },
                    ]);
                }
            }

            ctx.restore();
        },
    };

    let defIf: ICompDef<ICompDataInsFetch, IRiscvInsFetchConfig> = {
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
