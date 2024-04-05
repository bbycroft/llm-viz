import React from 'react';
import { CodecMain } from '@/src/codec/CodecMain';
import { Header } from '@/src/homepage/Header';

export const metadata = {
  title: 'Codecs',
  description: 'Exploring Image File Codecs',
};

export default function Page() {

    return <>
        <Header title="Image Codecs">
        </Header>
        <CodecMain />
        <div id="portal-container"></div>
    </>;
}
