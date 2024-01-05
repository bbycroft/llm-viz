import React from "react";
import { CpuCanvas } from "./CpuCanvas";
import clsx from "clsx";
import { ToolbarTypes } from "./CpuModel";
import { KeyboardLocalListener } from "../utils/KeyboardLocalListener";

export const CpuPortal: React.FC<{
    className?: string;
    schematicId: string;
    caption?: string;
    width?: number;
    height?: number;
    children?: React.ReactNode;
}> = ({ className, schematicId, caption, children, width = 60, height = 20 }) => {

    return <div className={clsx('self-center flex flex-col my-2')}>
        <KeyboardLocalListener
            className={clsx(className, "bg-slate-50 flex flex-col focus-within:shadow-no-offset focus-within:shadow-blue-300")}
            style={{ minWidth: `${width * 14}px`, minHeight: `${height * 14}px`}}
            tabIndex={0}
        >
            <CpuCanvas schematicId={schematicId} readonly embedded toolbars={[ToolbarTypes.PlayPause, ToolbarTypes.Viewport]}>
                {children}
            </CpuCanvas>
        </KeyboardLocalListener>
        <div className='flex flex-col justify-center items-center italic mt-2'>
            {caption}
        </div>
    </div>;
};
