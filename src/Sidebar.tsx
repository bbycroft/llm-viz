import s from './Sidebar.module.scss';
import { assignImm, useSubscriptions } from './utils/data';
import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import clsx from 'clsx';
import { IPhaseDef } from './walkthrough/WalkthroughTools';
import { PhaseTimeline } from './PhaseTimeline';
import { Commentary } from './Commentary';
import { IProgramState } from './Program';
import { createPortal } from 'react-dom';

export const WalkthroughSidebar: React.FC = () => {
    let progState = useProgramState();
    let walkthrough = progState.walkthrough;
    let camera = progState.camera;
    let [menuVisible, setMenuVisible] = useState(false);
    let [menuButtonEl, setMenuButtonEl] = useState<HTMLElement | null>(null);

    function handlePhaseClick(ev: React.MouseEvent, phase: IPhaseDef) {
        if (walkthrough.phase !== phase.id) {
            walkthrough.phase = phase.id;
            walkthrough.time = 0;
            walkthrough.lastBreakTime = null;
            walkthrough.running = false;
            progState.markDirty();
        }
        setMenuVisible(false);
        ev.preventDefault();
    }

    let menu = <>
        <div className={s.topSplit}>
            <div className={s.toc}>
                {walkthrough.phaseList.map((group, i) => {

                    return <div key={group.groupId} className={s.phaseGroup}>
                        <div className={s.phaseGroupTitle}>{group.title}</div>

                        {group.phases.map((phase, j) => {
                            let active = walkthrough.phase === phase.id;

                            return <div key={phase.id} className={clsx(s.phase, active && s.active)} onClick={ev => handlePhaseClick(ev, phase)}>
                                <div className={s.phaseTitle}>{phase.title}</div>
                            </div>;
                        })}
                    </div>;
                })}
            </div>
            <div className={s.helpers}>
                <div className={s.camStats}>
                    (center, center) = 
                </div>
                <div className={s.camStats}>
                    new {camera.center.toString(1)}, new {camera.angle.toString(1)}
                </div>
            </div>
        </div>
    </>;

    return <div className={s.walkthrough}>
        <div className={s.split}>

            <div className={s.timelineLeft}>
                <PhaseTimeline />
            </div>

            <div className={s.content}>
                <div className={s.menu} ref={setMenuButtonEl} onClick={() => setMenuVisible(a => !a)}>Menu &gt;</div>
                {menuVisible && <Popup targetEl={menuButtonEl} placement={PopupPos.BottomLeft} className={s.mainMenu} closeBackdrop onClose={() => setMenuVisible(false)}>
                    {menu}
                </Popup>}
                <Commentary />
            </div>

        </div>
    </div>;
};

export let ProgramStateContext = createContext<IProgramState>(null!);

export function useProgramState() {
    let context = useContext(ProgramStateContext);
    useSubscriptions(context.htmlSubs);
    return context;
}

export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return createPortal(children, document.body);
};

export enum PopupPos {
    BottomLeft, // we position the popup below the target, and left-align it
}

export const Popup: React.FC<{
    targetEl: HTMLElement | null,
    placement: PopupPos,
    children?: React.ReactNode,
    className?: string,
    closeBackdrop?: boolean,
    onClose?: () => void,
}> = ({ targetEl, placement, children, className, closeBackdrop, onClose }) => {
    let [popupEl, setPopupEl] = useState<HTMLElement | null>(null);
    let targetBcr = useWatchElementRect(targetEl, true);
    let popupBcr = useWatchElementRect(popupEl); // we don't need position info for the popup (would cause an infinite loop)

    let pos = computeTransform(targetBcr, popupBcr, placement);

    let el = <div ref={setPopupEl} className={clsx(s.popup, className)} style={{
        left: pos.x,
        top: pos.y,
    }}>
        {children}
    </div>;

    function handleClick(ev: React.MouseEvent) {
        // ensure the click was directly on the backdrop & not a child
        if (ev.target === ev.currentTarget) {
            onClose?.();
        }
    }

    return <Portal>
        {closeBackdrop ? <div className={s.popupBackdrop} onClick={handleClick}>{el}</div> : el}
    </Portal>;
};

function computeTransform(targetBcr: DOMRect | null, popupBcr: DOMRect | null, placement: PopupPos) {
    if (!targetBcr || !popupBcr) {
        return { x: 0, y: 0 };
    }

    let x = 0;
    let y = 0;

    switch (placement) {
        case PopupPos.BottomLeft:
            x = targetBcr.x;
            y = targetBcr.bottom;
            break;
    }

    return { x, y };
}

export function useWatchElementRect(el: HTMLElement | null, includePosition = false) {
    let [bcr, setBcr] = useState<DOMRect | null>(null);

    useLayoutEffect(() => {
        function handleChange() {
            let bcr = el ? el.getBoundingClientRect() : null;
            setBcr(prev => (el && prev) ? assignImm(prev, {
                x: includePosition ? bcr!.x : 0,
                y: includePosition ? bcr!.y : 0,
                width: bcr!.width,
                height: bcr!.height,
            }) : bcr);
        }

        if (el) {
            let observer = new ResizeObserver(handleChange);
            observer.observe(el);
            handleChange();
            return () => {
                observer.unobserve(el);
                setBcr(null);
            };
        }
    }, [el]);
    return bcr;
}