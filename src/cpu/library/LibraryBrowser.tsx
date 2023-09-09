import { assignImm, clamp, getOrAddToMap } from "@/src/utils/data";
import { isKeyWithModifiers, KeyboardOrder, Modifiers, useGlobalKeyboard } from "@/src/utils/keyboard";
import { useCombinedMouseTouchDrag } from "@/src/utils/pointer";
import { FullscreenOverlay, ModalWindow, Portal } from "@/src/utils/Portal";
import { faClone, faImage, faTrashAlt } from "@fortawesome/free-regular-svg-icons";
import { faPencil, faPlus, faTimes, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import React, { ButtonHTMLAttributes, useEffect, useLayoutEffect, useState } from "react";
import { useEditorContext } from "../Editor";

interface IMyItems {
    id: string;
    title: string;
    notes?: string;
}

let exampleItems: IMyItems[] = [
    { id: 'cpu/riscv_simple0:1', title: 'RISCV Simple 0' },
    { id: 'cpu/riscv_simple0:2', title: 'RISCV Simple 0' },
    { id: 'cpu/riscv_simple0:3', title: 'RISCV Simple 0' },

    { id: 'cpu/riscv_simple1:3', title: 'RISCV Simple 1' },
    { id: 'cpu/riscv_simple1:4', title: 'RISCV Simple 1' },
    { id: 'cpu/riscv_simple1:7', title: 'RISCV Simple 1' },

    { id: 'cpu/riscv_pipeline_2stage:7', title: 'RISCV Pipelined (2 stage)' },
    { id: 'cpu/riscv_pipeline_2stage:53', title: 'RISCV Pipelined (2 stage)' },
    { id: 'cpu/riscv_pipeline_2stage:54', title: 'RISCV Pipelined (2 stage)' },

    { id: 'cpu/riscv_pipeline_3stage', title: 'RISCV Pipelined (3 stage)' },

    { id: 'riscv/alu0', title: 'RISCV ALU 0' },

    { id: 'math/adder0', title: 'Adder' },
    { id: 'math/shift32', title: 'Shift32' },

    { id: 'gate/not', title: 'Not' },
    { id: 'gate/and', title: 'And' },
    { id: 'gate/or', title: 'Or' },
    { id: 'gate/nor', title: 'Nor' },
    { id: 'gate/nand', title: 'Nand' },
    { id: 'gate/xor', title: 'Xor' },
];

for (let i = 0; i < 0; i++) {
    exampleItems.push({ id: `folder${i.toString().padStart(2, '0')}/entry0`, title: `Folder ${i} Entry 0` });
}

interface IMyFolder {
    id: string;
    items: IMyItems[];
    groups: Map<string, IItemGroup>;
}

// share the same id except for the version
interface IItemGroup {
    id: string;
    name: string;
    items: IMyItems[];
}

function parseId(id: string): { dir: string, name: string, path: string[], version: string } {
    let [path, version] = id.split(':');
    let pathParts = path.split('/');
    let dir = pathParts.slice(0, pathParts.length - 1).join('/');
    let name = pathParts[pathParts.length - 1];
    return { path: pathParts, version, dir, name };
}

function groupIntoFolders(items: IMyItems[]): IMyFolder[] {

    let folderLookup = new Map<string, IMyFolder>();

    for (let item of items) {
        let { dir, name, path, version } = parseId(item.id);
        let folder = getOrAddToMap(folderLookup, dir, () => ({ id: dir, items: [], groups: new Map() }));
        folder.items.push(item);

        let groupId = path.join('/');
        let group = getOrAddToMap(folder.groups, groupId, () => ({ id: groupId, name, items: [] }));
        group.items.push(item);
    }

    return [...folderLookup.values()];
}

function pluralize(a: string, count: number) {
    return count === 1 ? a : a + 's';
}

export const LibraryBrowser: React.FC<{}> = () => {

    let { editorState, setEditorState } = useEditorContext();
    let [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    let [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    useGlobalKeyboard(KeyboardOrder.Modal, ev => {
        if (isKeyWithModifiers(ev, 'Escape', Modifiers.None)) {
            handleClose();
        }
    });

    let folders = groupIntoFolders(exampleItems);

    let selectedFolder = folders.find(a => a.id === selectedFolderId);
    let selectedGroupId = selectedItemId ? parseId(selectedItemId).path.join('/') : null;
    let selectedGroup = selectedFolder && selectedGroupId ? selectedFolder.groups.get(selectedGroupId) : null;
    let selectedItem = selectedGroup && selectedItemId ? selectedGroup.items.find(a => a.id === selectedItemId) : null;

    useLayoutEffect(() => {
        if (!selectedFolderId) {
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

    return <FullscreenOverlay className={"pointer-events-auto dialog-fade-in"}>
        <div className="absolute inset-0 bg-opacity-40 bg-black pointer-events-auto" onClick={handleClose} />
        <div className="flex flex-col bg-white rounded shadow-2xl absolute inset-10 overflow-hidden pointer-events-auto m-auto max-w-[80rem] max-h-[50rem]">
            <div className="px-2 py-1 text-center border-b text-2xl bg-gray-500 text-white relative">
                Library Browser
                <button className="cursor-pointer absolute top-0 right-0 bottom-0" onClick={handleClose}>
                    <FontAwesomeIcon icon={faTimes} className="px-3" />
                </button>
            </div>
            <Resizer id="libraryBrowser" className="flex-1 overflow-hidden border" defaultFraction={0.3}>
                <div className="flex flex-col flex-1 overflow-hidden">
                    <h2 className="text-center p-1 border-b">Folders</h2>
                    <div className="flex flex-col overflow-y-auto flex-1">
                        <div className="flex flex-col bg-gray-100 flex-1">

                            {folders.map(folder => {
                                let isSelected = folder.id === selectedFolderId;
                                let itemCount = folder.items.length;
                                let groupCount = folder.groups.size;

                                return <div
                                    key={folder.id}
                                    className={clsx("px-2 py-1 w-full flex cursor-pointer items-center", isSelected ? "bg-blue-200 hover:bg-blue-300" : "bg-white hover:bg-slate-100")}
                                    onClick={() => setSelectedFolderId(folder.id)}
                                >
                                    {folder.id}
                                    <div className="ml-auto text-gray-500 text-sm">
                                        {groupCount} {pluralize('item', groupCount)} ({itemCount} {pluralize('version', itemCount)})
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

                                <FileCell onClick={() => { }} className="items-center justify-center" isSelected={false}>
                                    <FontAwesomeIcon icon={faPlus} className="mr-2 text-6xl text-gray-300 group-hover:text-gray-400" />
                                </FileCell>
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
        <h2 className="text-center p-1 text-lg">{group.items[0].title}</h2>

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
    item: IMyItems | null,
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
                <h1 className="text-lg">{item?.title ?? group.name}</h1>
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


export const Resizer: React.FC<{
    id: string;
    className?: string;
    vertical?: boolean;
    defaultFraction?: number;
    children: [React.ReactNode, React.ReactNode];
}> = ({ id, className, children, vertical, defaultFraction }) => {

    let [parentEl, setParentEl] = useState<HTMLElement | null>(null);
    let [sliderHitEl, setSliderHitEl] = useState<HTMLElement | null>(null);
    let childrenArr = React.Children.toArray(children);
    let firstChild = childrenArr[0] as React.ReactElement;
    let scndChild = childrenArr[1] as React.ReactElement;

    let [fraction, setFraction] = useState(defaultFraction ?? 0.4);

    let [, setDragStart] = useCombinedMouseTouchDrag(sliderHitEl, () => fraction, (ev, ds, end) => {
        let parentBcr = parentEl!.getBoundingClientRect();
        let deltaPx = vertical ? ev.clientY - ds.clientY : ev.clientX - ds.clientX;
        let fullSizePx = vertical ? parentBcr.height : parentBcr.width;
        let newFraction = clamp(ds.data + deltaPx / fullSizePx, 0, 1);
        setFraction(newFraction);
        ev.preventDefault();
        ev.stopPropagation();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.stopPropagation();
        ev.preventDefault();
    }

    let pct = (fraction * 100) + '%';
    let invPct = ((1 - fraction) * 100) + '%';

    return <div ref={setParentEl} className={clsx("relative flex", className, vertical ? 'flex-col' : 'flex-row')}>
        <div className="flex flex-initial overflow-hidden" style={{ flexBasis: pct }}>
            {firstChild}
        </div>
        <div className="flex flex-initial overflow-hidden" style={{ flexBasis: invPct }}>
            {scndChild}
        </div>
        <div
            ref={setSliderHitEl}
            className={clsx("absolute", vertical ? "w-full cursor-ns-resize h-4" : "h-full cursor-ew-resize w-4")}
            style={{ transform: `translate${vertical ? 'Y' : 'X'}(-50%)`, top: vertical ? pct : undefined, left: vertical ? undefined : pct }}
            onMouseDown={handleMouseDown}>
        </div>
        <div
            className={clsx("absolute bg-slate-200 pointer-events-none", vertical ? "w-full h-0 border-t" : "h-full w-0 border-l")}
            style={{ transform: `translate${vertical ? 'Y' : 'X'}(-50%)`, top: vertical ? pct : undefined, left: vertical ? undefined : pct }}>
        </div>
    </div>;
};
