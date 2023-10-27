import { ILSSchematic } from "./SchematicLibrary";
import { pcCounterSchematic } from "./pcCounterSchematic";
import { regFileDemoSchematic } from "./regFileDemoSchematic";
import { riscvBasicSchematic } from "./riscvBasicSchematic";
import { romUsageSchematic } from "./romUsageSchematic";

export const schematicManifest: ILSSchematic[] = [
    pcCounterSchematic,
    regFileDemoSchematic,
    riscvBasicSchematic,
    romUsageSchematic,
];

