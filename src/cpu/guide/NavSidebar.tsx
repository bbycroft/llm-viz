import React from "react";
import { CPUDirectory, IGuideEntry, guideEntries } from "./GuideIndex";
import Link from "next/link";
import clsx from "clsx";
import { multiSortStableAsc } from "@/src/utils/array";

export const NavSidebar: React.FC<{
    className?: string;
    activeEntry: CPUDirectory;
}> = ({ className, activeEntry }) => {

    // we want to turn the guideEntries into a tree, based on their paths
    let tree = guideEntriesToTree(guideEntries);

    function renderTree(tree: NavTreeEntry, depth: number, idx: number) {
        return <div key={idx} className='pl-2'>
            {tree.entry && <IndexEntry entry={tree.entry} isActive={tree.entry.id === activeEntry} />}
            {tree.children.map((x, i) => renderTree(x, depth + 1, i))}
        </div>;
    }

    return <div className={clsx("", className)}>
        <div>
            {renderTree(tree, 0, 0)}
        </div>
    </div>;
};

function guideEntriesToTree(entries: IGuideEntry[]): NavTreeEntry {
    // should end up with one entry here, just easier to work with an array
    let rootChildren: NavTreeEntry[] = [];

    entries = multiSortStableAsc(entries, [x => x.path.length, x => x.path]);

    for (let entry of entries) {
        let pathParts = entry.path.split('/');
        let pathPrefix = '';
        let treeChildren = rootChildren;
        for (let i = 0; i < pathParts.length; i++) {
            let path = pathParts[i];
            pathPrefix += path;

            let existing = treeChildren.find(x => x.pathPrefix === pathPrefix);
            if (!existing) {
                existing = {
                    pathPrefix,
                    entry: i === pathParts.length - 1 ? entry : null,
                    children: [],
                };

                treeChildren.push(existing);
            }
            treeChildren = existing.children;

            pathPrefix += '/';
        }
    }

    return rootChildren[0];
}

interface NavTreeEntry {
    pathPrefix: string;
    entry: IGuideEntry | null;
    children: NavTreeEntry[];
}

const IndexEntry: React.FC<{
    entry: IGuideEntry;
    isActive: boolean;
}> = ({ entry, isActive }) => {

    return <div className={clsx("px-2", isActive && "bg-slate-300")}>
        <Link href={'/cpu/guide' + entry.path}>{entry.name}</Link>
    </div>;
};

