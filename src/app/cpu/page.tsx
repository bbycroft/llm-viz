import React from 'react';
import { CPUMain } from '@/src/cpu/CpuMain';
import { Header } from '@/src/homepage/Header';

export const metadata = {
  title: 'CPU Simulation',
  description: 'Exploring CPU Simulation & Display',
};

export default function Page() {
    return <>
        <Header title={"CPU Simulation"} />
        <CPUMain />
        <div id="portal-container"></div>
    </>;
}
