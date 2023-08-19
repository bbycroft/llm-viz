import clsx from 'clsx';
import React from 'react';
import { isKeyWithModifiers, KeyboardOrder, Modifiers, useGlobalKeyboard } from '../utils/keyboard';
import { redoAction, undoAction, useEditorContext } from "./Editor";
import s from './EditorControls.module.scss';

export const CpuEditorToolbar: React.FC<{}> = () => {
    let { editorState, setEditorState } = useEditorContext();

    useGlobalKeyboard(KeyboardOrder.MainPage, ev => {
        if (isKeyWithModifiers(ev, 'z', Modifiers.CtrlOrCmd)) {
            undo();
        }
        if (isKeyWithModifiers(ev, 'y', Modifiers.CtrlOrCmd) || isKeyWithModifiers(ev, 'z', Modifiers.CtrlOrCmd | Modifiers.Shift)) {
            redo();
        }
    });

    function undo() {
        setEditorState(undoAction(editorState));
    }

    function redo() {
        setEditorState(redoAction(editorState));
    }

    let undoAvailable = editorState.undoStack.length > 0;
    let redoAvailable = editorState.redoStack.length > 0;

    return <div className={clsx(s.toolsTopLeft, s.toolbar)}>
        <button className={s.toolbarBtn} onClick={undo} disabled={!undoAvailable}>Undo</button>
        <button className={s.toolbarBtn} onClick={redo} disabled={!redoAvailable}>Redo</button>
    </div>;
};
