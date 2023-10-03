import React from "react";
import { CpuCanvas } from "./CpuCanvas";
import clsx from "clsx";

export const CpuPortal: React.FC<{
    className?: string;
}> = ({ className }) => {

    return <div className={clsx(className)}>

        <CpuCanvas />

    </div>;
};
