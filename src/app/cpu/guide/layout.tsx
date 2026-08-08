import * as React from 'react';
import { requireFeature } from '@/src/config/requireFeature';

export default function Layout({ children } : { children: React.ReactNode }) {
    requireFeature('cpu');

    return <>
        {children}
        <div id="portal-container" />
    </>;
}
