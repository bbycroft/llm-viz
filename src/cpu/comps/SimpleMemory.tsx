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

    let w = 10;
    let h = 10;
    let rom: ICompDef<ICompDataRom> = {
        defId: 'rom0',
        name: "ROM",
        size: new Vec3(w, h),
        ports: [
            { id: 'addr', name: 'Addr', pos: new Vec3(w, 1), type: PortDir.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(w, 2), type: PortDir.Out, width: 32 },
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
        render: ({ comp, ctx, cvs, exeComp }) => {
            if (exeComp) {
                for (let i = 0; i < 10; i++) {
                    let lineHeight = 0.5;
                    let textHeight = lineHeight * 0.8;
                    let x = comp.pos.x + 0.3;
                    let y = comp.pos.y + 0.3 + i * lineHeight;
                    let word = exeComp.data.rom32View[i];
                    ctx.fillStyle = 'black';
                    ctx.font = `${textHeight}px monospace`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';

                    ctx.fillText('0x' + word.toString(16).padStart(8, '0'), x, y);
                }
            }
        },
    };

    return [rom];
}
