'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardOrder, isKeyWithModifiers, useCreateGlobalKeyboardDocumentListener, useGlobalKeyboard } from '../utils/keyboard';
import { CpuCanvas } from './CpuCanvas';
import s from './CpuMain.module.scss';
import { Header } from '../homepage/Header';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCheck, faRedo, faTimes, faUndo } from '@fortawesome/free-solid-svg-icons';
import { IEditContext, IEditorState, IProgramState } from './CpuModel';
import { CompLibrary } from './comps/CompBuilder';
import { SchematicLibrary } from './schematics/SchematicLibrary';
import { isNotNil } from '../utils/data';
import { createCpuEditorState } from './ModelHelpers';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { IBaseEvent } from '../utils/pointer';
import { EditorContext, IEditorContext } from './Editor';

export const CPUMain = () => {
    useCreateGlobalKeyboardDocumentListener();
    let [progState, setProgState] = useState<IEditorState>(() => createCpuEditorState());
    let [name, setName] = useState('1 Bit Adder');

    let editorState: IEditorContext = useMemo(() => ({
        editorState: progState,
        exeModel: null!,
        setEditorState: setProgState,
    }), [progState]);

    return <EditorContext.Provider value={editorState}>
        <Header title={""}>
            <button className='flex px-2 text-2xl'>
                <FontAwesomeIcon icon={faBars} />
            </button>
            <div className='text-2xl mx-2'>CPU Simulation</div>
            <div className='relative ml-3 top-[1px] flex'>
                <ToolbarNameEditor value={name} setValue={(ev, value, end) => {
                    if (end) {
                        setName(value);
                    }
                }} />
            </div>
            <div className='ml-3 w-3 h-3 bg-white rounded-[1rem]'>
            </div>
        </Header>
        <MainToolbar />
        <div className={s.content}>
            <CpuCanvas />
        </div>
    </EditorContext.Provider>;
};

function createCpuProgramState(): IProgramState {
    return {
        activeEditorIdx: 0,
        compLibrary: new CompLibrary(),
        editors: [],
        schematicLibrary: new SchematicLibrary(),
    };
}

const MainToolbar: React.FC<{

}> = () => {

    return <div className='h-10 bg-white drop-shadow-md flex'>
        <ToolbarButton icon={faUndo} />
        <ToolbarButton icon={faRedo} />
    </div>;

};

const ToolbarButton: React.FC<{
    icon?: IconProp,
    text?: string,
}> = ({ icon, text }) => {


    return <button className='self-stretch min-w-[3rem] flex items-center justify-center hover:bg-blue-400'>
        {icon && <FontAwesomeIcon icon={icon} />}
    </button>;
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
