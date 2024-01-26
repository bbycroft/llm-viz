import React from "react";
import { editSnapshot, useEditorContext } from "../Editor";
import { ICompDef } from "../comps/CompBuilder";
import { assignImm, getOrAddToMap } from "../../utils/data";
import { useGlobalDrag } from "../../utils/pointer";
import { multiSortStableAsc } from "@/src/utils/array";
import { ILibraryItem, NumberRenderFlags } from "../CpuModel";
import { Vec3 } from "@/src/utils/vector";

export const CompLibraryView: React.FC = () => {
    let [{ compLibrary }, setEditorState] = useEditorContext();

    let libItems = [...new Set([...compLibrary.libraryLookup.values()])];

    let [, setDragStart] = useGlobalDrag<number>(function handleMove(ev, ds, end) {
        setEditorState(a => {
            if (a.dragCreateComp?.applyFunc) {
                a = editSnapshot(end, a.dragCreateComp.applyFunc)(a);
            }
            if (end) {
                a = assignImm(a, { dragCreateComp: undefined });
            }
            return a;
        });
    });

    function handleMouseDown(ev: React.MouseEvent, compDef: ICompDef<any>) {

        let newComp = compLibrary.create(compDef.defId)!;

        setEditorState(a => assignImm(a, {
            dragCreateComp: { compOrig: newComp },
        }));

        ev.preventDefault();
        ev.stopPropagation();

        setDragStart(ev, 0);
    }

    function handleLabelAdd(ev: React.MouseEvent) {
        setEditorState(a => assignImm(a, {
            dragCreateComp: {
                wireLabel: {
                    id: '0',
                    wireId: '0',
                    anchorPos: new Vec3(),
                    numRenderFlags: NumberRenderFlags.Dec | NumberRenderFlags.Signed,
                    rectRelPos: new Vec3(2, 2),
                    rectSize: new Vec3(4, 2),
                    text: 'new label',
                },
            },
        }));

        ev.preventDefault();
        ev.stopPropagation();

        setDragStart(ev, 0);
    }

    let prefixGroups: Map<string, ILibraryItem[]> = new Map();

    let orderedItems = multiSortStableAsc(libItems, [a => a.id]);

    for (let item of orderedItems) {
        let prefixIdx = item.id.lastIndexOf('/');
        let prefix = item.id.slice(0, prefixIdx);
        if (prefixIdx === -1) {
            prefix = '';
        }
        let group = getOrAddToMap(prefixGroups, prefix, () => []);
        group.push(item);
    }

    let groups = multiSortStableAsc([...prefixGroups], [([prefix]) => prefix]);

    return <div className={'flex flex-col overflow-hidden'}>
        <div className="flex flex-row my-2">
            {<div className="cursor-move hover:bg-slate-300 px-2" onMouseDown={ev => handleLabelAdd(ev)}>
                Add Label
            </div>}
        </div>
        <div className="overflow-y-auto flex flex-col">
            {[...groups].map(([prefix, group]) => {

                let groupKey = prefix || '<ungrouped>';

                return <div key={groupKey} className="flex flex-col">
                    <div className="text-gray-600 font-mono italic text-sm ml-1 bg-slate-200 py-1">{groupKey}</div>
                    <div className="flex flex-col">
                        {group.map((item, idx) => {
                            let itemId = item.id.slice(prefix.length).replace(/^\//, '');

                            return <div
                                className={"cursor-move hover:bg-slate-300 flex items-center pl-3"}
                                key={idx}
                                onMouseDown={ev => handleMouseDown(ev, item.compDef!)}
                            >
                                <div className="font-mono text-sm min-w-[6rem] mr-2">{itemId}</div>
                                <div>{item.name}</div>
                            </div>;
                        })}
                    </div>
                </div>;
            })}
        d</div>
    </div>;
};
