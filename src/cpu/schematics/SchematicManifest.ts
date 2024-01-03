import { ILSSchematic } from "../ImportExport";
import { pcCounterSchematic } from "./pcCounterSchematic";
import { regFileDemoSchematic } from "./regFileDemoSchematic";
import { riscvBasicSchematic } from "./riscvBasicSchematic";
import { romUsageSchematic } from "./romUsageSchematic";
import { insDecodeInternalSchematic } from "./insDecodeInternalSchematic";
import { riscvBasicAddInsSchematic } from "./riscvBasicAddInsSchematic";
import { riscvBasicInsDecodeOnlySchematic } from "./riscvBasicInsDecodeOnlySchematic";
import { aluInternalSimpleSchematic } from "./aluInternalSimpleSchematic";
import { adder_RippleAdderSchematic } from "./adder_RippleAdderSchematic";
import { singleBitAdderSchematic } from "./singleBitAdderSchematic";

export const schematicManifest: ILSSchematic[] = [
    pcCounterSchematic,
    regFileDemoSchematic,
    riscvBasicSchematic,
    romUsageSchematic,
    insDecodeInternalSchematic,
    riscvBasicAddInsSchematic,
    riscvBasicInsDecodeOnlySchematic,
    aluInternalSimpleSchematic,
    adder_RippleAdderSchematic,
    singleBitAdderSchematic,
];

