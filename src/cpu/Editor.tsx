import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { assignImm, isNotNil, StateSetter } from '../utils/data';
import { IComp, IEditContext, IEditSchematic, IEditSnapshot, IEditorState, IExeSystem, ISchematic, IWireLabel } from './CpuModel';
import { updateWiresForComp } from './Wire';
import { AffineMat2d } from '../utils/AffineMat2d';
import { Subscriptions, useSubscriptions } from '../utils/hooks';
import { getCompSubSchematicForPrefix } from './SubSchematics';
import { arrayMax } from '../utils/array';
import { Vec3 } from '../utils/vector';

export enum PortHandling {
    Detach, // e.g. for rotating a component, the wire will need to be manually re-attached
    Move, // e.g. resizing a component, the wire will move with the port
}

export interface ICompEditArgs {
    portHandling?: PortHandling;
}


export function editCompConfig<A>(editCtx: IEditContext, end: boolean, comp: IComp<A>, updateConfig: (config: A) => A, compEditArgs?: ICompEditArgs) {
    return editComp(editCtx, end, comp, a => assignImm(a, { args: updateConfig(a.args) }), compEditArgs);
}

/*

## Editing Sub-Schematics ##

* We have a good system of refs, where we refer to a comp by its id and its parent comp ids
* But then we need to edit those refs
* We can find the comp, as well as extract the idPrefix
* This runs into trouble when we're operating on a selection that is cross-schematic
* Probably want some way to figure out the primary schematic, or disallow cross-schematic selections

*/

export function editComp<A>(editCtx: IEditContext, end: boolean, comp: IComp<A>, updateComp: (comp: IComp<A>) => IComp<A>, compEditArgs?: ICompEditArgs) {
    return editSubSchematic(editCtx, end, (schematic, state) => {

        let comp2 = schematic.comps.find(a => a.id === comp.id) as IComp<A> | null;
        if (!comp2) {
            console.log('unable to edit comp!!');
            return schematic;
        }

        let comp3 = updateComp(comp2);
        if (comp3 === comp2) {
            return schematic;
        }

        schematic = assignImm(schematic, { comps: schematic.comps.map(a => a.id === comp.id ? comp3! : a) });
        state.compLibrary.updateCompFromDef(comp3);

        schematic = updateWiresForComp(schematic, comp3, compEditArgs?.portHandling ?? PortHandling.Move);

        return schematic;
    });
}

export function editWireLabel(editCtx: IEditContext, end: boolean, labelId: string, updateWireLabel: (wireLabel: IWireLabel) => IWireLabel) {
    return editSubSchematic(editCtx, end, (schematic, state) => {

        let comp2 = schematic.wireLabels.find(a => a.id === labelId)
        if (!comp2) {
            console.log('unable to edit labelId!!');
            return schematic;
        }

        let comp3 = updateWireLabel(comp2);
        if (comp3 === comp2) {
            return schematic;
        }

        schematic = assignImm(schematic, { wireLabels: schematic.wireLabels.map(a => a.id === labelId ? comp3! : a) });

        return schematic;
    });
}

export function editMainSchematic(end: boolean, updateEditSchematic: (schematic: IEditSchematic, state: IEditorState, snapshot: IEditSnapshot) => IEditSchematic) {
    return editSubSchematic({ idPrefix: '' }, end, updateEditSchematic);
}

export function editSubSchematic(editCtx: IEditContext, end: boolean, updateEditSchematic: (schematic: IEditSchematic, state: IEditorState, snapshot: IEditSnapshot) => IEditSchematic) {
    return editSnapshot(end, (snapshot, state) => updateSubSchematic(state, editCtx, snapshot, (schematic) => updateEditSchematic(schematic, state, snapshot)));
}

