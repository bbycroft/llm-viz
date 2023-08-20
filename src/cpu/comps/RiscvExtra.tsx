import { Vec3 } from "@/src/utils/vector";
import { IExeComp, IExePort, PortDir } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

export interface ICompDataLoadStore {
}

export interface ICompDataInsFetch {
    pc: IExePort;
    ins: IExePort;
    addr: IExePort;
    data: IExePort;
}

export function createRiscvExtraComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let defLs: ICompDef<ICompDataLoadStore> = {
        defId: 'riscvLoadStore',
        name: "Load/Store",
        size: new Vec3(10, 3),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 1), type: PortDir.In, width: 4 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(0, 2), type: PortDir.In, width: 12 },
            { id: 'addrBase', name: 'Addr Base', pos: new Vec3(3, 3), type: PortDir.In, width: 32 },
            { id: 'data', name: 'Data', pos: new Vec3(7, 3), type: PortDir.In, width: 32 },
            { id: 'dataOut', name: 'Data Out', pos: new Vec3(10, 2), type: PortDir.OutTri, width: 32 },
        ],
    };

    let defIf: ICompDef<ICompDataInsFetch> = {
        defId: 'riscvInsFetch',
        name: "Instruction Fetch",
        size: new Vec3(10, 3),
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
            }, [data.pc], [data.addr]);

            builder.addPhase(({ data: { data, ins } }) => {
                ins.value = data.value;
            }, [data.data], [data.ins]);

            return builder.build();
        },
    }

    return [defLs, defIf];
}
