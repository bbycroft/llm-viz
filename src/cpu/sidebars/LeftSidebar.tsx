import clsx from "clsx";
import React, { memo, useState } from "react";
import { ButtonStandard } from "./EditorControls";
import { SchematicLibraryView } from "./SchematicLibraryView";
import { CompLibraryView } from "./CompLibraryView";
import { CodeLibraryView } from "./CodeLibraryView";
import { useBindLocalStorageState } from "@/src/utils/localstorage";
import { assignImm } from "@/src/utils/data";

enum LeftSidebarView {
    Schematics,
    Comps,
    Code,
}

interface ICpuViewLs {
    leftSideBar: LeftSidebarView;
}

export const LeftSidebar: React.FC = memo(function LeftSidebar({  }) {

    let [activeView, setActiveView] = useState(LeftSidebarView.Schematics);

    useBindLocalStorageState<ICpuViewLs, LeftSidebarView>('cpu-editor-view', activeView,
        v => setActiveView(v.leftSideBar ?? LeftSidebarView.Schematics),
        (v, a) => assignImm(v, { leftSideBar: a }),
        { updateOnNotify: false }); // last-one-wins

    function selectorButton(text: string, view: LeftSidebarView, icon?: React.ReactNode) {
        let isActive = activeView === view;
        return <ButtonStandard className={clsx('mx-1', isActive && 'bg-slate-300')} onClick={() => setActiveView(view)}>{text}</ButtonStandard>;
    }

    return <div className="flex flex-col bg-white flex-1 overflow-hidden">
        <div className="flex flex-row border-y py-2 px-2 justify-center">
            {selectorButton('Schematics', LeftSidebarView.Schematics)}
            {selectorButton('Comps', LeftSidebarView.Comps)}
            {selectorButton('Code', LeftSidebarView.Code)}
        </div>
            {activeView === LeftSidebarView.Schematics && <SchematicLibraryView />}
            {activeView === LeftSidebarView.Comps && <CompLibraryView />}
            {activeView === LeftSidebarView.Code && <CodeLibraryView />}
    </div>;
});
