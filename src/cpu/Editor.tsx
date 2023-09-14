import { createContext, useContext } from 'react';
import { assignImm, StateSetter } from '../utils/data';
import { IComp, IEditSnapshot, IEditorState, IExeSystem } from './CpuModel';
import { updateWiresForComp } from './Wire';

export enum PortHandling {
    Detach, // e.g. for rotating a component, the wire will need to be manually re-attached
    Move, // e.g. resizing a component, the wire will move with the port
}

export interface ICompEditArgs {
    portHandling?: PortHandling;
}

export function editCompConfig<A>(end: boolean, comp: IComp<A>, updateConfig: (config: A) => A, compEditArgs?: ICompEditArgs) {
    return editComp(end, comp, a => assignImm(a, { args: updateConfig(a.args) }), compEditArgs);
}

export function editComp<A>(end: boolean, comp: IComp<A>, updateComp: (comp: IComp<A>) => IComp<A>, compEditArgs?: ICompEditArgs) {
    return editLayout(end, (layout, state) => {

        let comp2 = layout.comps.find(a => a.id === comp.id) as IComp<A> | null;
        if (!comp2) {
            return layout;
        }

        let comp3 = updateComp(comp2);
        if (comp3 === comp2) {
            return layout;
        }

        layout = assignImm(layout, { comps: layout.comps.map(a => a.id === comp.id ? comp3! : a) });
        state.compLibrary.updateCompFromDef(comp3);

        layout = updateWiresForComp(layout, comp3, compEditArgs?.portHandling ?? PortHandling.Move);

        return layout;
    });
}

export function editLayout(end: boolean, updateLayout: (element: IEditSnapshot, state: IEditorState) => IEditSnapshot) {
    return (state: IEditorState) => {
        let changed = updateLayout(state.snapshot, state);

        if (!changed) {
            return assignImm(state, { snapshotTemp: null });
        }

        if (end) {
            state = assignImm(state, {
                snapshot: changed,
                snapshotTemp: null,
                undoStack: [...state.undoStack, state.snapshot],
                redoStack: [],
            });
        } else {
            state = assignImm(state, { snapshotTemp: changed });
        }

        return state;
    };
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

export const EditorContext = createContext<IEditorContext | null>(null);

export interface IEditorContext {
    editorState: IEditorState;
    exeModel: IExeSystem;
    setEditorState: StateSetter<IEditorState>;
}

export function useEditorContext() {
    const ctx = useContext(EditorContext);
    if (!ctx) {
        throw new Error('EditorContext not found');
    }
    return ctx;
}
