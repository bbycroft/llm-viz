import React from 'react';
import { CodecMain } from '@/src/codec/CodecMain';
import { Header } from '@/src/homepage/Header';
import { requireFeature } from '@/src/config/requireFeature';

export const metadata = {
  title: 'Codecs',
  description: 'Exploring Image File Codecs',
};

export default function Page() {
    requireFeature('codec');

    return <>
        <Header title="Image Codecs">
        </Header>
        <CodecMain />
        <div id="portal-container"></div>
    </>;
}
