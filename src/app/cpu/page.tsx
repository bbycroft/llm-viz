import React from 'react';
import { CPUMain } from '@/src/cpu/CpuMain';
import { requireFeature } from '@/src/config/requireFeature';

export const metadata = {
  title: 'CPU Simulation',
  description: 'Exploring the inner workings of a CPU, with an interactive visualization.',
};

export default function Page() {
    requireFeature('cpu');

    return <>
        <CPUMain />
        <div id="portal-container"></div>
    </>;
}
