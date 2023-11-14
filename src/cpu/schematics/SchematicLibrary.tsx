import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { iterLocalStorageEntries } from "@/src/utils/localstorage";
import { Vec3 } from "@/src/utils/vector";
import { CompLibrary, ISubLayoutPort } from "../comps/CompBuilder";
import { IEditSchematic, IEditSnapshot, PortType } from "../CpuModel";
import { ILSState, wiresFromLsState, schematicToLsState, exportData } from "../ImportExport";
import { assignImm } from "@/src/utils/data";
import { createSchematicCompDef } from "../comps/SchematicComp";
import { schematicManifest } from "./SchematicManifest";
import { constructEditSnapshot } from "../ModelHelpers";

export interface ILocalSchematic {
    id: string;
    name: string;
    cpuStateStr: string;
}

export class SchematicLibrary {

    // builtins are shipped with this app
    // customs are from local-storage

    builtinSchematics = new Map<string, ISchematicDef>();
    customSchematics = new Map<string, ISchematicDef>();

    localStorageSchematicsLoaded = false;

    constructor() {
    }

    public populateSchematicLibrary(compLibrary: CompLibrary, loadFromLocalStorage = true) {
        this.builtinSchematics.clear();
        this.customSchematics.clear();

        this.addLocalSchematics(compLibrary);

        if (loadFromLocalStorage) {
            this.readFromLocalStorage(compLibrary);
        }

        this.addSchematicsToCompLibrary(compLibrary);

        this.resolveSchematicRefs(compLibrary);
    }

    public addSchematicsToCompLibrary(compLibrary: CompLibrary) {
        for (let schem of [...this.builtinSchematics.values(), ...this.customSchematics.values()]) {
            if (schem.compArgs) {
                let libItem = createSchematicCompDef(schem.id, schem.name, schem.model.mainSchematic, schem.compArgs);
                compLibrary.addLibraryItem(libItem);
            }
        }
    }

    public addLocalSchematics(compLibrary: CompLibrary) {
        for (let lsSchematic of schematicManifest) {
            this.builtinSchematics.set(lsSchematic.id, this.lsSchematicToSchematicDef(lsSchematic, compLibrary));
        }
    }

    deleteCustomSchematic(id: string) {
        this.customSchematics.delete(id);
        localStorage.removeItem(this.schematicLocalStorageKey(id));
    }

    public getSchematic(id: string): ISchematicDef | undefined {
        return this.builtinSchematics.get(id) || this.customSchematics.get(id);
    }

    private readFromLocalStorage(compLibrary: CompLibrary) {
        let customSchematics = this.customSchematics;
        iterLocalStorageEntries((key, schematicStr) => {
            let lsSchematic: ILSSchematic | undefined;
            if (!key.startsWith('schematic-')) {
                return;
            }

            try {
                lsSchematic = JSON.parse(schematicStr!) as ILSSchematic;

            } catch (e) {
                console.error(`Error parsing schematic ${key}: ${e}`);
                return;
            }

            if (!lsSchematic) {
                return;
            }

            customSchematics.set(lsSchematic.id, this.lsSchematicToSchematicDef(lsSchematic, compLibrary))
        });

        this.localStorageSchematicsLoaded = true;
    }

    private lsSchematicToSchematicDef(lsSchematic: ILSSchematic, compLibrary: CompLibrary): ISchematicDef {
        let compArgs = compArgsFromLsState(lsSchematic.compArgs);

        let snapshot = constructEditSnapshot();
        snapshot = wiresFromLsState(snapshot, lsSchematic.model, compLibrary);
        snapshot.mainSchematic = addCompArgsToSnapshot(snapshot.mainSchematic, compArgs);
        snapshot.mainSchematic.id = lsSchematic.id;
        snapshot.mainSchematic.name = lsSchematic.name;
        // if (snapshot.compBbox.empty) {
        //     snapshot.compBbox = computeModelBoundingBox(snapshot, { excludePorts: true });
        // }

        return {
            id: lsSchematic.id,
            name: lsSchematic.name,
            model: snapshot,
            compArgs: compArgs || undefined,
            hasEdits: false,
            schematicStr: "",
        };
    }

    private resolveSchematicRefs(compLibrary: CompLibrary) {
        for (let schematic of this.customSchematics.values()) {
            for (let i = 0; i < schematic.model.mainSchematic.comps.length; i++) {
                let comp = schematic.model.mainSchematic.comps[i];
                if (!comp.resolved) {
                    let newComp = compLibrary.create(comp.defId, comp.args);
                    newComp.id = comp.id;
                    newComp.pos = comp.pos;
                    if (!newComp.resolved) {
                        console.error(`Schematic ${schematic.id} references unknown component ${comp.defId}`);
                        continue;
                    }

                    schematic.model.mainSchematic.comps[i] = newComp;
                }
            }
        }
    }

