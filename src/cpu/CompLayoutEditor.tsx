import clsx from 'clsx';
import React, { memo, useLayoutEffect, useMemo, useReducer, useState } from 'react';
import { editLayout, useEditorContext } from './Editor';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCaretRight, faPlus } from '@fortawesome/free-solid-svg-icons';
import { compPortDefId } from './comps/CompPort';
import { pluralize } from '../utils/text';
import { assignImm } from '../utils/data';
import { Vec3 } from '../utils/vector';
import { useResizeChangeHandler } from '../utils/layout';

/*

When we're editing a schematic, we have the option of making a component out of it. We need to choose
the size of the component and the positioning of its ports.

There is a 0,1-1 mapping between ports in the schematic and ports in the component. We may pre-add ports
on the component, and they'll essentially be ignored (value 0). When we add ports on the schematic, we'll
try to fit them on the component somewhere, maybe trying to position them how they're positioned on the
schematic (will need a 'floating' flag).

If there's no where to put them, maybe leave them in an "unattached" state, and the user can manually
resize the component and position them as desired.

The CompLayoutEditor is a side panel for managing the layout of a component. It will have a list of
the ports, as well as a diagram where ports can be dragged around. The component itself can also be
resized (but not moved).

It'll be a hideable drawer thing, and if there's no component for the schematic, we'll show "Create Component (4 ports)"
instead. Clicking that will create a component with 4 ports, and open the drawer.


We'll need to add the info to EditorState, and probably CPULayout so we have undo/redo support.

Might have to change ICpuLayout and split an interface off that goes into the edit tree (undoStack, redoStack, with selection etc).

*/

export const CompLayoutToolbar: React.FC<{
    className?: string;
}> = memo(function CompLayoutToolbar({ className }) {
    let { editorState, setEditorState } = useEditorContext();
    let [isExpanded, setIsExpanded] = useState(false);

    let snapshot = editorState.snapshotTemp ?? editorState.snapshot;

    let hasComponent = snapshot.compSize.x > 0 && snapshot.compSize.y > 0;

    let numPorts = useMemo(() => {
        let numPorts = 0;
        for (let comp of editorState.snapshot.comps) {
            if (comp.defId === compPortDefId) {
                numPorts++;
            }
        }

        return numPorts;
    }, [editorState.snapshot]);

    function onCreateEditClicked(ev: React.MouseEvent) {
        setIsExpanded(a => !a);
        if (!hasComponent) {
            setEditorState(editLayout(true, (snap, state) => {
                return assignImm(snap, {
                    compSize: new Vec3(4, 4),
                });
            }));
        }

        ev.preventDefault();
        ev.stopPropagation();
    }

    return <div className={clsx("flex flex-col bg-white shadow-md border m-6 rounded items-stretch overflow-hidden", className)}>
        <div className='flex flex-row h-10'>
            <div className="p-3 hover:bg-blue-300 cursor-pointer flex-1 flex justify-end items-center" onClick={onCreateEditClicked}>
                {!hasComponent && <>Create Component ({numPorts} {pluralize('port', numPorts)})
                    <FontAwesomeIcon icon={faPlus} className="ml-2" />
                </>}
                {hasComponent && <>
                    Edit Component ({numPorts} {pluralize('port', numPorts)})
                    <FontAwesomeIcon icon={faCaretRight} className="ml-3 transition-transform" rotation={isExpanded ? 90 : undefined} />
                </>}
            </div>
        </div>
        {isExpanded && <CompLayoutEditor />}
    </div>;
});

export const CompLayoutEditor: React.FC<{

}> = memo(function CompLayoutEditor({ }) {
    let { editorState, setEditorState } = useEditorContext();
    let [canvaEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    let [, redraw] = useReducer(a => a + 1, 0);
    useResizeChangeHandler(canvaEl?.parentElement, (bcr) => {
        redraw();
    });

    useLayoutEffect(() => {
        if (!canvaEl) {
            return;
        }

        let ctx = canvaEl.getContext('2d')!;

        let pr = window.devicePixelRatio;
        let desiredWidth = Math.floor(canvaEl.parentElement!.clientWidth * pr);
        let desiredHeight = Math.floor(canvaEl.parentElement!.clientHeight * pr);

        if (canvaEl.width !== desiredWidth || canvaEl.height !== desiredHeight) {
            canvaEl.width = desiredWidth;
            canvaEl.height = desiredHeight;
        }

        let w = canvaEl.width / pr;
        let h = canvaEl.height / pr;

        ctx.save();
        ctx.clearRect(0, 0, canvaEl.width, canvaEl.height);
        ctx.scale(pr, pr);

        ctx.fillStyle = 'rgba(255,0,0,0.1)';
        let pad = 4;
        ctx.fillRect(pad, pad, w - 2 * pad, h - 2 * pad);

        ctx.fillStyle = 'black';
        ctx.font = '20px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('my item goes here', 10, 10);

        ctx.restore();

    });

    return <div className='h-[30rem] w-[20rem] bg-white flex flex-col'>

        <div className='bg-gray-100 flex-1 border-y relative'>
            <canvas className='absolute w-full h-full' ref={setCanvasEl} />
        </div>
        <div className='h-[12rem]'>
        </div>

    </div>;
});
