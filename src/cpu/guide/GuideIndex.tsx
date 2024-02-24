import { Metadata } from "next";

export enum CPUDirectory {
    Index,
    RiscvBasic,
}

export interface IGuideEntry {
    id: CPUDirectory;
    name: string;
    description?: string;
    path: string;
}

export const guideEntries: IGuideEntry[] = [{
    id: CPUDirectory.Index,
    name: 'CPU Simulation',
    description: 'Exploring the inner workings of a CPU, with an interactive visualization.',
    path: '',
}, {
    id: CPUDirectory.RiscvBasic,
    name: 'RISC-V Minimal Computer',
    description: 'Basics of RISC-V CPU model',
    path: '/01-riscv-basic',
}];

export function makeCpuMetadata(dir: CPUDirectory): Metadata {
    let entry = guideEntries.find(x => x.id === dir)!;
    return {
        title: entry.name + ' - CPU Guide',
        description: entry.description,
        keywords: [],
    };
}
