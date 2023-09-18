import React from 'react';
import { LayerView } from '@/src/llm/LayerView';
import { InfoButton } from '@/src/llm/WelcomePopup';

export const metadata = {
  title: 'LLM Vizualization',
  description: 'This is the LLM visualization page.',
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
