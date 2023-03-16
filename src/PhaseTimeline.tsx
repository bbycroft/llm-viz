import { useReducer, useState } from 'react';
import s from './PhaseTimeline.module.css';
import { useProgramState } from './Sidebar';
import { clamp, useGlobalDrag } from './utils/data';
import { eventEndTime, ITimeInfo } from './walkthrough/WalkthroughTools';

export const PhaseTimeline: React.FC = () => {
    let progState = useProgramState();
    let walkthrough = progState.walkthrough;
    let [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null);
    let [, refresh] = useReducer((a: any) => a + 1, 0);

    let camera = progState.camera;
    let totalTime = walkthrough.phaseLength;

    let toFract = (v: number) => clamp(v / totalTime, 0, 1);

    let [dragStart, setDragStart] = useGlobalDrag<number>(function handleMove(ev, ds) {
        let dy = ev.clientY - ds.clientY;
        let len = baseEl!.clientHeight;
        walkthrough.time = clamp(ds.data + dy / len * totalTime, 0, totalTime);
        walkthrough.running = false;
        walkthrough.lastBreakTime = walkthrough.time;
        ev.preventDefault();
        ev.stopImmediatePropagation();
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
        <div className={s.timelineCaretHit} style={{ top: `${toFract(walkthrough.time) * 100}%` }} onMouseDown={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            setDragStart(ev, walkthrough.time);
        }}/>
    </div>;
}


export const PhaseTimelineHoriz: React.FC<{ times: ITimeInfo[] }> = ({ times }) => {
    let progState = useProgramState();
    let wt = progState.walkthrough;
    let [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null);
    let [, refresh] = useReducer((a: any) => a + 1, 0);

    let timeOffset = times[0].start;
    let totalTime = eventEndTime(times[times.length - 1]) - times[0].start;

    let inZone = wt.time >= timeOffset && wt.time <= timeOffset + totalTime;

    let toFract = (v: number) => clamp((v - timeOffset) / totalTime, 0, 1);

    let [dragStart, setDragStart] = useGlobalDrag<number>(function handleMove(ev, ds) {
        let dx = ev.clientX - ds.clientX;
        let len = baseEl!.clientWidth;
        wt.time = clamp(ds.data + dx / len * totalTime, timeOffset, timeOffset + totalTime);
        wt.running = false;
        wt.lastBreakTime = wt.time;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        wt.markDirty();
        refresh();
    });

    return <div className={s.timelineBaseHoriz} ref={setBaseEl}>
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
            <div className={s.timelineCaretHitHoriz} style={{ left: `${toFract(wt.time) * 100}%` }} onMouseDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setDragStart(ev, wt.time);
            }}/>
        </>}
    </div>;
}