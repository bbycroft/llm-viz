import React, { useReducer, useState } from 'react';
import s from './PhaseTimeline.module.scss';
import { useProgramState } from './Sidebar';
import { clamp } from '@/src/utils/data';
import { useCombinedMouseTouchDrag } from '@/src/utils/pointer';
import { eventEndTime, ITimeInfo } from './walkthrough/WalkthroughTools';

export const PhaseTimeline: React.FC = () => {
    let progState = useProgramState();
    let walkthrough = progState.walkthrough;
    let [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null);
    let [caretHitEl, setCaretHitEl] = useState<HTMLDivElement | null>(null);
    let [, refresh] = useReducer((a: any) => a + 1, 0);

    let camera = progState.camera;
    let totalTime = walkthrough.phaseLength;

    let toFract = (v: number) => clamp(v / totalTime, 0, 1);

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag<number>(caretHitEl, () => walkthrough.time, function handleMove(ev, ds) {
        let dy = ev.clientY - ds.clientY;
        let len = baseEl!.clientHeight;
        walkthrough.time = clamp(ds.data + dy / len * totalTime, 0, totalTime);
        walkthrough.running = false;
        ev.preventDefault();
        ev.stopPropagation();
        walkthrough.markDirty();
        refresh();
    });

    return <div className={s.timelineBase} ref={setBaseEl}>
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
        <div ref={setCaretHitEl} className={s.timelineCaretHit} style={{ top: `${toFract(walkthrough.time) * 100}%` }} onMouseDown={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setDragStart(ev);
        }}/>
    </div>;
}


export const PhaseTimelineHoriz: React.FC<{ times: ITimeInfo[] }> = ({ times }) => {
    let progState = useProgramState();
    let wt = progState.walkthrough;
    let [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null);
    let [caretHitEl, setCaretHitEl] = useState<HTMLDivElement | null>(null);
    let [, refresh] = useReducer((a: any) => a + 1, 0);

    let timeOffset = times[0].start;
    let totalTime = eventEndTime(times[times.length - 1]) - times[0].start;

    let inZone = wt.time >= timeOffset && wt.time <= timeOffset + totalTime;

    let toFract = (v: number) => clamp((v - timeOffset) / totalTime, 0, 1);

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag<number>(caretHitEl, () => wt.time, function handleMove(ev, ds) {
        let dx = ev.clientX - ds.clientX;
        let len = baseEl!.clientWidth;
        wt.time = clamp(ds.data + dx / len * totalTime, timeOffset, timeOffset + totalTime);
        wt.running = false;
        ev.preventDefault();
        ev.stopPropagation();
        wt.markDirty();
        refresh();
    });

    let [, setBaseDragStart] = useCombinedMouseTouchDrag<number>(baseEl, () => wt.time, function handleMove(ev, ds) {
        let len = baseEl!.clientWidth;
        let xPos = ev.clientX - baseEl!.getBoundingClientRect().left;
        wt.time = clamp(timeOffset + xPos / len * totalTime, timeOffset, timeOffset + totalTime);
        wt.running = false;
        ev.preventDefault();
        ev.stopPropagation();
        wt.markDirty();
        refresh();
    });

    return <div className={s.timelineBaseHoriz} ref={setBaseEl} onMouseDown={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setBaseDragStart(ev);
    }}>
        <div className={s.timelineLineHoriz} />
        {times.map((t, i) => {
            return <div
                key={i}
                className={s.timelineEvtHoriz}
                style={{ left: `${toFract(t.start) * 100}%`, width: `${toFract(t.duration) * 100}%` }}>
                <div className={s.timelineEvtStartHoriz} />
                <div className={s.timelineEvtEndHoriz} />
            </div>;
        })}
        {inZone && <>
            <div className={s.timelineCaretHoriz} style={{ left: `${toFract(wt.time) * 100}%` }} />
            <div className={s.timelineCaretHitHoriz} ref={setCaretHitEl} style={{ left: `${toFract(wt.time) * 100}%` }} onMouseDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setDragStart(ev);
            }}/>
        </>}
    </div>;
}
