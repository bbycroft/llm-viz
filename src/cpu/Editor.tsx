import { createContext, useContext } from 'react';
import { assignImm, StateSetter } from '../utils/data';
import { IComp, ICpuLayout, IEditorState, IExeSystem } from './CpuModel';

export function editCompConfig<A>(end: boolean, comp: IComp<A>, updateConfig: (config: A) => A) {
    return editLayout(end, (layout) => {

        let comp2 = layout.comps.find(a => a.id === comp.id) as IComp<A> | null;
        if (!comp2) {
            return layout;
        }

        let config2 = updateConfig(comp2.args);
        if (config2 === comp2.args) {
            return layout;
        }

        comp2 = assignImm(comp2, { args: config2 });
        layout = assignImm(layout, { comps: layout.comps.map(a => a.id === comp.id ? comp2! : a) });
        return layout;

    });
}

export function editLayout(end: boolean, updateLayout: (element: ICpuLayout) => ICpuLayout) {
    return (state: IEditorState) => {
        let changed = updateLayout(state.layout);

        if (!changed) {
            return assignImm(state, { layoutTemp: null });
        }

        if (end) {
            state = assignImm(state, {
                layout: changed,
                layoutTemp: null,
                undoStack: [...state.undoStack, state.layout],
                redoStack: [],
            });
        } else {
            state = assignImm(state, { layoutTemp: changed });
        }

        return state;
    };
}

export function undoAction(state: IEditorState) {
    if (state.undoStack.length === 0) {
        return state;
    }

    return assignImm(state, {
        layout: state.undoStack[state.undoStack.length - 1],
        undoStack: state.undoStack.slice(0, state.undoStack.length - 1),
        redoStack: [...state.redoStack, state.layout],
    });
}

export function redoAction(state: IEditorState) {
    if (state.redoStack.length === 0) {
        return state;
    }

    return assignImm(state, {
        layout: state.redoStack[state.redoStack.length - 1],
        undoStack: [...state.undoStack, state.layout],
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
