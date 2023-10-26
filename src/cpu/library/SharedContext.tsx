import React, { createContext, useEffect, useState } from 'react';
import { CompLibrary } from '../comps/CompBuilder';
import { CodeSuiteManager } from './CodeSuiteManager';
import { SchematicLibrary } from '../schematics/SchematicLibrary';
import { buildCompLibrary } from '../comps/builtins';

export interface ISharedContext {
    compLibrary: CompLibrary;
    schematicLibrary: SchematicLibrary;
    codeLibrary: CodeSuiteManager;
}

export const SharedContextContext = createContext<ISharedContext | null>(null);

/// Creates shared context for use across an entire page (used by the various editors within a page)
export function useCreateSharedContext(): ISharedContext {
    let [sharedContext, setSharedContext] = useState(() => createSharedContext(true));

    useEffect(() => {
        setSharedContext(createSharedContext());
    }, []);

    return sharedContext;
}


export function createSharedContext(disableLocalStorageLoad?: boolean): ISharedContext {

    let schematicLibrary = new SchematicLibrary();
    let compLibrary = buildCompLibrary();
    schematicLibrary.populateSchematicLibrary(compLibrary, !disableLocalStorageLoad);
    let codeLibrary = new CodeSuiteManager();

    return {
        compLibrary,
        schematicLibrary,
        codeLibrary,
    };
}
