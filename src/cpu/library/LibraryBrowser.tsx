import { assignImm, getOrAddToMap, isNil } from "@/src/utils/data";
import { isKeyWithModifiers, KeyboardOrder, Modifiers, useGlobalKeyboard } from "@/src/utils/keyboard";
import { FullscreenOverlay } from "@/src/utils/Portal";
import { faClone, faImage, faTrashAlt } from "@fortawesome/free-regular-svg-icons";
import { faPencil, faPlus, faTimes, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import React, { ButtonHTMLAttributes, useLayoutEffect, useMemo, useState } from "react";
import { ILibraryItem } from "../CpuModel";
import { useEditorContext } from "../Editor";
import { ISchematicDef } from "../schematics/SchematicLibrary";
import { pluralize } from "@/src/utils/text";
import { Resizer } from "@/src/utils/Resizer";

interface IMyFolder {
    id: string;
    items: ILibraryItem[];
    groups: Map<string, IItemGroup>;
}

// share the same id except for the version
interface IItemGroup {
    id: string;
    name: string;
    items: ILibraryItem[];
}

function parseId(id: string): { dir: string, name: string, path: string[], version: string } {
    let [path, version] = id.split(':');
    let pathParts = path.split('/');
    let dir = pathParts.slice(0, pathParts.length - 1).join('/');
    let name = pathParts[pathParts.length - 1];
    return { path: pathParts, version, dir, name };
}

function libraryItemsToFolders(libraryItems: ILibraryItem[]): IMyFolder[] {
    let folderLookup = new Map<string, IMyFolder>();

    let byKey = new Map<string, ILibraryItem>();
    for (let item of libraryItems) {
        byKey.set(item.id, item);
    }

    for (let libraryItem of byKey.values()) {
        let { dir, name, path, version } = parseId(libraryItem.id);

        let folder = getOrAddToMap(folderLookup, dir, () => ({ id: dir, items: [], groups: new Map() }));
        folder.items.push(libraryItem);

        let groupId = path.join('/');
        let group = getOrAddToMap(folder.groups, groupId, () => ({ id: groupId, name, items: [] }));
        group.items.push(libraryItem);
    }

    return [...folderLookup.values()];


}

/* What does the LibraryBrowser show?

We currently have 2 concepts:
 1) schematics, and
 2) components

But really they can be sort of combined.
  - We have leaf components with purely code implementations.
  - We have components with only code impl, but in theory could have a schematic.
  - We have components with only a schematic, built-in (for examples), and user-defined.

So schematics might have an implicit ICompDef (say they have no I/O), or explicitly, such as when
they're created from a group, or created from scratch.

Our unit is a component + [schematic], which really is an ICompDef<any> atm.

Can map a schematic to an ICompDef, and give it an id.

Namespaces:

* want a separate namespace for builtin (made by me) components
* also need something to differentiate pure code components from schematic components

Want to add comp logic to schematics, so they're upgraded a bit.

Have:

ILibraryItem {
    id: string;
    name: string;
    notes: string;
    compDef?: ICompDef,
    schematic?: ISchematicDef,
}

i.e. both parts are optional. We can add either side of the coin as desired. When referencing
a compDef from within a schematic, will use the compDef's defId.

Namespacing of ids:
 - so the id is something like '/core/alu0:34'
 - said id needs to be in some namespace
 - probably want to have a separate namespace for builtin components, and user-defined components
 - /u/ for user-defined, any other prefix for builtin
 - Have an annoying situation with compDefs vs schematics:
   - we can only add compDefs to a schematic, so have Map<string, ICompDef> lookup
   - then the ICompDef's reference the actual schematic data
   - Maybe we want Map<string, ILibraryItem> for our lookup? That will get the ICompDef & any schematic

- OK, yeah that's a good idea, we have Map<string, ILibraryItem> as our central lookup data-structure, and
  likely backed by IndexedDb, say

- OK, so these are _definitions_, but then the ILibraryItem.schematic.comp[i] is an _instance_ of a
  definition, and so has custom, per instance data.

- Probably stick to the IComp object in these.
- Next thing is how to make the execution model work with these sub-schematics.

  - So a schematic-component might be liberally duplicated within a schematic. Each instance will
    have its own state data, but we can probably use the same execution model across all of them.
  - This will require construction of various phases of operation, to fit in with the IComp phase
    system. We can just ignore that for now though, and build the full execution model each time.

- When we zoom in, we track of the compId as well as the libraryId's. Also, we probably have single IComps,
  with multiple IExeComps (each IExeComp in each instance as req'd). But also need a way to map a [ICompId, ICompId, ...] to
  an IExeComp set (could do an offset?).

- Looks like the approach to separating out IComp's from IExeComps was a good one.

- Things like on-demand generation of internal schematics can be done down the line (e.g. for RISCV ins-decode, have both
    js impl & schematic). Will need a way of mapping any state (via refs somehow), and also a flag somewhere, which defines
    which mode to run, plus a "test" / "both" mode. This flag would be updated based on camera movement.

- Managing id transitions:
  - Think maybe we want multiple defIds, then can migrate between them, and update our builtins. Easier than getting it
    right the first time.

- Managing builtin comps:
  - Do we want to be creating ILibraryItem's, or just add the ICompDef's to the library? Probably the latter. What about if
    we add (optional) schematics to a semi-builtin? Maybe our coded ILibraryItem references the ICompDef directly, and the
    id gets replaced, instead of creating a dummy ILibraryItem.


- Ok, what's our upgrade path?
  - Id transition: add field with new ids that we'll write. Both ids map to the same ILibraryItem in our lookup
  - Create our central ILibraryItem lookup, and populate it with our builtins, both schematics & comps
  - Probably just delete all the existing models.

- Create a data-store for library-items
- Add _add schematic_ support in the library
*/

function schematicToLibraryItem(schematic: ISchematicDef, isBuiltin: boolean): ILibraryItem {
    return {
        id: schematic.id,
        name: schematic.name,
        schematic: schematic.model.mainSchematic,
        // ports: schematic?.compArgs?.ports.map(p => ({ ...p })) ?? [],
        // size: schematic?.compArgs?.size ?? new Vec3(0, 0),
        // type: CompDefType.UserDefined,
        // subLayout: {
        //     ports: [],
        //     layout: schematic.model,
        //     bb: new BoundingBox3d(new Vec3(0, 0), new Vec3(100, 100)),
        // },
    };
}

export const LibraryBrowser: React.FC<{}> = () => {

    let { editorState, setEditorState } = useEditorContext();
    let [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    let [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    let builtinSchematics = editorState.schematicLibrary.builtinSchematics;
    let customSchematics = editorState.schematicLibrary.customSchematics;
    let comps = editorState.compLibrary.libraryLookup;

    let allItems = useMemo(() => {
        return [
            ...[...builtinSchematics.values()].map(s => schematicToLibraryItem(s, true)),
            ...[...customSchematics.values()].map(s => schematicToLibraryItem(s, false)),
            ...comps.values(),
        ];
    }, [comps, builtinSchematics, customSchematics]);

    let folders = libraryItemsToFolders(allItems);

    useGlobalKeyboard(KeyboardOrder.Modal, ev => {
        if (isKeyWithModifiers(ev, 'Escape', Modifiers.None)) {
            handleClose();
        }
    });

    // let folders = groupIntoFolders(exampleItems);

    let selectedFolder = folders.find(a => a.id === selectedFolderId);
    let selectedGroupId = selectedItemId ? parseId(selectedItemId).path.join('/') : null;
    let selectedGroup = selectedFolder && selectedGroupId ? selectedFolder.groups.get(selectedGroupId) : null;
    let selectedItem = selectedGroup && selectedItemId ? selectedGroup.items.find(a => a.id === selectedItemId) : null;

    useLayoutEffect(() => {
        if (isNil(selectedFolderId)) {
            setSelectedFolderId(folders[0].id);
        }
        if (!selectedItem && selectedFolder) {
            let groups = [...selectedFolder.groups.values()];
            setSelectedItemId(groups[0].items[0].id);
        }

    }, [selectedFolderId, selectedItem, folders, selectedFolder]);

    function handleClose() {
        setEditorState(a => assignImm(a, { compLibraryVisible: false }));
    }

    return <FullscreenOverlay className={"pointer-events-auto dialog-fade-in overscroll-none touch-none"}>
        <div className="absolute inset-0 bg-opacity-40 bg-black pointer-events-auto" onClick={handleClose} />
        <div className="flex flex-col bg-white rounded shadow-2xl absolute inset-10 overflow-hidden pointer-events-auto m-auto max-w-[80rem] max-h-[50rem]">
            <div className="px-2 py-1 text-center border-b text-2xl bg-gray-500 text-white relative">
                Component Library
                <button className="cursor-pointer absolute top-0 right-0 bottom-0" onClick={handleClose}>
                    <FontAwesomeIcon icon={faTimes} className="px-3" />
                </button>
            </div>
            <Resizer id="libraryBrowser" className="flex-1 overflow-hidden border" defaultFraction={0.3}>
                <div className="flex flex-col flex-1 overflow-hidden">
                    <h2 className="text-center p-1 border-b">Folders</h2>
                    <div className="flex flex-col overflow-y-auto flex-1">
                        <div className="flex flex-col bg-white flex-1">

                            {folders.map(folder => {
                                let isSelected = folder.id === selectedFolderId;
                                let itemCount = folder.items.length;
                                let groupCount = folder.groups.size;

                                return <div
                                    key={folder.id}
                                    className={clsx("px-2 py-1 w-full flex cursor-pointer items-center", isSelected ? "bg-blue-200 hover:bg-blue-300" : "bg-white hover:bg-slate-100")}
                                    onClick={() => setSelectedFolderId(folder.id)}
                                >
                                    {folder.id || '<no folder>'}
                                    <div className="ml-auto text-gray-500 text-sm">
                                        {groupCount} ({itemCount})
                                    </div>
                                </div>;
                            })}

                        </div>
                    </div>
                </div>

                <Resizer id="fileInfoSplit" vertical className="flex-1" defaultFraction={0.5}>
                    <div className="flex-1 overflow-y-auto bg-gray-100 shadow-inner">
                        <div className="grid p-2"
                            style={{ gridTemplateColumns: 'repeat(auto-fit, 230px)' }}
                        >
                            {selectedFolder && <>

                                {[...selectedFolder.groups.entries()].map(([gId, g]) => {
                                    let isActive = gId === selectedGroupId;
                                    return <GroupEntryFileCell key={gId} group={g} isActive={isActive} setSelectedItemId={setSelectedItemId} />;
                                })}

                                {/* <FileCell onClick={() => { }} className="items-center justify-center" isSelected={false}>
                                    <FontAwesomeIcon icon={faPlus} className="mr-2 text-6xl text-gray-300 group-hover:text-gray-400" />
                                </FileCell> */}
                            </>}
                        </div>
                    </div>
                    <div className="flex flex-1 flex-col">
                        <h2 className="text-center p-1 border-b">File Info</h2>
                        {selectedGroup && <SelectedGroupInfo group={selectedGroup} item={selectedItem ?? null} setSelectedItemId={setSelectedItemId} /> }
                    </div>
                </Resizer>
            </Resizer>
        </div>
    </FullscreenOverlay>;
};

export const GroupEntryFileCell: React.FC<{
    isActive: boolean;
    group: IItemGroup;
    setSelectedItemId: (id: string) => void;
}> = ({ group, isActive, setSelectedItemId }) => {
    let nItems = group.items.length;

    function handleItemEdit(ev: React.MouseEvent) {
        ev.stopPropagation();
    }

    function handleItemClone(ev: React.MouseEvent) {
        ev.stopPropagation();
    }

    function handleGroupDelete(ev: React.MouseEvent) {
        ev.stopPropagation();
    }

    return <FileCell
        isSelected={isActive}
        onClick={() => setSelectedItemId(group.items[0].id)}
    >
        <h2 className="text-center p-1 text-lg">{group.items[0].name}</h2>

        <div className="flex flex-row flex-1">
            <div className="flex-1 relative p-1">
                <CompImage className="w-full h-full" />
            </div>

            <div className="px-2 text-slate-500 text-sm flex items-center flex-col">
                <div className="mb-auto">
                    {nItems > 1 && <>
                        {nItems} {pluralize('version', nItems)}
                    </>}
                </div>
                <div className="flex flex-row">
                <IconButton icon={faPencil} onClick={handleItemEdit} />
                <IconButton icon={faClone} onClick={handleItemClone} />
                <IconButton icon={faTrashAlt} onClick={handleGroupDelete} />
                </div>
            </div>
        </div>
    </FileCell>;
};

export const IconButton: React.FC<{
    className?: string;
    icon: IconDefinition;
    onClick: (ev: React.MouseEvent) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, icon, onClick, ...props }) => {

    return <button {...props} className={clsx("text-gray-500 hover:text-black p-1", className)} onClick={onClick}>
        <FontAwesomeIcon icon={icon} />
    </button>;
};

export const FileCell: React.FC<{
    onClick: (ev: React.MouseEvent) => void;
    className?: string;
    children?: React.ReactNode;
    isSelected: boolean;
}> = ({ onClick, children, className, isSelected }) => {

    return <div
        className={clsx("shadow border h-[7.5rem] m-2 flex-none flex flex-col cursor-pointer", className, isSelected ? "bg-blue-200 hover:bg-blue-300" : "bg-white hover:bg-slate-100")}
        onClick={onClick}>

        {children}
    </div>;
};

export const SelectedGroupInfo: React.FC<{
    group: IItemGroup,
    setSelectedItemId: (id: string) => void;
    item: ILibraryItem | null,
}> = ({ group, item, setSelectedItemId }) => {

    let selectedItemId = item?.id;

    return <div className="flex flex-1 flex-row overflow-hidden">
        <div className="w-[14rem] flex flex-col border-r">
            <div className="px-2 py-1 text-center border-b">Versions</div>
            <div className="overflow-y-auto bg-gray-100 flex-1">
                <div className="flex flex-1 flex-col">
                    {group.items.map(item => {
                        let { version } = parseId(item.id);
                        let isSelected = item.id === selectedItemId;

                        return <div
                            key={item.id}
                            className={clsx("px-2 py-1 flex items-center cursor-pointer", isSelected ? "bg-blue-200 hover:bg-blue-300" : "bg-white hover:bg-slate-100")}
                            onClick={() => setSelectedItemId(item.id)}
                            >
                            <div className="mr-1">Version</div>
                            <div className="pr-2 mr-auto">{version}</div>

                            <div className="text-sm">
                                <IconButton icon={faPencil} onClick={() => {}} />
                                <IconButton icon={faClone} onClick={() => {}} />
                                <IconButton icon={faTrashAlt} onClick={() => {}} />
                            </div>
                        </div>;
                    })}
                </div>
            </div>
        </div>
        <div className="flex flex-col flex-1 px-3 overflow-hidden">
            <div className="flex flex-col py-1">
                <h1 className="text-lg">{item?.name ?? group.name}</h1>
                <h2 className="text-sm text-slate-500 font-mono pt-1">{item?.id ?? group.id}</h2>
            </div>
            <div className="flex-1 flex-shrink overflow-hidden max-w-[20rem]">
                <CompImage className="flex-grow-0 pb-[66%]" />
            </div>
        </div>
    </div>;
};

export const CompImage: React.FC<{
    className?: string;
    url?: string;
}> = ({ className, url }) => {

    let urlResolved = url;  // ?? "https://via.placeholder.com/150";

    return <div className={clsx("bg-gray-200 flex items-center justify-center rounded relative overflow-hidden bg-opacity-30 shadow", className)}>
        {url && <img src={urlResolved} className="absolute inset-0 max-h-full max-w-full object-cover w-full h-full" alt="Component" />}
        {!url && <div className="absolute inset-0 flex justify-center items-center bg-gray-200 bg-opacity-0">
            <FontAwesomeIcon icon={faImage} className="mr-2 text-6xl text-gray-400" />
        </div>}
    </div>;
};
