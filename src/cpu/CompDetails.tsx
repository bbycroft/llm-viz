import React from "react";
import { editComp, editCompConfig, editMainSchematic, useEditorContext } from "./Editor";
import { CompDefFlags, IComp, IElRef, IExeComp, IExeSystem, RefType } from "./CpuModel";
import { StringEditor } from "./displayTools/StringEditor";
import { assignImm, getOrAddToMap, hasFlag } from "../utils/data";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { getCompFromRef, getCompSubSchematic } from "./SubSchematics";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "../utils/keyboard";
import { HexValueEditor, HexValueInputType } from "./displayTools/HexValueEditor";
import { ButtonStandard } from "./EditorControls";
import { rotatePos } from "./comps/CompHelpers";
import { BoundingBox3d } from "../utils/vector";

function getExeComp(exeModel: IExeSystem, compRef: IElRef): IExeComp | null {
    let idx = exeModel.lookup.compIdToIdx.get(compRef.id);
    return exeModel.comps[idx ?? -1] ?? null;
}

export const CompDetails: React.FC<{
}> = ({  }) => {
    let [editorState, setEditorState] = useEditorContext();

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;
    let numSelected = snapshot.selected.length;

    let singleCompRef = numSelected === 1 && snapshot.selected[0].type === RefType.Comp ? snapshot.selected[0] : null;
    let singleComp = singleCompRef ? getCompFromRef(editorState, singleCompRef.id) : null;
    let compDef = singleComp ? editorState.compLibrary.getCompDef(singleComp.defId) : null;
    let exeComp = singleCompRef && editorState.exeModel ? getExeComp(editorState.exeModel, singleCompRef) : null;

    function handleNameUpdate(end: boolean, value: string) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp!, comp => assignImm(comp, { name: value })));
    }

    function handleExtIdUpdate(end: boolean, value: string) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp!, comp => assignImm(comp, { extId: value })));
    }

    function handleBitWidthUpdate(end: boolean, value: number) {
        setEditorState(editCompConfig({ idPrefix: "" }, end, singleComp! as IComp<{ bitWidth: number }>, comp => assignImm(comp, { bitWidth: value })));
    }

    function handleInternalSchematicAddNew() {
        let newSchematic = editorState.schematicLibrary.addCustomSchematic('New Schematic')!;
        newSchematic.snapshot.mainSchematic.parentCompDefId = singleComp!.defId;
        // probably want to zoom into the new schematic??
        setEditorState(editComp({ idPrefix: "" }, true, singleComp!, comp => assignImm(comp, { subSchematicId: newSchematic.id })));
    }

    useGlobalKeyboard(KeyboardOrder.Element, ev => {
        // if (singleComp && compDef) {
        if (isKeyWithModifiers(ev, 'r')) {
            setEditorState(fullState => {

                let rotateCenter = fullState.snapshot.selectionRotateCenter;
                let schematic = fullState.snapshot.mainSchematic;

                let selectedCompIds = new Set<string>();
                let selectedWiresAndNodes = new Map<string, Set<number>>();
                for (let selected of snapshot.selected) {
                    if (selected.type === RefType.Comp) {
                        selectedCompIds.add(selected.id);
                    } else if (selected.type === RefType.WireNode) {
                        let wireId = selected.id;
                        getOrAddToMap(selectedWiresAndNodes, wireId, () => new Set())
                            .add(selected.wireNode0Id!);
                    } else if (selected.type === RefType.WireSeg) {
                        let wireId = selected.id;
                        getOrAddToMap(selectedWiresAndNodes, wireId, () => new Set())
                            .add(selected.wireNode0Id!).add(selected.wireNode1Id!);
                    }
                }

                if (!rotateCenter) {

                    let selectedBb = new BoundingBox3d();
                    for (let comp of schematic.comps) {
                        if (selectedCompIds.has(comp.id)) {
                            selectedBb.combineInPlace(comp.bb);
                        }
                    }
                    for (let wire of schematic.wires) {
                        let nodeIds = selectedWiresAndNodes.get(wire.id);
                        if (nodeIds) {
                            for (let nodeId of nodeIds) {
                                let node = wire.nodes[nodeId];
                                selectedBb.addInPlace(node.pos);
                            }
                        }
                    }

                    rotateCenter = selectedBb.center().floor();

                    fullState = assignImm(fullState, {
                        snapshot: assignImm(fullState.snapshot, {
                            selectionRotateCenter: rotateCenter,
                        }),
                    });
                }

                fullState = editMainSchematic(true, (schematic, state, snapshot) => {
                    let center = rotateCenter!;

                    return assignImm(schematic, {
                        comps: schematic.comps.map(comp => {
                            if (selectedCompIds.has(comp.id)) {
                                comp = assignImm(comp, {
                                    pos: rotatePos(1, comp.pos.sub(center)).add(center),
                                    rotation: (comp.rotation + 1) % 4,
                                });
                                editorState.compLibrary.updateCompFromDef(comp);
                            }
                            return comp;
                        }),
                        wires: schematic.wires.map(wire => {
                            let nodeIds = selectedWiresAndNodes.get(wire.id);
                            if (!nodeIds) {
                                return wire;
                            }

                            wire = assignImm(wire, { nodes: [...wire.nodes] });

                            for (let nodeId of nodeIds) {
                                let node = wire.nodes[nodeId];
                                wire.nodes[nodeId] = assignImm(node, {
                                    pos: rotatePos(1, node.pos.sub(center)).add(center),
                                });
                            }

                            return wire;
                        }),
                    });
                })(fullState);

                return fullState;
            });

            ev.preventDefault();
            ev.stopPropagation();
        }
    });

    let subSchematic = singleComp ? getCompSubSchematic(editorState, singleComp) : null;

    let isAtomic = singleComp && hasFlag(singleComp.flags, CompDefFlags.IsAtomic);

    return <div className="flex flex-col flex-1">
        {numSelected === 0 && <div className="my-2 mx-2">No component selected</div>}
        {numSelected === 1 && singleComp && compDef && <div>
            <div className="my-2 mx-2">Selected Component: <b>{singleComp.name}</b></div>
            <div className="mx-2">
                <EditKvp label={'Id'}>
                    <span className="font-mono">
                        <code>{singleComp.id}</code>, <code>{singleComp.defId}</code>, ({singleComp.pos.x},{singleComp.pos.y})
                    </span>
                </EditKvp>
                {/* <EditKvp label={'Def Id'}></EditKvp> */}
                <EditKvp label={'Name'}><StringEditor className="bg-slate-100 rounded flex-1" value={singleComp.args.name ?? singleComp.name} update={handleNameUpdate} /></EditKvp>
                <EditKvp label={'Ext Id'}><StringEditor className="bg-slate-100 rounded font-mono flex-1" value={singleComp.args.extId ?? ''} update={handleExtIdUpdate} /></EditKvp>
                {/* <EditKvp label={'Pos'}>{}</EditKvp> */}

                {singleComp.flags && hasFlag(singleComp.flags, CompDefFlags.HasBitWidth) && <EditKvp label={'Bit Width'}>
                    <HexValueEditor
                        className="text-lg bg-slate-100 rounded"
                        inputType={HexValueInputType.Dec}
                        fixedInputType
                        hidePrefix
                        signed={false}
                        value={(singleComp.args as any).bitWidth ?? 0}
                        update={handleBitWidthUpdate}
                    />

                </EditKvp>}

                {compDef.renderOptions && compDef.renderOptions({ comp: singleComp, exeComp: exeComp, editCtx: { idPrefix: "" } })}

            </div>
            {!isAtomic && <div className="m-2">
                <div className="mb-2">Internal Schematic</div>
                {!subSchematic && <ButtonStandard onClick={handleInternalSchematicAddNew}>
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Add New
                </ButtonStandard>}
                {singleComp.subSchematicId && <EditKvp label={'Id'}><code>{singleComp.subSchematicId}</code></EditKvp>}
                {subSchematic && <EditKvp label={'Name'}><code>{subSchematic?.name}</code></EditKvp>}
            </div>}
        </div>}
    </div>;
};

export const EditKvp: React.FC<{
    label: string;
    children?: React.ReactNode;
}> = ({ label, children }) => {
    return <div className="flex flex-row items-center my-2">
        <div className="w-[6rem] mr-3 text-end text-gray-500">{label}</div>
        <div className="flex-1">{children}</div>
    </div>;
};
