import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { IExePort, PortDir, IComp, ICanvasState, IoDir } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import clsx from 'clsx';
import { Funct3LoadStore } from '../RiscvIsa';

export interface IRomExeData {
    addr: IExePort;
    data: IExePort;

    // please write to these rather than replace the array
    rom: Uint8Array;
    rom32View: Uint32Array;
}

export interface IRomConfig {
    octView: boolean;
}

export interface IRamConfig {
    sizeBytes: number
}

export interface IRamExeData {
    ctrl: IExePort;
    addr: IExePort;
    data: IExePort;
    ram: Uint8Array;
    ram32View: Uint32Array;
}

export enum BusMemCtrlType {
    Byte = 0b00,
    Half = 0b01,
    Word = 0b10,
}

export function createSimpleMemoryComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let romW = 35;
    let romH = 30;
    let rom: ICompDef<IRomExeData, IRomConfig> = {
        defId: 'rom0',
        name: "ROM",
        size: new Vec3(romW, romH),
        ports: [
            { id: 'addr', name: 'Addr', pos: new Vec3(romW, 2), type: PortDir.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(romW, 1), type: PortDir.Out, width: 32 },
        ],
        build: (comp: IComp) => {
            let builder = new ExeCompBuilder<IRomExeData>(comp);
            let rom = new Uint8Array(1024);
            let data = builder.addData({
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
                rom,
                rom32View: new Uint32Array(rom.buffer),
            });

            builder.addPhase(({ data: { addr, data, rom32View } }) => {
                // need to read as a uint32
                data.value = rom32View[addr.value >>> 2];
            }, [data.addr], [data.data]);

            return builder.build();
        },
        render: ({ comp, ctx, cvs, exeComp, styles }) => {
            if (exeComp) {
                for (let i = 0; i < 32; i++) {
                    let x = comp.pos.x + 0.3;
                    let y = comp.pos.y + 0.3 + i * styles.lineHeight;
                    let word = exeComp.data.rom32View[i];
                    let wordStr = '0x' + word.toString(16).padStart(8, '0');

                    ctx.font = `${styles.fontSize}px monospace`;
                    let width = ctx.measureText(wordStr).width;

                    let isActive = exeComp.data.addr.value >>> 2 === i;
                    if (isActive) {
                        ctx.fillStyle = '#a55';
                        // ctx.fillRect(x - 0.2, y - 0.2, width + 0.4, styles.lineHeight);
                    }

                    ctx.fillStyle = word === 0 ? '#0005' : '#000';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';

                    // ctx.fillText(wordStr, x, y);

                }
            }
        },
        renderDom: ({ comp, exeComp, styles, cvs }) => {
            let args = comp.args;

            // rows of 8 bytes, each byte represented by 2 hex digits
            // left to right, top to bottom (ala hex editor)
            return exeComp ? renderData(exeComp.data.rom, exeComp.data.addr.value, -4, comp, cvs) : null;

        },
        copyStatefulData: (src, dest) => {
            dest.rom.set(src.rom);
        },
    };

    let ramW = 35;
    let ramH = 30;

    let ram: ICompDef<IRamExeData, IRamConfig> = {
        defId: 'ram0',
        name: "RAM",
        size: new Vec3(ramW, ramH),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 2), type: PortDir.In, width: 5 },
            { id: 'addr', name: 'Addr', pos: new Vec3(0, 4), type: PortDir.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(0, 6), type: PortDir.Out | PortDir.In | PortDir.Tristate, width: 32 },
        ],

        build2: (builder) => {
            let ramUint8 = new Uint8Array(1024);
            let data = builder.addData({
                ctrl: builder.getPort('ctrl'),
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
                ram: ramUint8,
                ram32View: new Uint32Array(ramUint8.buffer),
            });

            builder.addPhase(function ramSendPhase({ data: { ctrl, addr, data, ram32View } }) {
                let isRead = (ctrl.value & 0b11) === 0b11; // read from ram
                let readType = (ctrl.value >> 2) & 0b11;

                // misaligned reads are not supported
                if (isRead) {
                    data.ioDir = isRead ? IoDir.Input : IoDir.Output;
                    data.ioEnabled = true;
                    let wordVal = ram32View[addr.value >> 2];
                    let bitOffset = (addr.value & 0b11) * 8;
                    data.value = readType === BusMemCtrlType.Byte ? (wordVal >> bitOffset) & 0xff   :
                                 readType === BusMemCtrlType.Half ? (wordVal >> bitOffset) & 0xffff : wordVal;
                } else {
                    data.ioEnabled = false;
                }

            }, [data.ctrl, data.addr], [data.data]);

            builder.addPhase(function ramWritePhase({ data: { ctrl, data: dataPort, ram32View, addr } }) {
                let isWrite = (ctrl.value & 0b11) === 0b01; // write to ram
                let writeType = (ctrl.value >> 2) & 0b11;

                if (isWrite) {
                    dataPort.ioEnabled = true;

                    // let existing = ram32View[addr.value >> 2];
                    // let bitOffset = (addr.value & 0b11) * 8;
                    // let mask = writeType === BusMemCtrlType.Byte ? 0xff << bitOffset :
                    //            writeType === BusMemCtrlType.Half ? 0xffff << bitOffset :
                    //                                                0xffffffff;

                    // let wordVal = (existing & ~mask) | ((dataPort.value << bitOffset) & mask);

                    // console.log(`reading data from data-port with value ${dataPort.value.toString(16)}`);
                    // console.log('mask:', mask.toString(16), 'bitOffset:', bitOffset, 'existing:', existing.toString(16), 'data:', dataPort.value.toString(16), 'wordVal:', wordVal.toString(16));
                }
            }, [data.ctrl, data.addr, data.data], []);

            builder.addLatchedPhase(function ramWritePhase({ data }) {
                let { ctrl, addr, data: dataPort, ram32View } = data;
                let isWrite = (ctrl.value & 0b11) === 0b01; // write to ram
                let writeType = (ctrl.value >> 2) & 0b11;

                if (isWrite) {
                    let existing = ram32View[addr.value >> 2];
                    let bitOffset = (addr.value & 0b11) * 8;
                    let mask = writeType === BusMemCtrlType.Byte ? 0xff << bitOffset :
                               writeType === BusMemCtrlType.Half ? 0xffff << bitOffset :
                                                                   0xffffffff;

                    let wordVal = (existing & ~mask) | ((dataPort.value << bitOffset) & mask);

                    // console.log('mask:', mask.toString(16), 'bitOffset:', bitOffset, 'existing:', existing.toString(16), 'data:', dataPort.value.toString(16), 'wordVal:', wordVal.toString(16));

                    ram32View[addr.value >> 2] = wordVal;
                }
            }, [], []);

            return builder.build();
        },

        copyStatefulData: (src, dest) => {
            dest.ram.set(src.ram);
        },

        reset: (exeComp) => {
            exeComp.data.ram.fill(0);
        },

        renderDom: ({ comp, exeComp, styles, cvs }) => {
            let isRead = exeComp && (exeComp.data.ctrl.value & 0b11) === 0b01;
            let isWrite = exeComp && (exeComp.data.ctrl.value & 0b11) === 0b11;
            let addr = exeComp ? exeComp.data.addr.value : 0;
            return exeComp ? renderData(exeComp.data.ram, isRead ? addr : -4, isWrite ? addr : -4, comp, cvs) : null;
        },
    };

    return [rom, ram];
}

