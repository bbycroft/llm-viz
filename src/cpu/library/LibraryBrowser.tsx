import { clamp, getOrAddToMap } from "@/src/utils/data";
import { useCombinedMouseTouchDrag } from "@/src/utils/pointer";
import clsx from "clsx";
import React, { useState } from "react";

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

        let group = getOrAddToMap(folder.groups, name, () => ({ id: path.join('/'), name, items: [] }));
        group.items.push(item);
    }

    return [...folderLookup.values()];
}

function pluralize(a: string, count: number) {
    return count === 1 ? a : a + 's';
}

export const LibraryBrowser: React.FC<{}> = () => {

    let [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    let [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

    let folders = groupIntoFolders(exampleItems);

    let selectedFolder = folders.find(a => a.id === selectedFolderId);
    let selectedGroup = selectedFolder && selectedGroupId ? selectedFolder.groups.get(selectedGroupId) : null;

    return <div className="flex flex-col bg-white rounded shadow-2xl ring-offset-0 absolute inset-10 box-border overflow-hidden border">
        <div className="px-2 py-1 text-center border-b text-2xl bg-gray-500 text-white">Library Browser</div>
        <Resizer id="libraryBrowser" className="flex-1 overflow-hidden" defaultFraction={0.3}>
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
                                className={clsx("px-2 py-1 w-full flex cursor-pointer items-center bg-white hover:bg-slate-100", isSelected && "bg-blue-200 hover:bg-blue-300")}
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

            <Resizer id="fileInfoSplit" vertical className="flex-1" defaultFraction={0.7}>
                <div className="flex-1 overflow-y-auto bg-gray-100">
                    <div className="grid"
                        style={{ gridTemplateColumns: 'repeat(auto-fit, 230px)' }}
                    >
                        {selectedFolder && <>

                            {[...selectedFolder.groups.entries()].map(([gId, g]) => {
                                let nItems = g.items.length;

                                return <div
                                    key={g.id}
                                    className={clsx("shadow border h-[6rem] m-2 flex-none bg-white flex flex-col cursor-pointer hover:bg-slate-100")}
                                    onClick={() => setSelectedGroupId(gId)}
                                >
                                    <h2 className="text-center">{g.items[0].title}</h2>

                                    <div className="mt-auto px-2 text-slate-500 text-sm ml-auto">
                                        {nItems > 1 && <>
                                            {nItems} {pluralize('version', nItems)}
                                        </>}
                                    </div>
                                </div>;
                            })}

                        </>}
                    </div>
                </div>
                <div className="flex flex-1 flex-col">
                    <h2 className="text-center p-1 border-b">File Info</h2>
                    {selectedGroup && <div className="flex flex-1 flex-row">
                        <div className="w-[14rem] flex flex-col">
                            <div className="px-2 py-1 text-center">Versions</div>
                            <div className="overflow-y-auto bg-gray-100 flex-1">
                                <div className="flex flex-1 flex-col">
                                    {selectedGroup.items.map(item => {
                                        let { version } = parseId(item.id);
                                        return <div key={item.id} className="px-2 py-1 flex items-center">
                                            {item.title}
                                            <div className="text-slate-500 text-sm ml-auto">{version}</div>
                                        </div>;
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col flex-0">
                            {selectedGroup.name} ({selectedGroupId})
                        </div>
                    </div>}
                </div>
            </Resizer>
        </Resizer>
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