    public addCustomSchematic(name: string) {
        // create random string of 8 chars
        let id = `c-${Math.random().toString(36).substring(2, 10)}`;

        let schematic: ISchematicDef = {
            id: id,
            name: name,
            model: constructEditSnapshot(),
            hasEdits: false,
        };
        schematic.model.mainSchematic.id = id;
        this.customSchematics.set(id, schematic);
        this.saveToLocalStorage(schematic.id);
        return schematic;
    }

    public saveToLocalStorage(id: string) {
        let schematic = this.customSchematics.get(id);

        if (schematic) {
            let lsSchematic = editSnapshotToLsSchematic(id, schematic.model);
            // console.log('saving schematic', lsSchematic, 'based on snapshot', schematic.model);
            localStorage.setItem(this.schematicLocalStorageKey(schematic.id), JSON.stringify(lsSchematic));
        } else if (this.builtinSchematics.get(id)) {
            // console.log(`Can't update builtin schematic ${id}`);
        } else {
            console.error(`Schematic ${id} not found`);
        }
    }

    async saveToFile(id: string, editSnapshot: IEditSnapshot) {
        let lsSchematic = editSnapshotToLsSchematic(id, editSnapshot);

        let lsStr = JSON.stringify(lsSchematic);

        let dataStr = exportData(editSnapshot.mainSchematic);

        let name = (editSnapshot.mainSchematic.name || id).replace(/[^a-z0-9]/gi, '_').toLowerCase();

        let nameToCamel = name.replace(/[_ ^]([a-z])/g, (g) => g[1].toUpperCase());

        let body = `
import { ILSSchematic } from "@/src/cpu/schematics/SchematicLibrary";
export const ${nameToCamel}Schematic: ILSSchematic = ${lsStr};

export const ${nameToCamel}SchematicStr = \`${dataStr}\`;
`;

        await fetch(`/cpu/api/save-schematic-to-file?filename=${nameToCamel}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: body,
        });
    }

    private schematicLocalStorageKey(id: string) {
        return `schematic-${id}`;
    }
}

export function editSnapshotToLsSchematic(id: string, editSnapshot: IEditSnapshot): ILSSchematic {
    return {
        id: id,
        name: editSnapshot.mainSchematic.name,
        // parentCompDefId: editSnapshot.mainSchematic.parentCompDefId,
        model: schematicToLsState(editSnapshot.mainSchematic),
        compArgs: compArgsToLsState(editSnapshot),
    };
}

export interface ILSSchematic {
    id: string;
    name: string;
    model: ILSState;
    compArgs?: ILSCompArgs;
}

export interface ILSCompArgs {
    w: number;
    h: number;
    ports: ILSCompPort[];
}

export interface ILSCompPort {
    id: string;
    name: string;
    type: PortType;
    x: number;
    y: number;
    width?: number;
}

export interface ISchematicDef {
    id: string;
    name: string;
    model: IEditSnapshot;
    compArgs?: ISchematicCompArgs; // a schematic may get wrapped into a component

    hasEdits: boolean;
    // when we switch between models, want to keep as much state around as possible
    undoStack?: IEditSnapshot[];
    redoStack?: IEditSnapshot[];
    mtx?: AffineMat2d;
    schematicStr?: string; // for LS update detection
}

export interface ISchematicCompArgs {
    size: Vec3;
    ports: ISubLayoutPort[];
}

function compArgsToLsState(snapshot: IEditSnapshot): ILSCompArgs | undefined {
    let schematic = snapshot.mainSchematic;
    if (schematic.compSize.len() < 0.001) {
        return undefined;
    }
    return {
        w: schematic.compSize.x,
        h: schematic.compSize.y,
        ports: schematic.compPorts.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            x: p.pos.x,
            y: p.pos.y,
            width: p.width,
        })),
    };
}

function compArgsFromLsState(lsCompArgs?: ILSCompArgs): ISchematicCompArgs | null {
    if (!lsCompArgs) {
        return null;
    }

    return {
        size: new Vec3(lsCompArgs.w, lsCompArgs.h),
        ports: lsCompArgs.ports.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            pos: new Vec3(p.x, p.y),
            width: p.width,
        })),
    };
}

function addCompArgsToSnapshot(schematic: IEditSchematic, compArgs: ISchematicCompArgs | null): IEditSchematic {
    if (!compArgs) {
        return schematic;
    }

    return assignImm(schematic, {
        compSize: compArgs.size,
        compPorts: compArgs.ports,
    });
}
