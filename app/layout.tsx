import React from 'react';
import s from './layout.module.css';
import '@/styles/main.css';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <html lang={"en-US"} className={s.html}>
        <head>
            <title>LLM Visualization</title>
            <link rel="preload" href="/fonts/font-atlas.png" as="image" />
            <link rel="preload" href="/fonts/Roboto-Regular.json" as="fetch" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto" />
        </head>
        <body className={s.body}>
            <div className={s.header}>LLM Visualization</div>
            {children}
        </body>
    </html>;
}
