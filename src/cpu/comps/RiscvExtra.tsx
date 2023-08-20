import { Vec3 } from "@/src/utils/vector";
import { PortDir } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";

export interface ICompDataLoadStore {
}

export interface ICompDataInsFetch {
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
    }

    return [defLs, defIf];
}