function renderData(bytes: Uint8Array, readAddr: number, writeAddr: number, comp: IComp, cvs: ICanvasState) {
    let bytesPerCol = 16;

    interface IRow {
        addr: number;
        bytes: Uint8Array;
        allZeros: boolean;
    }

    let rows: IRow[] = [];
    for (let i = 0; i < bytes.length; i += bytesPerCol) {
        let rowBytes = bytes.slice(i, i + bytesPerCol);
        let allZeros = true;
        for (let b of rowBytes) {
            if (b !== 0) {
                allZeros = false;
                break;
            }
        }
        rows.push({
            addr: i,
            bytes: bytes.slice(i, i + bytesPerCol),
            allZeros: allZeros,
        });
    }

    return <CompRectBase comp={comp} cvs={cvs}>
        <div className={s.memTable}>
            {rows.map((row, i) => {
                return <div key={i} className={s.memRow}>
                    <div className={s.memRowAddr}>{row.addr.toString(16).padStart(2, '0')}</div>
                    <div className={clsx(s.memRowBytes, row.allZeros && s.allZeros)}>
                        {[...row.bytes].map((b, j) => {
                            let isRead = row.addr + j >= readAddr && row.addr + j < readAddr + 4;
                            let isWrite = row.addr + j >= writeAddr && row.addr + j < writeAddr + 4;

                            return <div key={j} className={clsx(s.memRowByte, isRead && s.byteRead, isWrite && s.byteWrite)}>{b.toString(16).padStart(2, '0')}</div>;
                        })}
                    </div>
                </div>;
            })}
        </div>
    </CompRectBase>;
}
