import React from 'react';
import s from './layout.module.scss';
import '@/styles/main.scss';

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <html lang={"en-US"} className={s.html}>
        <head>
            <title>LLM Visualization</title>
            <link rel="preload" href="/fonts/font-atlas.png" as="image" />
            <link rel="preload" href="/fonts/font-def.json" as="fetch" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&family=Merriweather:ital,wght@1,300" />
        </head>
        <body className={s.body}>
            <div className={s.header}>LLM Visualization</div>
            {children}
        </body>
    </html>;
}
