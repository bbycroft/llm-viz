import { createAluComps } from "./Alu";
import { CompLibrary as CompLibrary, ICompBuilderArgs } from "./CompBuilder";
import { createRegisterComps } from "./Registers";
import { createRiscvInsDecodeComps } from "./RiscvInsDecode";
import { createRiscvExtraComps } from "./RiscvExtra";
import { createMuxComps } from "./Mux";
import { createSimpleMemoryComps } from "./SimpleMemory";
import { createBinaryGateComps } from "./BinaryGates";
import { createAddressingComps } from "./Addressing";

export function buildCompLibrary() {
    let compLibrary = new CompLibrary();

    let args: ICompBuilderArgs = { };

    let comps = [
        ...createRegisterComps(args),
        ...createAluComps(args),
        ...createRiscvExtraComps(args),
        ...createRiscvInsDecodeComps(args),
        ...createMuxComps(args),
        ...createSimpleMemoryComps(args),
        ...createBinaryGateComps(args),
        ...createAddressingComps(args),
    ];

    for (let comp of comps) {
        compLibrary.addComp(comp);
    }

    return compLibrary;
}
