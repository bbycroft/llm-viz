import React from "react";
import { CpuCanvas } from "./CpuCanvas";
import clsx from "clsx";

export const CpuPortal: React.FC<{
    className?: string;
    schematicId: string;
    caption?: string;
}> = ({ className, schematicId }) => {

    return <div className={clsx(className, 'min-h-[30rem] bg-slate-50 w-[80rem] self-center flex flex-shrink')}>
        <CpuCanvas schematicId={schematicId} readonly />
    </div>;
};
