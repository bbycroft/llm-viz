import { assignImm } from "@/src/utils/data";
import { Vec3, BoundingBox3d } from "@/src/utils/vector";
import { ILibraryItem, IComp, CompDefFlags, IExeComp } from "../CpuModel";
import { ICompDef, ExeCompBuilder, buildDefault } from "../comps/CompBuilder";
import { rotateBboxInt } from "../comps/CompHelpers";

export class CompLibrary {
    libraryLookup = new Map<string, ILibraryItem>();
    constructor() {}

    public addComp(comp: ICompDef<any>) {
        let item = createLibraryItemFromComp(comp);
        this.addLibraryItem(item);
    }

    public addLibraryItem(item: ILibraryItem) {
        this.libraryLookup.set(item.id, item);
        for (let altId of item.altIds ?? []) {
            this.libraryLookup.set(altId, item);
        }
    }

    getCompDef(defId: string): ICompDef<any> | null {
        let item = this.libraryLookup.get(defId);
        if (!item || !item.compDef) {
            return null;
        }
        return item.compDef;
    }

    create<A = undefined>(defId: string, cfg?: A | undefined): IComp<A> {
        let compDef = this.getCompDef(defId);

        let args = compDef?.initConfig ? compDef.initConfig({}) : {};

        if (args && cfg) {
            args = assignImm(args, cfg);
        }

        let comp: IComp = {
            id: '',
            defId: compDef?.defId ?? defId,
            name: compDef?.name ?? '<unknown>',
            ports: [],
            flags: CompDefFlags.None,
            pos: new Vec3(0, 0),
            size: compDef?.size ?? new Vec3(4, 4),
            rotation: 0,
            args: args ?? {} as any,
            resolved: !!compDef,
            hasSubSchematic: !!compDef?.subLayout,
            bb: new BoundingBox3d(),
        };
        if (compDef) {
            this.updateCompFromDef(comp, compDef);
        }
        return comp;
    }

    updateCompFromDef(comp: IComp, compDef?: ICompDef<any>) {
        compDef ??= this.getCompDef(comp.defId) ?? undefined;
        if (compDef) {
            comp.name ??= compDef.name;
            comp.ports = compDef.ports instanceof Function ? compDef.ports(comp.args, compDef) : compDef.ports;
            comp.flags = compDef.flags instanceof Function ? compDef.flags(comp.args, compDef) : compDef.flags ?? CompDefFlags.None;
            comp.size = compDef.size;
            comp.hasSubSchematic = !!compDef.subLayout;
            compDef.applyConfig?.(comp, comp.args);
        }
        comp.bb = rotateBboxInt(comp.rotation, comp.pos, comp.size).shrinkInPlaceXY(0.5);
    }

    updateAllCompsFromDefs(comps: IComp[]) {
        for (let comp of comps) {
            this.updateCompFromDef(comp);
        }
        return comps;
    }

    build(comp: IComp): IExeComp<any> {
        let compDef = this.getCompDef(comp.defId);
        if (compDef?.build) {
            let builder = new ExeCompBuilder<any>(comp);
            return compDef.build(builder);
        }
        return buildDefault(comp);
    }
}

export function createLibraryItemFromComp(compDef: ICompDef<any>): ILibraryItem {
    return {
        id: compDef.defId,
        altIds: compDef.altDefIds,
        name: compDef.name,
        compDef: compDef,
    };
}
