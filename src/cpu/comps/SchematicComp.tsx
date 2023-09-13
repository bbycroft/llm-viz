import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { ILibraryItem } from "../CpuModel";
import { ICompDef } from "./CompBuilder";

export function createSchematicCompDef(libItem: ILibraryItem): ICompDef<any, any> {

    return {
        defId: libItem.id,
        name: libItem.name,
        ports: (args, compDef) => {

            return [];
        },
        size: new Vec3(10, 10),
        applyConfig: (comp, args) => {

        },

        build: (builder) => {
            builder.addData({
                ports: [],
                size: builder.comp.size,
            });

            return builder.build();
        },

        subLayout: {
            layout: libItem.schematic!,
            ports: [],
            bb: new BoundingBox3d(),
        },
    };
}
