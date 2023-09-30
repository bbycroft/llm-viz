import React from 'react';
import { CPUMain } from '@/src/cpu/CpuMain';
import { Header } from '@/src/homepage/Header';

export const metadata = {
  title: 'CPU Simulation',
  description: 'Exploring the inner workings of a CPU, with an interactive visualization.',
};

export default function Page() {
    return <>
        <CPUMain />
        <div id="portal-container"></div>
    </>;
}
