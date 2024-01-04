import { iterLocalStorageEntries } from "@/src/utils/localstorage";
import { CompLibrary, } from "../comps/CompBuilder";
import { IEditSnapshot, ISchematicDef } from "../CpuModel";
import { exportData, editSnapshotToLsSchematic, lsSchematicToSchematicDef, ILSSchematic } from "../ImportExport";
import { getOrAddToMap } from "@/src/utils/data";
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

    internalSchematicLookup = new Map<string, string[]>();

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
                let libItem = createSchematicCompDef(schem.id, schem.name, schem.snapshot.mainSchematic, schem.compArgs);
                compLibrary.addLibraryItem(libItem);
            }
        }
    }

    public addLocalSchematics(compLibrary: CompLibrary) {
        for (let lsSchematic of schematicManifest) {
            this.builtinSchematics.set(lsSchematic.id, lsSchematicToSchematicDef(lsSchematic, compLibrary));
        }
    }

    deleteCustomSchematic(id: string) {
        this.customSchematics.delete(id);
        localStorage.removeItem(this.schematicLocalStorageKey(id));
    }

    public getSchematic(id: string): ISchematicDef | undefined {
        return this.customSchematics.get(id) || this.builtinSchematics.get(id);
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

            customSchematics.set(lsSchematic.id, lsSchematicToSchematicDef(lsSchematic, compLibrary))
        });

        this.localStorageSchematicsLoaded = true;
    }


    private resolveSchematicRefs(compLibrary: CompLibrary) {
        for (let schematic of [...this.builtinSchematics.values(), ...this.customSchematics.values()]) {
            let parentCompDefId = schematic.snapshot.mainSchematic.parentCompDefId;
            if (parentCompDefId) {
                getOrAddToMap(this.internalSchematicLookup, parentCompDefId, () => []).push(schematic.id);
            }
        }

        for (let schematic of [...this.builtinSchematics.values(), ...this.customSchematics.values()]) {
            for (let i = 0; i < schematic.snapshot.mainSchematic.comps.length; i++) {
                let comp = schematic.snapshot.mainSchematic.comps[i];
                if (!comp.resolved) {
                    let newComp = compLibrary.create(comp.defId, comp.args);
                    newComp.id = comp.id;
                    newComp.pos = comp.pos;
                    newComp.rotation = comp.rotation;
                    newComp.subSchematicId = comp.subSchematicId;
                    compLibrary.updateCompFromDef(newComp);
                    if (!newComp.resolved) {
                        console.error(`Schematic ${schematic.id} references unknown component ${comp.defId}`);
                        continue;
                    }

                    schematic.snapshot.mainSchematic.comps[i] = newComp;
                }

                if (!comp.subSchematicId) {
                    let internalSchemIds = this.internalSchematicLookup.get(comp.defId);
                    if ((internalSchemIds?.length ?? 0) > 0) {
                        comp.subSchematicId = internalSchemIds![0];
                    }
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
            snapshot: constructEditSnapshot(),
            hasEdits: false,
        };
        schematic.snapshot.mainSchematic.id = id;
        this.customSchematics.set(id, schematic);
        this.saveToLocalStorage(schematic.id);
        return schematic;
    }

    public saveToLocalStorage(id: string) {
        let schematic = this.customSchematics.get(id);

        if (schematic) {
            let lsSchematic = editSnapshotToLsSchematic(id, schematic.snapshot);
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
import { ILSSchematic } from "@/src/cpu/ImportExport";
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

