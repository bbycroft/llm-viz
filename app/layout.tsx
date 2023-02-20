import React from 'react';
import s from './layout.module.css';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <html className={s.html}>
        <head>
            <title>LLM Visualization</title>
        </head>
        <body className={s.body}>
            <div>LLM Visualization</div>
            <div>{children}</div>
        </body>
    </html>;
}
