import { faBook } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import React, { ButtonHTMLAttributes } from 'react';
import { assignImm } from '../utils/data';
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

    function handleLibraryClick() {
        setEditorState(a => assignImm(a, { compLibraryVisible: !a.compLibraryVisible }));
    }

    let undoAvailable = editorState.undoStack.length > 0;
    let redoAvailable = editorState.redoStack.length > 0;


    return <div className={clsx(s.toolsTopLeft, s.toolbar, "flex items-stretch")}>
        <button className={s.toolbarBtn} onClick={undo} disabled={!undoAvailable}>Undo</button>
        <button className={s.toolbarBtn} onClick={redo} disabled={!redoAvailable}>Redo</button>
        <button className="hover:bg-blue-300 px-2 whitespace-nowrap" onClick={handleLibraryClick}>
            Component Library
            <FontAwesomeIcon icon={faBook} className="mx-2" />
        </button>
    </div>;
};

export const ToolbarBtn: React.FC<ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...props }) => {

    return <button className={clsx("", className)} {...props}>{children}</button>;
};
