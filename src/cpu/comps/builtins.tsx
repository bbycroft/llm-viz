import { createAluComps } from "./Alu";
import { CompLibrary as CompLibrary, ICompBuilderArgs } from "./CompBuilder";
import { createRegisterComps } from "./Registers";
import { createRiscvInsDecodeComps } from "./RiscvInsDecode";
import { createRiscvExtraComps } from "./RiscvExtra";
import { createMuxComps } from "./Mux";
import { createSimpleMemoryComps } from "./SimpleMemory";
import { createBinaryGateComps } from "./BinaryGates";
import { createAddressingComps } from "./Addressing";
import { createInputOutputComps } from "./InputOutput";
import { createLedOutputComps } from "./peripheral/LedOutputSimple";
import { createRegFileCtrlComps } from "./riscv/RegisterControl";
import { createCompIoComps } from "./CompPort";

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
        ...createInputOutputComps(args),
        ...createLedOutputComps(args),
        ...createRegFileCtrlComps(args),
        ...createCompIoComps(args),
    ];

    for (let comp of comps) {
        let extraId = 'core/' + comp.defId;
        comp.altDefIds = [...comp.altDefIds ?? [], comp.defId];
        comp.defId = extraId;
        compLibrary.addComp(comp);
    }

    return compLibrary;
}