export function updateSubSchematic(editorState: IEditorState, editCtx: IEditContext, snapshot: IEditSnapshot, updateEditSchematic: (schematic: IEditSchematic) => IEditSchematic): IEditSnapshot {
    if (editCtx.idPrefix) {
        let subSchematic = getCompSubSchematicForPrefix(editorState.sharedContext, snapshot, editCtx.idPrefix);
        if (subSchematic) {
            return assignImm(snapshot, {
                subSchematics: assignImm(snapshot.subSchematics, {
                    [subSchematic.id]: updateEditSchematic(subSchematic),
                }),
            });
        }
    } else {
        return assignImm(snapshot, {
            mainSchematic: updateEditSchematic(snapshot.mainSchematic),
        });
    }

    return snapshot;
}

export function editSnapshot(end: boolean, updateSnapshot: (snapshot: IEditSnapshot, state: IEditorState) => IEditSnapshot) {
    return (state: IEditorState) => {
        let newSnapshot = updateSnapshot(state.snapshot, state);

        if (end) {
            if (newSnapshot === state.snapshot) {
                return assignImm(state, { snapshotTemp: null });
            }

            state = assignImm(state, {
                snapshot: newSnapshot,
                snapshotTemp: null,
                undoStack: [...state.undoStack, state.snapshot],
                redoStack: [],
            });
        } else {
            state = assignImm(state, { snapshotTemp: newSnapshot });
        }

        return state;
    };
}

export function editSnapshotDirect(updateSnapshot: (element: IEditSnapshot, state: IEditorState) => IEditSnapshot) {
    return (state: IEditorState) => {
        let changed = updateSnapshot(state.snapshot, state);
        return assignImm(state, { snapshot: changed, snapshotTemp: null });
    };
}

export function ensureEditSchematic(schematic: ISchematic | IEditSchematic): IEditSchematic {
    if (isEditSchematic(schematic)) {
        return schematic;
    }
    return assignImm(schematic as IEditSchematic, {
        nextCompId: arrayMax(schematic.comps, c => parseInt(c.id), 0) + 1,
        nextWireId: arrayMax(schematic.wires, c => parseInt(c.id), 0) + 1,
        nextWireLabelId: arrayMax(schematic.wires, c => parseInt(c.id), 0) + 1,
    });
}

export function isEditSchematic(schematic: ISchematic | IEditSchematic): schematic is IEditSchematic {
    return isNotNil((schematic as IEditSchematic).nextCompId);
}


export function undoAction(state: IEditorState) {
    if (state.undoStack.length === 0) {
        return state;
    }

    return assignImm(state, {
        snapshot: state.undoStack[state.undoStack.length - 1],
        undoStack: state.undoStack.slice(0, state.undoStack.length - 1),
        redoStack: [...state.redoStack, state.snapshot],
    });
}

export function redoAction(state: IEditorState) {
    if (state.redoStack.length === 0) {
        return state;
    }

    return assignImm(state, {
        snapshot: state.redoStack[state.redoStack.length - 1],
        undoStack: [...state.undoStack, state.snapshot],
        redoStack: state.redoStack.slice(0, state.redoStack.length - 1),
    });
}

export function notifyExeModelUpdated(state: IEditorState) {
    return assignImm(state, { exeModelUpdateCntr: state.exeModelUpdateCntr + 1 });
}

export interface IEditorContext {
    editorState: IEditorState;
    setEditorState: StateSetter<IEditorState>;
}

export function useCreateStoreState<T>(initial: () => T): [T, StateSetter<T>, MyStore<T>] {
    let [store] = useState(() => new MyStore<T>(initial()));
    useSubscriptions(store.subs);

    return [store.value, store.setValue, store];
}


export interface IViewLayoutContext {
    el: HTMLElement;
    mtx: AffineMat2d;
}

export const ViewLayoutContext = createContext<IViewLayoutContext>(null!);

export function useViewLayout() {
    return useContext(ViewLayoutContext);
}

export class MyStore<T> {
    subs: Subscriptions = new Subscriptions();
    constructor(public value: T) {
    }
    setValue = (value: T | ((a : T) => T)) => {
        let prevValue = this.value;
        this.value = value instanceof Function ? value(this.value) : value;

        compareValues(prevValue, this.value);

        if (this.value !== prevValue) {
            this.subs.notify();
        }
    }
}

