'use client';
import React, { useEffect } from 'react';
import s from './layout.module.scss';
import '@/styles/main.scss';
import { inject } from '@vercel/analytics';

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    useEffect(() => {
         inject();
    }, []);

    return <html lang="en" className={s.html}>
        <head>
            <title>LLM Visualization</title>
            <link rel="preload" href="/fonts/font-atlas.png" as="image" />
            <link rel="preload" href="/fonts/font-def.json" as="fetch" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&family=Merriweather:ital@0;1" />
        </head>
        <body className={s.body}>
            <div className={s.header}>LLM Visualization</div>
            {children}
        </body>
    </html>;
}
