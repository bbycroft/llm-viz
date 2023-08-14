import React from 'react';
import { LayerView } from '@/src/LayerView';
import { InfoButton } from '@/src/WelcomePopup';
import Link from 'next/link';

export const metadata = {
  title: 'LLM Vizualization',
  description: 'This is the LLM visualization page.',
};

import s from './page.module.scss';

export default function Page() {
    return <>
        <div className={s.header}>
            <InfoButton />
            LLM Visualization
            <div className={s.back}>
                <Link href={"/"}>Homepage</Link>
            </div>
        </div>
        <LayerView />
        <div id="portal-container"></div>
    </>;
}
