import React from 'react';
import { LayerView } from '@/src/llm/LayerView';
import { InfoButton } from '@/src/llm/WelcomePopup';

export const metadata = {
  title: 'LLM Visualization',
  description: 'A 3D animated visualization of an LLM with a walkthrough.',
};

import { Header } from '@/src/homepage/Header';

export default function Page() {
    return <>
        <Header title="LLM Visualization">
            <InfoButton />
        </Header>
        <LayerView />
        <div id="portal-container"></div>
    </>;
}
