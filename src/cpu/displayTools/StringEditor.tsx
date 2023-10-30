import clsx from 'clsx';
import React from 'react';

export const StringEditor: React.FC<{
    className?: string,
    value: string,
    update: (end: boolean, value: string) => void,
}> = ({ className, value, update }) => {

    function onChange(ev: React.ChangeEvent<HTMLInputElement>) {
        update(false, ev.target.value);
    }

    function onBlur(ev: React.FocusEvent<HTMLInputElement>) {
        update(true, ev.target.value);
    }

    return <label className={clsx("flex flex-row", className)}>
        <input
            type="text"
            className={clsx("hover:outline-none focus:outline-none px-1 rounded h-8 text-lg w-full bg-inherit")}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onKeyDown={ev => ev.stopPropagation()}
            onKeyUp={ev => ev.stopPropagation()}
        />
    </label>;
}
