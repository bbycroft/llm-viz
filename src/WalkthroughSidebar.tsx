import s from './WalkthroughSidebar.module.css';
import { IPhaseDef, IWalkthrough } from "./walkthrough/Walkthrough";
import { clamp, useGlobalDrag } from './utils/data';
import { useReducer, useState } from 'react';
import clsx from 'clsx';

export const WalkthroughSidebar: React.FC<{
    walkthrough: IWalkthrough;
    counter?: number;
}> = ({ walkthrough, counter }) => {
    let [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null);
    let [, refresh] = useReducer((a: any) => a + 1, 0);

    let totalTime = walkthrough.phaseLength;

    let toFract = (v: number) => clamp(v / totalTime, 0, 1);

    let [dragStart, setDragStart] = useGlobalDrag<number>(function handleMove(ev, ds) {
        let dy = ev.clientY - ds.clientY;
        let len = baseEl!.clientHeight;
        walkthrough.time = clamp(ds.data + dy / len * totalTime, 0, totalTime);
        walkthrough.running = false;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        walkthrough.markDirty();
        refresh();
    });

    function handlePhaseClick(ev: React.MouseEvent, phase: IPhaseDef) {
        if (walkthrough.phase !== phase.id) {
            walkthrough.phase = phase.id;
            walkthrough.time = 0;
            walkthrough.running = false;
            walkthrough.markDirty();
            refresh();
        }
    }

    return <div className={s.walkthrough}>
        <div className={s.title}>Walkthrough</div>
        <div className={s.split}>

            <div className={s.timelineLeft}>
                {/* <div className={s.timelineLeftLabel}>0</div> */}
                <div className={s.timelineBase} ref={setBaseEl}>
                    <div className={s.timelineLine} />
                    {walkthrough.times.map((t, i) => {
                        return <div
                            key={i}
                            className={s.timelineEvt}
                            style={{ top: `${toFract(t.start) * 100}%`, height: `${toFract(t.duration) * 100}%` }}>
                            <div className={s.timelineEvtStart} />
                            <div className={s.timelineEvtEnd} />
                        </div>;
                    })}
                    <div className={s.timelineCaret} style={{ top: `${toFract(walkthrough.time) * 100}%` }} />
                    <div className={s.timelineCaretHit} style={{ top: `${toFract(walkthrough.time) * 100}%` }} onMouseDown={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setDragStart(ev, walkthrough.time);
                    }}/>
                </div>
            </div>

            <div className={s.content}>
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

        </div>
    </div>;
};
