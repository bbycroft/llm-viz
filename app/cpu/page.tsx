import React from 'react';
import { CPUMain } from '@/src/cpu/CpuMain';
import Link from 'next/link';

export const metadata = {
  title: 'CPU Simulation',
  description: 'Exploring CPU Simulation & Display',
};

import s from './page.module.scss';

export default function Page() {

    return <>
        <div className={s.header}>
            <div className={s.back}>
                <Link href={"/"}>&lt; Back</Link>
            </div>
            CPU Simulation
            <div></div>
        </div>
        <CPUMain />
    </>;
}
