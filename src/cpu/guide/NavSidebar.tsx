import React from "react";
import { CPUDirectory, IGuideEntry, guideEntries } from "./GuideIndex";
import Link from "next/link";
import clsx from "clsx";

export const NavSidebar: React.FC<{
    className?: string;
    activeEntry: CPUDirectory;
}> = ({ className, activeEntry }) => {

    return <div className={clsx("", className)}>
        <div className="py-2 px-2">
            <Link href={'/cpu/guide'}>Guide Home</Link>
        </div>
        <div>
            {guideEntries.map(x => {
                return <IndexEntry key={x.id} entry={x} isActive={x.id === activeEntry} />;
            })}
        </div>
    </div>;
};

const IndexEntry: React.FC<{
    entry: IGuideEntry;
    isActive: boolean;
}> = ({ entry, isActive }) => {

    return <div className={clsx("px-2")}>
        <Link href={'/cpu/guide/' + entry.path}>{entry.name}</Link>
    </div>;
};

