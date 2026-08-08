import React from 'react';
import { FluidSimView } from '@/src/fluidsim/FluidSimView';
import Link from 'next/link';
import { requireFeature } from '@/src/config/requireFeature';

export const metadata = {
  title: 'Fluid Simulation',
  description: 'Exploring fluid simulation in WebGPU',
};

import s from './page.module.scss';

export default function Page() {
    requireFeature('fluidSim');

    return <>
        <div className={s.header}>
            <div className={s.back}>
                <Link href={"/"}>&lt; Back</Link>
            </div>
            Fluid Simulation
            <div></div>
        </div>
        <FluidSimView />
    </>;
}
