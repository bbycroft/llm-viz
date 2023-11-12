import React from "react";
import { CpuCanvas } from "./CpuCanvas";
import clsx from "clsx";
import { ToolbarTypes } from "./CpuModel";

export const CpuPortal: React.FC<{
    className?: string;
    schematicId: string;
    caption?: string;
    width?: number;
    height?: number;
    children?: React.ReactNode;
}> = ({ className, schematicId, caption, children, width = 60, height = 20 }) => {

    return <div className={clsx('self-center flex flex-col my-2')}>
        <div className={clsx(className, "bg-slate-50 flex flex-col shadow-md")} style={{ minWidth: `${width}rem`, minHeight: `${height}rem` }}>
            <CpuCanvas schematicId={schematicId} readonly embedded toolbars={[ToolbarTypes.PlayPause, ToolbarTypes.Viewport]}>
                {children}
            </CpuCanvas>
        </div>
        <div className='flex flex-col justify-center items-center italic mt-2'>
            {caption}
        </div>
    </div>;
};
