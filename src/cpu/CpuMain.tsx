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
    let [editorState, setEditorState] = useState<IEditorState>(() => createCpuEditorState());
    let [name, setName] = useState('1 Bit Adder');

    let editorContext: IEditorContext = useMemo(() => ({
        editorState,
        exeModel: null!,
        setEditorState,
    }), [editorState]);

    return <EditorContext.Provider value={editorContext}>
        <Header title={""}>
            <button className='flex px-2 text-2xl'>
                <FontAwesomeIcon icon={faBars} />
            </button>
            <div className='text-2xl mx-2'>CPU Simulation</div>
            <div className='relative ml-3 top-[1px] flex'>
                {/* <ToolbarNameEditor value={name} setValue={(ev, value, end) => {
                    if (end) {
                        setName(value);
                    }
                }} /> */}
            </div>
            <div className='ml-3 w-3 h-3 bg-white rounded-[1rem]'>
            </div>
        </Header>
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
