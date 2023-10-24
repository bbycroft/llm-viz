import * as React from 'react';

export default function Layout({ children } : { children: React.ReactNode }) {
    return <>
        {children}
        <div id="portal-container" />
    </>;
}
