import React, { useEffect, useState } from 'react';
import { faBook, faCheck, faChevronRight, faClockRotateLeft, faCodeFork, faExpand, faFloppyDisk, faForward, faForwardFast, faForwardStep, faPlay, faPowerOff, faRedo, faRotateLeft, faTimes, faUndo } from '@fortawesome/free-solid-svg-icons';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { assignImm, isNotNil } from '../utils/data';
import { useGlobalKeyboard, KeyboardOrder, isKeyWithModifiers, Modifiers } from '../utils/keyboard';
import { IBaseEvent } from '../utils/pointer';
import { redoAction, undoAction, useEditorContext } from './Editor';
import clsx from 'clsx';
import { Tooltip } from '../utils/Tooltip';
import { resetExeModel, stepExecutionCombinatorial, stepExecutionLatch } from './CpuExecution';
import { modifiersToString } from './Keymap';

export const MainToolbar: React.FC<{

}> = () => {
    let { editorState, setEditorState } = useEditorContext();

    useGlobalKeyboard(KeyboardOrder.MainPage, ev => {
        if (isKeyWithModifiers(ev, 'z', Modifiers.CtrlOrCmd)) {
            undo();
        }
        if (isKeyWithModifiers(ev, 'y', Modifiers.CtrlOrCmd) || isKeyWithModifiers(ev, 'z', Modifiers.CtrlOrCmd | Modifiers.Shift)) {
            redo();
        }
    });

    function save() {
        if (editorState.activeSchematicId) {
            editorState.schematicLibrary.saveToLocalStorage(editorState.activeSchematicId);
        }
    }

    function saveAs() {

    }

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

    return <div className='h-12 bg-white drop-shadow-md flex'>
        <ToolbarButton icon={faFloppyDisk} onClick={save} tip={`Save (${modifiersToString('S', Modifiers.CtrlOrCmd)})`} />
        <ToolbarButton icon={faCodeFork} onClick={saveAs} notImpl tip={`Duplicate (${modifiersToString('S', Modifiers.CtrlOrCmd | Modifiers.Shift)})`} />

        <ToolbarDivider />

        <ToolbarButton icon={faUndo} disabled={!undoAvailable} onClick={undo} tip={`Undo (${modifiersToString('Z', Modifiers.CtrlOrCmd)})`} />
        <ToolbarButton icon={faRedo} disabled={!redoAvailable} onClick={redo} tip={`Redo (${modifiersToString('Y', Modifiers.CtrlOrCmd)}, ${modifiersToString('Z', Modifiers.CtrlOrCmd | Modifiers.Shift)})`} />

        <ToolbarDivider />

        <ToolbarButton className="whitespace-nowrap px-4" onClick={handleLibraryClick} text={"Library"} icon={faBook} />

        <ToolbarDivider />

        <StepperControls />

        <ToolbarDivider />

        <ViewportControls />
    </div>;
};

const ToolbarButton: React.FC<{
    className?: string,
    icon?: IconProp,
    text?: string,
    disabled?: boolean;
    notImpl?: boolean;
    tip?: React.ReactNode,
    children?: React.ReactNode,
    onClick?: (ev: IBaseEvent) => void,
}> = ({ className, icon, text, disabled, notImpl, tip, children, onClick }) => {

    let btn = <button
        className={clsx(className, 'group self-stretch min-w-[3rem] flex items-center justify-center disabled:opacity-40 rounded-md my-1', !disabled && "hover:bg-blue-300 active:bg-blue-400", notImpl && "bg-red-100")}
        disabled={disabled}
        onClick={onClick}
    >
        {text}
        {icon && <FontAwesomeIcon icon={icon} className={clsx('text-gray-600 disabled:text-gray-300', text && 'ml-3')} />}
        {children}
    </button>;

    return tip ? <Tooltip tip={tip}>{btn}</Tooltip> : btn;
};


const ToolbarDivider: React.FC<{ className?: string }> = ({ className }) => {
    return <div className={clsx(className, 'w-[1px] bg-slate-300 my-1 mx-2')} />;
};

