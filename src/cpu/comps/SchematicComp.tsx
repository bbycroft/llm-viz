import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { ILibraryItem, ISchematic } from "../CpuModel";
import { ICompDef } from "./CompBuilder";
import { ISchematicCompArgs } from "../schematics/SchematicLibrary";

export interface ISchematicCompData {
    // nothing
}

export function createSchematicCompDef(id: string, name: string, schematic: ISchematic, compArgs: ISchematicCompArgs): ILibraryItem {

    let compDef: ICompDef<ISchematicCompData, {}> = {
        defId: id,
        name: name,
        ports: (args) => {
            return compArgs.ports;
        },
        size: compArgs.size,
        applyConfig: (comp, args) => {
            comp.size = compArgs.size;
        },
        build: (builder) => {
            builder.addData({});
            return builder.build();
        },

        subLayout: {
            layout: schematic,
            ports: compArgs.ports,
            bb: new BoundingBox3d(),
        },
    };

    let libItem: ILibraryItem = {
        compDef,
        id,
        name,
        schematic,
    };

    return libItem;
}
