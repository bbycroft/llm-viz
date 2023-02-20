'use client';

import React, { useEffect } from 'react';
import s from './LayerView.module.css';
import { runLayer } from './SimpleLayer';

export function LayerView({

}: {

}) {

    useEffect(() => {
        runLayer();
    }, []);

    return <div className={s.view}>
        <div>This is the layer view</div>
    </div>;
}