const ToolbarNameEditor: React.FC<{
    value: string,
    setValue: (ev: IBaseEvent, value: string, end: boolean) => void,
}> = ({ value, setValue }) => {
    let [editingName, setEditingName] = useState<string | null>(null);

    let isEditingName = isNotNil(editingName);
    let [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

    useEffect(() => {
        if (inputEl) {
            inputEl.focus();
            inputEl.select();
        }
    }, [inputEl]);

    function applyEditName(ev: IBaseEvent) {
        setValue(ev, editingName!, true);
        setEditingName(null);
    }

    function cancelEditName(ev: IBaseEvent) {
        setValue(ev, value, true);
        setEditingName(null);
    }

    useGlobalKeyboard(KeyboardOrder.Modal, ev => {
        if (isEditingName) {
            if (isKeyWithModifiers(ev, 'Enter')) {
                applyEditName(ev);
                ev.stopPropagation();
                ev.preventDefault();
            } else if (isKeyWithModifiers(ev, 'Escape')) {
                cancelEditName(ev);
                ev.stopPropagation();
                ev.preventDefault();
            }
        }
    });

    return <>
        {!isEditingName && <div className='hover:bg-slate-600 px-1 rounded' onClick={() => setEditingName(value)}>{value}</div>}
        {isEditingName && <>
            <input ref={setInputEl} type='text' className='bg-slate-600 px-1 mr-1 rounded focus:outline-none focus:border-slate-500 w-[16rem] max-w-[20rem] flex-shrink' value={editingName || ''} onChange={ev => setEditingName(ev.target.value)} />
            <button className={"px-1 mx-1 hover:text-slate-200"} onClick={applyEditName}>
                <FontAwesomeIcon icon={faCheck} />
            </button>
            <button className={"px-1 mx-1 hover:text-slate-200"} onClick={cancelEditName}>
                <FontAwesomeIcon icon={faTimes} />
            </button>
        </>}
    </>;
};


export const StepperControls: React.FC<{

}> = () => {
    let { editorState, setEditorState, exeModel } = useEditorContext();

    useGlobalKeyboard(KeyboardOrder.MainPage, ev => {
        if (isKeyWithModifiers(ev, ' ', Modifiers.None)) {
            step();
        }
        if (isKeyWithModifiers(ev, 'Backspace', Modifiers.None)) {
            resetSoft();
        }
    });

    function resetHard() {
        resetExeModel(exeModel, { hardReset: true });
        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    function resetSoft() {
        resetExeModel(exeModel, { hardReset: false });
        stepExecutionCombinatorial(exeModel);
        setEditorState(a => ({ ...a }));
    }

    function step() {
        if (!exeModel.runArgs.halt) {
            stepExecutionLatch(exeModel);
        }

        if (!exeModel.runArgs.halt) {
            stepExecutionCombinatorial(exeModel);
        }

        setEditorState(a => ({ ...a }));
    }

    function forwardSlow() {

    }

    function forwardMed() {

    }

    function forwardFast() {

    }

    let halted = exeModel.runArgs.halt;

    return <>
        <ToolbarButton icon={faPowerOff} disabled={false} onClick={resetHard} tip={"Hard reset: clear all memory"} />
        <ToolbarButton icon={faClockRotateLeft} disabled={false} onClick={resetSoft} tip={`Soft reset: clear RAM & registers (${modifiersToString('Backspace')})`} />
        <ToolbarButton icon={faChevronRight} disabled={halted} onClick={step} className='px-4' text={'Step'} tip={`Take single step (${modifiersToString('Space')})`} />
        <ToolbarButton icon={faPlay} disabled={halted} onClick={forwardSlow} notImpl tip={"Step slowly: 1 Hz"} />
        <ToolbarButton icon={faForward} disabled={halted} onClick={forwardMed} notImpl tip={"Step medium: 60 Hz"} />
        <ToolbarButton icon={faForwardFast} disabled={halted} onClick={forwardFast} notImpl tip={"Step fast as possible"} />
    </>;
};

const ViewportControls: React.FC<{

}> = () => {
    let { editorState, setEditorState, exeModel } = useEditorContext();

    function handleExpand() {
        setEditorState(a => assignImm(a, { needsZoomExtent: true }));
    }

    return <>
        <ToolbarButton icon={faExpand} disabled={false} onClick={handleExpand} tip={"Zoom Extent"} />
    </>;
};