function compareValues(a: any, b: any) {
    if (a === b) {
        return;
    }

    if ((!a.dragCreateComp) !== (!b.dragCreateComp)) {
        console.log('dragCreateComp changed:', a.dragCreateComp, b.dragCreateComp);
    }
}

type ObjPartial<T> = {
    [P in keyof T]?: T[P] | ObjPartial<T[P]>;
};

type ObjSubSplit<T> = {
    [P in keyof T]?: ObjSubSplit<T[P]> | true;
};

function makeProxyObject<T extends Record<string, any>>(val: T, usages: ObjPartial<T>, subSplits: ObjSubSplit<T> | true): T {
    let proxy = new Proxy(val, {
        get: (target, prop: string) => {
            let key = prop as keyof T;

            if (subSplits !== true) {
                let subSplit = subSplits[key];
                if (subSplit) {

                    let subUsage = usages[key];
                    if (!subUsage) {
                        subUsage = usages[key] = {};
                    }

                    return makeProxyObject(target[key], subUsage as ObjPartial<any>, subSplit);
                }
            }

            let value = Reflect.get(target, key);
            usages[key] = value;

            return value;
        }
    });

    return proxy;
}

function areEqual<T extends Record<string, any>>(obj: T, usages: ObjPartial<T>, subSplits: ObjSubSplit<T> | true): boolean {
    for (let prop of Object.keys(usages)) {
        let key = prop as keyof T;

        let deepField = false;
        if (subSplits !== true) {
            let subSplit = subSplits[key];

            if (subSplit) {
                if (!areEqual(obj[key], usages[key]!, subSplit)) {
                    return false;
                }
                deepField = true;
            }
        }

        if (!deepField && obj[key] !== usages[key]) {
            return false;
        }
    }
    return true;
}

export const MyStoreContext = createContext<MyStore<IEditorState>>(new MyStore<IEditorState>(null!));

// Items with sub-objects or true values will be proxied, and each of their sub-fields will be watched independently
const editorCtxSubSplits: ObjSubSplit<IEditorState> = {
    snapshot: {
        mainSchematic: true,
    },
};

export function useEditorContext(subSplitOverride?: ObjSubSplit<IEditorState> | true): readonly [IEditorState, StateSetter<IEditorState>, MyStore<IEditorState>] {
    let storeCtx = useContext(MyStoreContext);
    let visitedItemsRef = useRef<ObjPartial<IEditorState>>({});
    let [srcValue, setSrcValue] = useState(storeCtx.value);

    let subSplits = subSplitOverride ?? editorCtxSubSplits;

    useEffect(() => {
        function updateFn() {
            let isEq = areEqual(storeCtx.value, visitedItemsRef.current, subSplits);
            if (!isEq) {
                setSrcValue(storeCtx.value);
            }
        }
        return storeCtx.subs.subscribe(updateFn);
    }, [storeCtx, subSplits]);

    visitedItemsRef.current = {};
    let proxyObj = makeProxyObject(srcValue, visitedItemsRef.current, subSplits);

    return [proxyObj, storeCtx.setValue, storeCtx] as const;
}

export function canvasEvToModel(canvas: HTMLElement, ev: { clientX: number, clientY: number }, mtx: AffineMat2d) {
    return mtx.mulVec3Inv(canvasEvToScreen(canvas, ev));
}

export function canvasEvToScreen(canvas: HTMLElement, ev: { clientX: number, clientY: number }) {
    let bcr = canvas.getBoundingClientRect();
    return new Vec3(ev.clientX - (bcr?.x ?? 0), ev.clientY - (bcr?.y ?? 0));
}

export function modelToScreen(pt: Vec3, mtx: AffineMat2d) {
    return mtx.mulVec3(pt);
}

export function screenToModel(pt: Vec3, mtx: AffineMat2d) {
    return mtx.mulVec3Inv(pt);
}
