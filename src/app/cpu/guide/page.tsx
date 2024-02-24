
import React from 'react';
import { CPUDirectory, guideEntries } from '@/src/cpu/guide/GuideIndex';
import Link from 'next/link';
import { CpuEnabledGuide } from '@/src/cpu/guide/CpuEnabledGuide';
import s from './Page.module.scss';

export const metadata = {
  title: 'CPU Simulation',
  description: 'Exploring the inner workings of a CPU, with an interactive visualization.',
};

export default function Page() {
    return <CpuEnabledGuide dir={CPUDirectory.Index}>

        <div className='mx-4 p-2 border-b-orange-500 mt-4 mb-8 py-2 bg-orange-200 rounded shadow'>
            <div className='font-bold text-3xl text-center'>WIP</div>
            <div className={s.list}>
                <p>This project is currently a work in progress, and right now, only contains a single, incomplete guide.</p>
                <p>For initial release I hope to have guides that cover:</p>
                <ul>
                    <li>Basics of RISC-V CPU model</li>
                    <li>Interrupts and exceptions</li>
                    <li>Simple 1 or 2 stage pipelining</li>
                    <li>A more performant adder (i.e. better than a ripple carry adder)</li>
                    <li>More sophisticated peripherals (e.g. a 2d display)</li>
                </ul>
                <p>Additionally, more features to the editor/simulator are required, such as:</p>
                <ul>
                    <li>Steps on each of the embedded schematics, such as switching between predefined programs, and triggering their operation.
                        Includes zooming into appropriate places, highlighting specific segments etc.</li>
                    <li>Making the controls for embedded schematics more streamlined & useful, including an "expand to ~full screen" button</li>
                    <li>Dashed rectangles with labels in the schematics</li>
                </ul>
            </div>
        </div>

        <h2 className='font-bold text-3xl mx-6'>Table of Contents</h2>

        <GuideSection dir={CPUDirectory.RiscvBasic} header={"CPU Part 1"}>
            <p>Explore how a simple CPU is built with logic gates, based on the RISCV instruction set.</p>
        </GuideSection>

    </CpuEnabledGuide>;
}

const GuideSection: React.FC<{
    dir: CPUDirectory;
    header?: React.ReactNode;
    children?: React.ReactNode;
}> = ({ dir, header, children }) => {
    let entry = guideEntries.find(x => x.id === dir)!;

    return <Link href={'guide' + entry.path}>
        <div className='rounded bg-green-100 mx-4 my-2 shadow hover:shadow-lg overflow-hidden'>
            {header && <div className='border-b-green-200 bg-green-200 p-2'><span className='text-sm bg-green-300 p-2'>{header}</span> <span className='font-bold ml-2'>{entry.name}</span></div>}
            <div className='mx-2 my-2'>
                <p>{entry.description}</p>
                {children}
            </div>
        </div>
    </Link>;
};
