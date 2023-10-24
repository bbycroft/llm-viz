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
}> = ({ className, schematicId, caption, width = 60, height = 20 }) => {

    return <div className={clsx('self-center flex flex-col my-2')}>
        <div className={clsx(className, "bg-slate-50 flex flex-col shadow-md")} style={{ minWidth: `${width}rem`, minHeight: `${height}rem` }}>
            <CpuCanvas schematicId={schematicId} readonly toolbars={[ToolbarTypes.PlayPause, ToolbarTypes.Viewport]} />
        </div>
        <div className='flex flex-col justify-center items-center italic mt-2'>
            {caption}
        </div>
    </div>;
};
