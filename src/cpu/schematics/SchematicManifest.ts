import { ILSSchematic } from "../ImportExport";
import { pcCounterSchematic } from "./pcCounterSchematic";
import { regFileDemoSchematic } from "./regFileDemoSchematic";
import { riscvBasicSchematic } from "./riscvBasicSchematic";
import { romUsageSchematic } from "./romUsageSchematic";
import { insDecodeInternalSchematic } from "./insDecodeInternalSchematic";
import { riscvBasicAddInsSchematic } from "./riscvBasicAddInsSchematic";
import { riscvBasicInsDecodeOnlySchematic } from "./riscvBasicInsDecodeOnlySchematic";

export const schematicManifest: ILSSchematic[] = [
    pcCounterSchematic,
    regFileDemoSchematic,
    riscvBasicSchematic,
    romUsageSchematic,
    insDecodeInternalSchematic,
    riscvBasicAddInsSchematic,
    riscvBasicInsDecodeOnlySchematic,
];

