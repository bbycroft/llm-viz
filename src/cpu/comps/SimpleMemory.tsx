import React, { memo } from 'react';
import { Vec3 } from "@/src/utils/vector";
import { IExePort, PortType, IComp, IoDir } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import clsx from 'clsx';
import { isNotNil } from '@/src/utils/data';
import { FontType, makeCanvasFont } from '../CanvasRenderHelpers';

export interface IRomExeData {
    addr: IExePort;
    data: IExePort;

    // please write to these rather than replace the array
    rom: Uint8Array;
    rom32View: Uint32Array;
    updateCntr: number;
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
    updateCntr: number;
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
        defId: 'mem/rom0',
        altDefIds: ['rom0'],
        name: "ROM",
        size: new Vec3(romW, romH),
        ports: [
            { id: 'addr', name: 'Addr', pos: new Vec3(romW, 2), type: PortType.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(romW, 1), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
            let rom = new Uint8Array(1024);
            let data = builder.addData({
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
                rom,
                rom32View: new Uint32Array(rom.buffer),
                updateCntr: 0,
            });

            builder.addPhase(({ data: { addr, data, rom32View } }, args) => {
                // need to read as a uint32
                let loc = addr.value >>> 2;

                if (loc < 0 || loc >= rom32View.length) {
                    data.value = 0;
                    args.halt = true;
                } else {
                    data.value = rom32View[addr.value >>> 2];
                }
            }, [data.addr], [data.data]);

            return builder.build();
        },
        render: ({ comp, ctx, cvs, exeComp, styles }) => {
            if (!exeComp) {
                return;
            }
            let fontScale = 0.8;
            ctx.save();
            ctx.beginPath();
            ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
            ctx.clip();

            ctx.font = makeCanvasFont(styles.fontSize * fontScale, FontType.Mono);
            let widthPerChar = ctx.measureText('0').width;
            let widthPerWord = widthPerChar * 3 * 4
            let padLeft = 0.5;
            let space = comp.size.x - padLeft * 2;
            let xOffset = comp.pos.x + padLeft;
            let yOffset = comp.pos.y + 0.5;
            let rowHeight = styles.lineHeight * fontScale;

            let numWordsPerRow = Math.floor(space / widthPerWord);
            let numBytesPerRow = numWordsPerRow * 4;

            let targetAddr = exeComp.data.addr.value & ~0b11;

            let targetAddrRow = (targetAddr / numBytesPerRow) >>> 0;
            let targetAddrCol = targetAddr % numBytesPerRow;
            let targetAddrY = yOffset + targetAddrRow * rowHeight;
            let targetAddrX = xOffset + targetAddrCol * widthPerChar * 3;

            ctx.fillStyle = '#0005';
            ctx.beginPath();
            ctx.roundRect(targetAddrX - 0.3, targetAddrY - 0.2, widthPerChar * 11 + 0.6, rowHeight, 0.5);
            ctx.fill();

            for (let i = 0; i < 32; i++) {
                let x = xOffset;
                let y = yOffset + i * rowHeight;

                let wordStr = '';
                for (let j = 0; j < numBytesPerRow; j++) {
                    let byte = exeComp.data.rom[i * numBytesPerRow + j];
                    let parts = byte.toString(16).padStart(2, '0');
                    wordStr += `${parts[0]}${parts[1]} `;
                }

                ctx.fillStyle = wordStr === '' ? '#0005' : '#000';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                ctx.fillText(wordStr, x, y);
            }

            // let isActive = exeComp.data.addr.value >>> 2 === i;
            // if (isActive) {
                // ctx.fillRect(x - 0.2, y - 0.2, width + 0.4, styles.lineHeight);
            // }

            ctx.restore();
        },
        renderDom: ({ comp, exeComp, styles }) => {
            let args = comp.args;

            // rows of 8 bytes, each byte represented by 2 hex digits
            // left to right, top to bottom (ala hex editor)
            let addrRounded = exeComp ? exeComp.data.addr.value & ~0b11 : 0;

            // return exeComp ? renderData(comp, exeComp.data.rom, exeComp.data.updateCntr, { addr: addrRounded, numBytes: 4, value: 0 }, null) : null;
            return null;

        },
        reset: (exeComp, { hardReset }) => {
            if (hardReset) {
                exeComp.data.rom.fill(0);
                exeComp.data.updateCntr = 0;
            }
        },
        copyStatefulData: (src, dest) => {
            dest.rom.set(src.rom);
            dest.updateCntr = dest.updateCntr === 0 ? 1 : 0;
        },
    };

    let ramW = 35;
    let ramH = 30;

