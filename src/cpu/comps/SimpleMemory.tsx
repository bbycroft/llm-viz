import { Vec3 } from "@/src/utils/vector";
import { IExePort, PortDir, IComp } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

export interface ICompDataRom {
    addr: IExePort;
    data: IExePort;

    // please write to these rather than replace the array
    rom: Uint8Array;
    rom32View: Uint32Array;
}

export function createSimpleMemoryComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let romW = 16;
    let romH = 68;
    let rom: ICompDef<ICompDataRom> = {
        defId: 'rom0',
        name: "ROM",
        size: new Vec3(romW, romH),
        ports: [
            { id: 'addr', name: 'Addr', pos: new Vec3(romW, 1), type: PortDir.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(romW, 2), type: PortDir.Out, width: 32 },
        ],
        build: (comp: IComp) => {
            let builder = new ExeCompBuilder<ICompDataRom>(comp);
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
                        ctx.fillRect(x - 0.2, y - 0.2, width + 0.4, styles.lineHeight);
                    }

                    ctx.fillStyle = word === 0 ? '#0005' : '#000';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';

                    ctx.fillText(wordStr, x, y);

                }
            }
        },
        copyStatefulData: (src, dest) => {
            dest.rom.set(src.rom);
        },
    };

    return [rom];
}
