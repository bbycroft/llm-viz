'use client';
import React, { useMemo } from 'react';
import { CPUDirectory, guideEntries } from './GuideIndex';
import { Header } from '@/src/homepage/Header';
import { NavSidebar } from './NavSidebar';
import { useCreateGlobalKeyboardDocumentListener } from '@/src/utils/keyboard';
import './guideStyle.css';
import { SharedContextContext, useCreateSharedContext } from '../library/SharedContext';

export const CpuEnabledGuide: React.FC<{
    dir: CPUDirectory;
    children?: React.ReactNode;
}> = ({ dir, children }) => {
    useCreateGlobalKeyboardDocumentListener();
    let sharedContext = useCreateSharedContext();

    let entry = useMemo(() => guideEntries.find(x => x.id === dir)!, [dir]);

    return <main className='flex flex-col min-h-screen'>
        <Header title={entry.name} />
        <div className='flex flex-grow items-start'>
            <NavSidebar className='w-3/12 bg-slate-100 min-h-full' activeEntry={dir} />
            <div className='guide-style w-9/12 flex flex-col py-2 mb-[10rem]'>
                <SharedContextContext.Provider value={sharedContext}>
                    {children}
                </SharedContextContext.Provider>
            </div>
            <div className='w-3/12 bg-slate-100 min-h-full'>
                &nbsp;
            </div>
        </div>
    </main>;
};

export const GuideSection: React.FC<{
    title?: React.ReactNode;
    children?: React.ReactNode;
}> = ({ title, children }) => {

    return <section className='px-4 flex flex-col'>
        {title && <h2 className='text-xl font-bold mb-2 mt-4'>{title}</h2>}
        {children}
    </section>;
};

export const Para: React.FC<{
    children?: React.ReactNode;
}> = ({ children }) => {
    return <div className='my-2'>{children}</div>;
};

export const Ins: React.FC<{
    children?: React.ReactNode;
}> = ({ children }) => {
    return <code>{children}</code>;
};
