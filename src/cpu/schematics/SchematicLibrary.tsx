import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { iterLocalStorageEntries } from "@/src/utils/localstorage";
import { CompLibrary } from "../comps/CompBuilder";
import { ICpuLayout } from "../CpuModel";
import { createInitialCpuLayout, ILSState, wiresFromLsState, wiresToLsState } from "../ImportExport";
import { regFileDemo, riscvBasicSchematic } from "./RiscvBasic";

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

    localSchematics: ILocalSchematic[] = [
        riscvBasicSchematic,
        regFileDemo,
    ];

    constructor() {
    }

    public populateSchematicLibrary(compLibrary: CompLibrary) {
        this.builtinSchematics.clear();
        this.customSchematics.clear();

        this.addLocalSchematics(compLibrary);
        this.readFromLocalStorage(compLibrary);
    }

    public addLocalSchematics(compLibrary: CompLibrary) {
        for (let schematic of this.localSchematics) {

            let model: ILSState | undefined;
            try {
                model = JSON.parse(schematic.cpuStateStr!) as ILSState;

            } catch (e) {
                console.error(`Error parsing schematic ${schematic.id}/${schematic.name} ${e}`);
                return;
            }

            if (!model) {
                return;
            }

            this.builtinSchematics.set(schematic.id, {
                id: schematic.id,
                name: schematic.name,
                model: wiresFromLsState(createInitialCpuLayout(), model, compLibrary),
                hasEdits: false,
                schematicStr: "",
            });
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
            let schematic: ILSSchematic | undefined;
            if (!key.startsWith('schematic-')) {
                return;
            }

            try {
                schematic = JSON.parse(schematicStr!) as ILSSchematic;

            } catch (e) {
                console.error(`Error parsing schematic ${key}: ${e}`);
                return;
            }

            if (!schematic) {
                return;
            }

            customSchematics.set(schematic.id, {
                id: schematic.id,
                name: schematic.name,
                model: wiresFromLsState(createInitialCpuLayout(), schematic.model, compLibrary),
                hasEdits: false,
                schematicStr: schematicStr!,
            });
        });
    }

    public addCustomSchematic(name: string) {
        // create random string of 8 chars
        let id = `c-${Math.random().toString(36).substring(2, 10)}`;

        let schematic: ISchematicDef = {
            id: id,
            name: name,
            model: createInitialCpuLayout(),
            hasEdits: false,
        };
        this.customSchematics.set(id, schematic);
        this.saveToLocalStorage(schematic.id);
        return schematic;
    }

    public saveToLocalStorage(id: string) {
        let schematic = this.customSchematics.get(id);

        if (schematic) {
            let lsSchematic: ILSSchematic = {
                id: schematic.id,
                name: schematic.name,
                model: wiresToLsState(schematic.model),
            };
            localStorage.setItem(this.schematicLocalStorageKey(schematic.id), JSON.stringify(lsSchematic));
        } else if (this.builtinSchematics.get(id)) {
            // console.log(`Can't update builtin schematic ${id}`);
        } else {
            console.error(`Schematic ${id} not found`);
        }
    }

    private schematicLocalStorageKey(id: string) {
        return `schematic-${id}`;
    }
}

export interface ILSSchematic {
    id: string;
    name: string;
    model: ILSState;
}

export interface ISchematicDef {
    id: string;
    name: string;
    model: ICpuLayout;

    hasEdits: boolean;
    // when we switch between models, want to keep as much state around as possible
    undoStack?: ICpuLayout[];
    redoStack?: ICpuLayout[];
    mtx?: AffineMat2d;
    schematicStr?: string; // for LS update detection
}
