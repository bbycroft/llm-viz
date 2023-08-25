import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { IExePort, PortDir, IComp } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import clsx from 'clsx';

export interface IRomExeData {
    addr: IExePort;
    data: IExePort;

    // please write to these rather than replace the array
    rom: Uint8Array;
    rom32View: Uint32Array;
}

export interface IRomArgs {
    octView: boolean;
}

export function createSimpleMemoryComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let romW = 35;
    let romH = 68;
    let rom: ICompDef<IRomExeData, IRomArgs> = {
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
            let bytesPerCol = 16;

            interface IRow {
                addr: number;
                bytes: Uint8Array;
            }

            let rows: IRow[] = [];
            for (let i = 0; i < (exeComp?.data.rom.length ?? 0); i += bytesPerCol) {
                rows.push({
                    addr: i,
                    bytes: exeComp!.data.rom.slice(i, i + bytesPerCol),
                });
            }

            let currAddr = exeComp?.data.addr.value ?? 0;

            return <CompRectBase comp={comp} cvs={cvs}>
                <div className={s.memTable}>
                    {rows.map((row, i) => {
                        return <div key={i} className={s.memRow}>
                            <div className={s.memRowAddr}>{row.addr.toString(16).padStart(2, '0')}</div>
                            <div className={s.memRowBytes}>
                                {[...row.bytes].map((b, j) => {
                                    let isActive = row.addr + j >= currAddr && row.addr + j < currAddr + 4;

                                    return <div key={j} className={clsx(s.memRowByte, isActive && s.active)}>{b.toString(16).padStart(2, '0')}</div>;
                                })}
                            </div>
                        </div>;
                    })}
                </div>
            </CompRectBase>;
        },
        copyStatefulData: (src, dest) => {
            dest.rom.set(src.rom);
        },
    };

    return [rom];
}
