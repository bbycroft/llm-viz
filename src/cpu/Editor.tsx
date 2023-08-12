import { AffineMat2d } from '../utils/AffineMat2d';
import { assignImm } from '../utils/data';
import { Vec3 } from '../utils/vector';
import { IBus, IComp, ICompNode, ICpuLayout, IElRef } from "./CpuCanvas";

export interface IEditorState {
    mtx: AffineMat2d;

    layout: ICpuLayout;
    layoutTemp: ICpuLayout | null;

    undoStack: ICpuLayout[];
    redoStack: ICpuLayout[];

    hovered: IElRef | null;
}

export interface ICanvasState {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    size: Vec3; // derived
    scale: number; // derived
}

export type IElement = IComp | ICompNode | IBus;

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