    let ram: ICompDef<IRamExeData, IRamConfig> = {
        defId: 'mem/ram0',
        altDefIds: ['ram0'],
        name: "RAM",
        size: new Vec3(ramW, ramH),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 2), type: PortType.In, width: 5 },
            { id: 'addr', name: 'Addr', pos: new Vec3(0, 4), type: PortType.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(0, 6), type: PortType.Out | PortType.In | PortType.Tristate, width: 32 },
        ],

        build: (builder) => {
            let ramUint8 = new Uint8Array(1024);
            let data = builder.addData({
                ctrl: builder.getPort('ctrl'),
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
                ram: ramUint8,
                ram32View: new Uint32Array(ramUint8.buffer),
                updateCntr: 0,
            });

            builder.addPhase(function ramSendPhase({ data: { ctrl, addr, data, ram32View } }) {
                let isRead = (ctrl.value & 0b11) === 0b11; // read from ram
                let isWrite = (ctrl.value & 0b11) === 0b01; // write to ram
                let readType = (ctrl.value >> 2) & 0b11;

                data.ioDir = isRead ? IoDir.Out : IoDir.In;
                data.ioEnabled = isRead || isWrite;

                // misaligned reads are not supported
                if (isRead) {
                    data.ioEnabled = true;
                    let wordVal = ram32View[addr.value >> 2];
                    let bitOffset = (addr.value & 0b11) * 8;
                    data.value = readType === BusMemCtrlType.Byte ? (wordVal >> bitOffset) & 0xff   :
                                 readType === BusMemCtrlType.Half ? (wordVal >> bitOffset) & 0xffff : wordVal;
                } else if (isWrite) {
                    data.ioEnabled = true;
                } else {
                    data.ioEnabled = false;
                }

            }, [data.ctrl, data.addr, data.data], [data.data]);

            /*
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
            }, [], [data.data]);
            */

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
                    data.updateCntr += 1;
                }
            }, [], []);

            return builder.build();
        },

        copyStatefulData: (src, dest) => {
            dest.ram.set(src.ram);
        },

        reset: (exeComp) => {
            exeComp.data.ram.fill(0);
            exeComp.data.updateCntr = 0;
        },

        renderDom: ({ comp, exeComp, styles }) => {
            if (!exeComp || true) {
                return null;
            }
            let data = exeComp.data;
            let ctrl = data.ctrl;
            let isRead = (ctrl.value & 0b11) === 0b11;
            let isWrite = (ctrl.value & 0b11) === 0b01;
            let writeType = (ctrl.value >> 2) & 0b11;
            let addr = data.addr.value;
            let value = data.data.value;
            let numBytes = writeType === BusMemCtrlType.Byte ? 1 : writeType === BusMemCtrlType.Half ? 2 : 4;
            return renderData(comp, exeComp.data.ram, exeComp.data.updateCntr,
                isRead ? { addr, numBytes, value } : null,
                isWrite ? { addr, numBytes, value } : null);
        },
    };

    return [rom, ram];
}

interface IReadWriteInfo {
    addr: number;
    numBytes: number;
    value: number; // only used for writes
}

function renderData(comp: IComp, bytes: Uint8Array, updateCntr: number, read: IReadWriteInfo | null, write: IReadWriteInfo | null) {

    return <CompRectBase comp={comp}>
        <MemoryContents
            bytes={bytes}
            readAddr={read ? read.addr : null}
            readNumBytes={read ? read.numBytes : null}
            writeAddr={write ? write.addr : null}
            writeNumBytes={write ? write.numBytes : 0}
            writeValue={write ? write.value : null}
            updateCntr={updateCntr}
        />
    </CompRectBase>;
}

export const MemoryContents: React.FC<{
    bytes: Uint8Array,
    readAddr: number | null,
    readNumBytes: number | null,
    writeAddr: number | null,
    writeNumBytes: number,
    writeValue: number | null,
    updateCntr: number,
}> = memo(function MemoryContents({ bytes, readAddr, readNumBytes, writeAddr, writeNumBytes, writeValue }) {
    let bytesPerCol = 16;

    let read: IReadWriteInfo | null = isNotNil(readAddr) && readNumBytes ? { addr: readAddr, numBytes: readNumBytes, value: 0 } : null;
    let write: IReadWriteInfo | null = isNotNil(writeAddr) && writeNumBytes ? { addr: writeAddr, numBytes: writeNumBytes, value: writeValue || 0 } : null;

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

    return <div className={s.memTable}>
        {rows.map((row, i) => {
            return <div key={i} className={s.memRow}>
                <div className={s.memRowAddr}>{row.addr.toString(16).padStart(2, '0')}</div>
                <div className={clsx(s.memRowBytes, row.allZeros && s.allZeros)}>
                    {[...row.bytes].map((b, j) => {
                        let isRead = read && (row.addr + j >= read.addr && row.addr + j < read.addr + read.numBytes);
                        let isWrite = write && (row.addr + j >= write.addr && row.addr + j < write.addr + write.numBytes);

                        let topVal: number | null = null;
                        let contents: React.ReactNode = b.toString(16).padStart(2, '0');
                        if (write && isWrite) {
                            let byteOffset = row.addr + j - write.addr;
                            topVal = (write.value >> (byteOffset * 8)) & 0xff;
                            contents = <>
                                <div>{topVal.toString(16).padStart(2, '0')}</div>
                                <div>{contents}</div>
                            </>;
                        }

                        return <div key={j} className={clsx(s.memRowByte, isRead && s.byteRead, isWrite && s.byteWrite)}>{contents}</div>;
                    })}
                </div>
            </div>;
        })}
    </div>;
});
