import { Vec3 } from "@/src/utils/vector";
import { IExePort, PortDir, IComp } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

interface ICompDataRom {
    addr: IExePort;
    data: IExePort;

    rom: Uint32Array;
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
            let data = builder.addData({
                addr: builder.getPort('addr'),
                data: builder.getPort('data'),
                rom: new Uint32Array(1024),
            });

            builder.addPhase(({ data: { addr, data, rom } }) => {
                data.value = rom[addr.value];
            }, [data.addr], [data.data]);

            return builder.build();
        },
    };

    return [rom];
}
