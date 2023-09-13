import clsx from 'clsx';
import React from 'react';

export const BooleanEditor: React.FC<{
    className?: string,
    value: boolean,
    update: (end: boolean, value: boolean) => void,
}> = ({ className, value, update }) => {

    function editValue(ev: React.ChangeEvent<HTMLInputElement>) {
        update(true, ev.target.checked);
    }

    return <label className={clsx("", className)}>
        <input type="checkbox" className={clsx()} checked={value} onChange={editValue} />
    </label>;
}
