'use client';

import React, { Suspense, useEffect } from 'react';
import { useCreateGlobalKeyboardDocumentListener } from '../utils/keyboard';
import { CpuCanvas } from './CpuCanvas';
import s from './CpuMain.module.scss';
import { Header } from '../homepage/Header';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { IProgramState } from './CpuModel';
import { CompLibrary } from './comps/CompBuilder';
import { SchematicLibrary } from './schematics/SchematicLibrary';
import { useEditorContext } from './Editor';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFunctionRef } from '../utils/hooks';
import { SharedContextContext, useCreateSharedContext } from './library/SharedContext';

export const CPUMain = () => {
    useCreateGlobalKeyboardDocumentListener();
    let sharedContext = useCreateSharedContext();
    // let [schematicId, setSchematicId] = useState<string | null>(null);
    // let [editorState, setEditorState] = useState<IEditorState>(() => createCpuEditorState());
    // let [name, setName] = useState('1 Bit Adder');

    // let editorContext: IEditorContext = useMemo(() => ({
    //     editorState,
    //     exeModel: null!,
    //     setEditorState,
    // }), [editorState]);

    return <>
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
            {/* <div className='ml-3 w-3 h-3 bg-white rounded-[1rem]'> */}
            {/* </div> */}
        </Header>
        <div className={s.content}>
            <SharedContextContext.Provider value={sharedContext}>
                <CpuCanvas>
                    <Suspense fallback={<div />}>
                        <QueryUpdater />
                    </Suspense>
                </CpuCanvas>
            </SharedContextContext.Provider>
        </div>
    </>;
};

const QueryUpdater: React.FC<{
}> = () => {
    let router = useRouter();
    let searchParams = useSearchParams();
    let { editorState, setEditorState } = useEditorContext();

    let schematicId = searchParams.get('schematicId');

    function updateUrl(schematicId: string | null) {
        let currQuery = new URLSearchParams(location.search);
        let newQuery = updateQuery(currQuery, { schematicId });
        if (newQuery !== currQuery.toString()) {
            router.replace(location.pathname + '?' + newQuery);
        }
    }
    let updateUrlRef = useFunctionRef(updateUrl);

    useEffect(() => {
        if (editorState.activeSchematicId) {
            updateUrlRef.current(editorState.activeSchematicId);
        }
    }, [editorState.activeSchematicId, updateUrlRef]);

    useEffect(() => {
        setEditorState(a => ({ ...a, desiredSchematicId: schematicId ?? null }));
    }, [schematicId, setEditorState]);

    return null;
};

function updateQuery(searchParams: URLSearchParams, changes: Record<string, string | null>) {
    let params = new URLSearchParams(searchParams.toString());
    for (let [key, value] of Object.entries(changes)) {
        if (value === null) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
    }
    return params.toString();
}

function createCpuProgramState(): IProgramState {
    return {
        activeEditorIdx: 0,
        compLibrary: new CompLibrary(),
        editors: [],
        schematicLibrary: new SchematicLibrary(),
    };
}
