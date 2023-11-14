import React, { useEffect, useRef, useState } from 'react';
import { faBook, faCheck, faChevronRight, faClockRotateLeft, faCodeFork, faExpand, faFileArrowDown, faFloppyDisk, faForward, faForwardFast, faForwardStep, faPause, faPlay, faPowerOff, faRedo, faRotateLeft, faSortNumericUp, faTimes, faUndo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { assignImm, isNotNil } from '../../utils/data';
import { useGlobalKeyboard, KeyboardOrder, isKeyWithModifiers, Modifiers } from '../../utils/keyboard';
import { IBaseEvent } from '../../utils/pointer';
import { editMainSchematic, editSnapshot, redoAction, undoAction, useEditorContext } from '../Editor';
import clsx from 'clsx';
import { Tooltip } from '../../utils/Tooltip';
import { resetExeModel, stepExecutionCombinatorial, stepExecutionLatch } from '../CpuExecution';
import { modifiersToString } from '../Keymap';
import { ComponentAdder } from '../ComponentAdder';
import { ToolbarButton, ToolbarDivider } from './ToolbarBasics';
import { useInterval, useRequestAnimationFrame } from '@/src/utils/hooks';
import { ToolbarTypes } from '../CpuModel';

export const MainToolbar: React.FC<{
    readonly?: boolean,
    toolbars?: ToolbarTypes[],
}> = ({ readonly, toolbars }) => {
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

    function saveToFile() {
        if (editorState.activeSchematicId) {
            editorState.schematicLibrary.saveToFile(editorState.activeSchematicId, editorState.snapshot);
        }
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

    function handleNameChange(ev: IBaseEvent, value: string, end: boolean) {
        setEditorState(editMainSchematic(end, a => assignImm(a, { name: value })));
    }

    let undoAvailable = editorState.undoStack.length > 0;
    let redoAvailable = editorState.redoStack.length > 0;

    if (readonly) {
        return <div className='top-1 left-1 h-12 bg-white drop-shadow-md flex'>
            {toolbars?.includes(ToolbarTypes.PlayPause) && <>
                <StepperControls />
                <ToolbarDivider />
            </>}
            {toolbars?.includes(ToolbarTypes.Viewport) && <>
                <ViewportControls />

            </>}
        </div>;
    }

    return <div className='h-12 bg-white drop-shadow-md flex'>
        <ToolbarButton icon={faFloppyDisk} onClick={save} tip={`Save (${modifiersToString('S', Modifiers.CtrlOrCmd)})`} />
        <ToolbarButton icon={faCodeFork} onClick={saveAs} notImpl tip={`Duplicate (${modifiersToString('S', Modifiers.CtrlOrCmd | Modifiers.Shift)})`} />
        <ToolbarButton icon={faFileArrowDown} onClick={saveToFile} tip={`Save To File`} />

        <ToolbarDivider />

        <ToolbarButton icon={faUndo} disabled={!undoAvailable} onClick={undo} tip={`Undo (${modifiersToString('Z', Modifiers.CtrlOrCmd)})`} />
        <ToolbarButton icon={faRedo} disabled={!redoAvailable} onClick={redo} tip={`Redo (${modifiersToString('Y', Modifiers.CtrlOrCmd)}, ${modifiersToString('Z', Modifiers.CtrlOrCmd | Modifiers.Shift)})`} />

        <ToolbarDivider />

        <ToolbarButton className="whitespace-nowrap px-4" onClick={handleLibraryClick} text={"Library"} icon={faBook} />

        <ToolbarDivider />

        <StepperControls />

        <ToolbarDivider />

        <ViewportControls />

        <ToolbarDivider />

        <ComponentAdder />

        <ToolbarDivider />

        <div className='min-w-[200px] h-full flex items-center'>
            <div className='mr-2'>Name:</div>
            <ToolbarNameEditor value={editorState.snapshot.mainSchematic.name} setValue={handleNameChange} />
        </div>
    </div>;
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

    function handleKeyDown(ev: React.KeyboardEvent) {
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
        ev.stopPropagation();
    }

    return <>
        {!isEditingName && <div className='hover:bg-slate-300 bg-slate-100 my-1 px-2 py-1 rounded flex-1' onClick={() => setEditingName(value)}>{value}</div>}
        {isEditingName && <>
            <input
                ref={setInputEl}
                type='text'
                className='bg-slate-300 px-2 py-1 mr-1 my-1 rounded focus:outline-none focus:border-slate-500 w-[16rem] max-w-[20rem] flex-shrink'
                value={editingName || ''}
                onChange={ev => setEditingName(ev.target.value)}
                onKeyDown={handleKeyDown}
                onKeyUp={ev => ev.stopPropagation()}
            />
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

    let isPlaying = isNotNil(editorState.stepSpeed);
    let intervalEnabled = isPlaying && editorState.stepSpeed! < 60;
    let interval = isNotNil(editorState.stepSpeed) ? 1000 / editorState.stepSpeed : 0;
    let animFrameEnabled = isPlaying && !intervalEnabled;

    function stepOrStop() {
        if (exeModel.runArgs.halt) {
            setEditorState(a => assignImm(a, { stepSpeed: undefined }));
            return false;
        }

        if (!exeModel.runArgs.halt) {
            stepExecutionLatch(exeModel);
        }

        stepExecutionCombinatorial(exeModel);

        setEditorState(a => ({ ...a }));

        return !exeModel.runArgs.halt;
    }


    useInterval(intervalEnabled, interval, () => {
        stepOrStop();
    }, { runImmediately: true });

    let iterAcc = useRef(0);

    if (!animFrameEnabled) {
        iterAcc.current = 0;
    }

    useRequestAnimationFrame(animFrameEnabled, dt => {
        let perfStart = performance.now();
        let numIterationsFloat = editorState.stepSpeed! * dt / 1;
        let maxTime = 16;
        iterAcc.current += numIterationsFloat;
        let itersToRun = Math.floor(iterAcc.current);
        for (let i = 0; i < itersToRun; i++) {
            let running = stepOrStop();
            if (!running || performance.now() > perfStart + maxTime) {
                iterAcc.current = 0;
                break;
            }
            iterAcc.current -= 1;
        }
    });

    function forwardSlow() {
        setEditorState(a => assignImm(a, { stepSpeed: 1.0 }));
    }

    function forwardMed() {
        setEditorState(a => assignImm(a, { stepSpeed: 20.0 }));
    }

    function forwardFast() {
        setEditorState(a => assignImm(a, { stepSpeed: 100000.0 }));
    }

    function stop() {
        setEditorState(a => assignImm(a, { stepSpeed: undefined }));
    }

    let halted = exeModel.runArgs.halt && !isPlaying;

    return <>
        <ToolbarButton icon={faPowerOff} disabled={false} onClick={resetHard} tip={"Hard reset: clear all memory"} />
        <ToolbarButton icon={faClockRotateLeft} disabled={false} onClick={resetSoft} tip={`Soft reset: clear RAM & registers (${modifiersToString('Backspace')})`} />
        <ToolbarButton icon={faChevronRight} disabled={halted} onClick={step} className='px-4' text={'Step'} tip={`Take single step (${modifiersToString('Space')})`} />
        <ToolbarButton icon={isPlaying ? faPause : faPlay} disabled={halted} onClick={isPlaying ? stop : forwardSlow} tip={"Step slowly: 1 Hz"} />
        <ToolbarButton icon={faForward} disabled={halted} onClick={forwardMed} tip={"Step medium: 20 Hz"} />
        <ToolbarButton icon={faForwardFast} disabled={halted} onClick={forwardFast} tip={"Step fast as possible"} />
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
