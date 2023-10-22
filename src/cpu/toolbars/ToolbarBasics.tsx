import { Tooltip } from '@/src/utils/Tooltip';
import { IBaseEvent } from '@/src/utils/pointer';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import React from 'react';

export const ToolbarDivider: React.FC<{ className?: string }> = ({ className }) => {
    return <div className={clsx(className, 'w-[1px] bg-slate-300 my-1 mx-2')} />;
};


export const ToolbarButton: React.FC<{
    className?: string,
    icon?: IconProp,
    text?: string,
    disabled?: boolean;
    notImpl?: boolean;
    tip?: React.ReactNode,
    children?: React.ReactNode,
    onClick?: (ev: IBaseEvent) => void,
}> = ({ className, icon, text, disabled, notImpl, tip, children, onClick }) => {

    let btn = <button
        className={clsx(className, 'group self-stretch min-w-[3rem] flex items-center justify-center disabled:opacity-40 rounded-md my-1', !disabled && "hover:bg-blue-300 active:bg-blue-400", notImpl && "bg-red-100")}
        disabled={disabled}
        onClick={onClick}
    >
        {text}
        {icon && <FontAwesomeIcon icon={icon} className={clsx('text-gray-600 disabled:text-gray-300', text && 'ml-3')} />}
        {children}
    </button>;

    return tip ? <Tooltip tip={tip}>{btn}</Tooltip> : btn;
};
