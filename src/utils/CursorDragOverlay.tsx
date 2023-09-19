import React, { memo } from "react";
import { Portal } from "./Portal";
import clsx from "clsx";

export const CursorDragOverlay: React.FC<{
    className?: string;
}> = memo(function CursorDragOverlay({ className }) {

    return <Portal>
        <div className={clsx("fixed inset-0 z-50 pointer-events-auto", className)} />
    </Portal>;
});
