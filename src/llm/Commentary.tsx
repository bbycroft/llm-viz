import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import s from './Commentary.module.scss';
import { PhaseTimelineHoriz } from './PhaseTimeline';
import { useProgramState } from './Sidebar';
import { clamp, useRequestAnimationFrame } from '@/src/utils/data';
import { lerp, lerpSmoothstep } from '@/src/utils/math';
import { phaseToGroup, IWalkthrough, Phase } from './walkthrough/Walkthrough';
import { eventEndTime, ICommentary, isCommentary, ITimeInfo } from './walkthrough/WalkthroughTools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faChevronLeft, faChevronRight, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import clsx from 'clsx';
import { TocDiagram } from './components/TocDiagram';
import { BlockText, DimensionText } from './components/CommentaryHelpers';

export function jumpToPhase(wt: IWalkthrough, phaseId: Phase) {
    wt.time = 0;
    wt.phase = phaseId;
    wt.running = false;
    wt.markDirty();
}

export function jumpPhase(wt: IWalkthrough, phaseDelta: number) {
    let group = phaseToGroup(wt);
    let groupIdx = wt.phaseList.indexOf(group);
    let phaseGroupIdx = group.phases.findIndex(p => p.id === wt.phase);
    let newPhaseGroupIdx = phaseGroupIdx + phaseDelta;

    if (newPhaseGroupIdx < 0) {
        if (groupIdx > 0) {
            let newGroup = wt.phaseList[groupIdx - 1];
            wt.phase = newGroup.phases[newGroup.phases.length - 1].id;
        }
    } else if (newPhaseGroupIdx >= group.phases.length) {
        if (groupIdx < wt.phaseList.length - 1) {
            let newGroup = wt.phaseList[groupIdx + 1];
            wt.phase = newGroup.phases[0].id;
        }
    } else {
        wt.phase = group.phases[newPhaseGroupIdx].id;
    }

    console.log(`new phase is ${Phase[wt.phase]}`);

    wt.time = 0;
    wt.running = false;
}

export const Commentary: React.FC = () => {
    let progState = useProgramState();
    let [parasEl, setParasEl] = React.useState<HTMLDivElement | null>(null);
    // let [rangeInfo, setRangeInfo] = React.useState<{ start: number, end: number, width: number }>({ start: 0, end: 0, width: 1 });
    let wt = progState.walkthrough;

    function handleKeyDown(ev: React.KeyboardEvent) {
        if (ev.key === ' ') {
            ev.preventDefault(); // prevent scrolling
        }
    }

    function handleContinueClick() {
        if (wt.time >= wt.phaseLength) {
            jumpPhase(wt, 1);
            wt.time = 0;
        } else {
            wt.running = !wt.running;
        }
        progState.markDirty();
    }

    function handleAdvanceClick() {
        if (wt.time >= wt.phaseLength) {
            jumpPhase(wt, 1);
            wt.time = 0;
        } else {
            wt.running = true;
            let node = nodes.find(n => n.end > wt.time);
            let speed = 15;
            if (node) {
                if (node.end > wt.time) {
                    speed = (node.end - wt.time) * 2;
                }
            }
            wt.speed = speed;
        }
        progState.markDirty();
    }

    function handlePhaseDeltaClick(delta: number) {
        jumpPhase(wt, delta);
        progState.markDirty();
    }

    let numTimes = wt.times.length;

    let { nodes } = useMemo(() => {
        let nodes: INode[] = [];
        let prevIsTime = false;
        for (let c of wt.times) {
            if (isCommentary(c)) {
                nodes.push({ commentary: c, isBreak: false, start: c.start, end: eventEndTime(c) });
                prevIsTime = false;
            } else {
                !prevIsTime && nodes.push({ times: [], isBreak: false, start: c.start, end: c.start });
                let lastNode = nodes[nodes.length - 1];
                lastNode.times!.push(c);
                lastNode.isBreak ||= !!c.isBreak;
                lastNode.end = eventEndTime(c);
                prevIsTime = true;
            }
        }
        return { nodes };
    }, [wt.times]);

    let { prevBreak, nextBreak } = useMemo(() => {
        let prevBreak = -1;
        let nextBreak = -1;
        let lastBreak = -1;
        for (let i = 0; i < nodes.length + 1; i++) {
            let node = nodes[i];
            if (node?.isBreak || i === nodes.length) {
                if (i === nodes.length || node.start >= wt.time) {
                    nextBreak = lastBreak - 1;
                    break;
                }
                prevBreak = lastBreak + 1;
                lastBreak = i;
            }
        }
        return { prevBreak, nextBreak };
    }, [wt.time, nodes]);

    interface IGuideLayout {
        width: number;
        height: number;
        parentHeight: number;
        childRanges: IChildRange[];
    }

    interface IChildRange {
        top: number;
        bottom: number;
        height: number;
        nodeId: number;
        startT: number;
        endT: number;
    }

    let [guideLayout, setGuideLayout] = useState<IGuideLayout>({ width: 0, height: 0, parentHeight: 0, childRanges: [] });

    useLayoutEffect(() => {

        function handleChildren() {
            if (!parasEl?.children) return;

            let parasBcr = parasEl.getBoundingClientRect();

            let ranges: IChildRange[] = [];

            for (let child of parasEl.children) {
                let nid = parseInt(child.getAttribute('data-nid')!);
                let c = nodes[nid];
                if (!c) {
                    continue;
                }
                let cStart = c.commentary?.start ?? c.times![0].start;
                let cEnd = eventEndTime(c.commentary ?? c.times![c.times!.length - 1]);
                let childBcr = child.getBoundingClientRect();

                ranges.push({ top: childBcr.top - parasBcr.top, bottom: childBcr.bottom - parasBcr.top, nodeId: nid, startT: cStart, endT: cEnd, height: childBcr.height });
            }
            // console.log('handling resize event (or first time)', parasBcr.height);
            setGuideLayout({
                width: parasBcr.width - 40,
                height: parasBcr.height,
                parentHeight: parasEl.parentElement!.getBoundingClientRect().height,
                childRanges: ranges,
            });
        }

        if (parasEl) {
            let observer = new ResizeObserver(handleChildren);
            observer.observe(parasEl);
            observer.observe(parasEl.parentElement!);
            return () => {
                observer.disconnect();
            };
        }

    }, [nodes, parasEl, wt.phase, numTimes]);

    interface IRangeInfo {
        start: number;
        end: number;
        width: number;
    }

    let { rangeInfo, currPos } = useMemo(() => {
        let rangeInfo: IRangeInfo = { start: 0, end: 0, width: 1 };
        let currPos = 0;

        for (let range of guideLayout.childRanges) {
            if (range.startT <= wt.time && range.endT >= wt.time) {
                currPos = range.bottom;
                break;
            }
        }

        let startPos = 0;
        let endPos = 0;

        function findChild(nid: number) {
            return guideLayout.childRanges.find(c => c.nodeId === nid);
        }

        if (nodes.length > 0) {
            let child = findChild(Math.max(0, prevBreak))!;
            if (child) {
                startPos = child.top;
            }
        }
        if (nextBreak >= 0) {
            let child = findChild(nextBreak)!;
            if (child) {
                endPos = child.bottom;
            }
        }

        rangeInfo = { start: startPos, end: endPos, width: guideLayout.width };
        return { rangeInfo, currPos };
    }, [wt.time, guideLayout, nodes, prevBreak, nextBreak]);

    let group = phaseToGroup(wt);
    let phase = group?.phases.find(p => p.id === wt.phase)!;

    // fast-scroll to top whenever phase changes (and then we'll scroll down smoothly as below)
    useEffect(() => {
        if (parasEl) {
            parasEl.parentElement!.scrollTop = 0;
        }
    }, [parasEl, wt.phase]);

    let prevPhase = useRef(-1);
    let upToDate = wt.commentary?.commentaryList.length ?? 0 > 0;
    // scroll to current position whenever it changes (rangeInfo.start)
    useEffect(() => {
        if (parasEl) { // && parasEl.parentElement!.getBoundingClientRect().height === guideLayout.parentHeight) {
            let delta = 512; // parasEl.getBoundingClientRect().top - parasEl.parentElement!.getBoundingClientRect().top - 45;

            if (prevPhase.current !== wt.phase) {
                // parasEl.parentElement!.scrollTop = rangeInfo.start + delta;
                prevPhase.current = wt.phase;
            } else if (wt.time > 0) {
                console.log('scrollTo', rangeInfo.start + delta, `(${rangeInfo.start} + ${delta})`, 'where height is', guideLayout.height);
                parasEl.parentElement!.scrollTo({ top: rangeInfo.start + delta, behavior: 'smooth' });
            }
        }
    }, [rangeInfo.start, rangeInfo.end, currPos, parasEl, upToDate, guideLayout.height, guideLayout.parentHeight, wt.phase, wt.time]);

    return <>
        <div className={s.chapterControls}>
            <button className={clsx(s.btn, s.prevNextBtn)} onClick={() => handlePhaseDeltaClick(-1)}>
                <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <div className={s.chapterTitle}>Chapter: {phase.title}</div>
            <button className={clsx(s.btn, s.prevNextBtn)} onClick={() => handlePhaseDeltaClick(1)}>
                <FontAwesomeIcon icon={faChevronRight} />
            </button>
        </div>
        <div className={s.walkthroughViewport}>
            <div className={s.walkthroughText} tabIndex={0} onKeyDownCapture={handleKeyDown}>
                <div className={s.tocBackground}>
                    <TocDiagram activePhase={phase.id} />
                </div>
                <div className={s.divider} />
                <div className={s.walkthroughParas} ref={setParasEl}>
                    {walkthroughToParagraphs(wt, nodes)}
                    <SectionHighlight key={nextBreak} top={rangeInfo.start} height={rangeInfo.end - rangeInfo.start} width={rangeInfo.width} />
                    {!wt.running && <>
                        <div className={s.dividerLine} style={{ top: currPos }} />
                        <SpaceToContinueHint top={currPos} onClick={handleContinueClick} />
                    </>}
                </div>
            </div>
        </div>
        <div className={s.controls}>
            <button className={clsx(s.btn, "flex-[2] bg-blue-300 border border-blue-600 hover:bg-blue-400")} onClick={handleContinueClick}>
                <div>Continue</div>
            </button>
            <button className={clsx(s.btn, "ml-4 min-w-[100px] bg-white border border-blue-600 hover:bg-blue-200")} onClick={handleAdvanceClick}>
                <div>Skip</div>
            </button>
        </div>
    </>;
};

interface INode {
    commentary?: ICommentary;
    times?: ITimeInfo[];
    isBreak: boolean;
    start: number;
    end: number;
}

export function walkthroughToParagraphs(wt: IWalkthrough, nodes: INode[]) {

    function genCommentary(c: ICommentary, t: number) {

        let keyId = 0;
        let paraKeyId = 0;
        let res: React.ReactNode[] = [];
        let paraItems: ReactNode[] = [];

        function pushParagraph() {
            if (paraItems.length) {
                res.push(<p key={keyId++}>{paraItems}</p>);
                paraItems = [];
                paraKeyId = 0;
            }
        }

        for (let i = 0; i < c.strings.length; i++) {

            let strRaw = c.strings[i];
            if (strRaw.trim()) {
                let paras = strRaw.split('\n\n');
                for (let j = 0; j < paras.length; j++) {
                    let strPart = markupSimple(paras[j]);
                    if (j > 0) {
                        pushParagraph();
                    }
                    paraItems.push(<React.Fragment key={paraKeyId++}>{strPart}</React.Fragment>);
                }
            }

            if (i < c.values.length) {
                let val = c.values[i];
                if (val.insertInline) {
                    paraItems.push(<React.Fragment key={paraKeyId++}>{val.insertInline}</React.Fragment>);
                }
                if (val.insert) {
                    pushParagraph();
                    let fnVal = typeof val.insert === 'function' ? val.insert() : val.insert;
                    let el = typeof fnVal === 'string' ? fnVal : React.createElement(fnVal as React.FC, { key: 'i' + i });
                    res.push(el);
                }
                if (val.color) {
                    let color = val.color.toHexColor();
                    let content = markupSimple(val.str);
                    if (val.dim) {
                        paraItems.push(<DimensionText key={paraKeyId++} style={{ color }} dim={val.dim}>{content}</DimensionText>);
                    } else if (val.blk) {
                        paraItems.push(<BlockText key={paraKeyId++} style={{ color }} blk={val.blk}>{content}</BlockText>);
                    } else {
                        paraItems.push(<span key={paraKeyId++} style={{ color }}>{content}</span>);
                    }
                }
            }
        }
        pushParagraph();

        return res;
    }

    return <>
        {nodes.map((n, i) => {
            if (n.commentary) {
                let c = n.commentary;
                let displayFactor = c.duration === 0 ? (wt.time >= c.start ? 1 : 0) : clamp((wt.time - c.start) / c.duration, 0, 1);
                let opacity = lerp(0.6, 1, displayFactor);
                let blur = lerp(0, 0, displayFactor);
                return <div key={i} style={{ opacity, filter: `blur(${blur}px)` }} data-nid={i}>
                    {genCommentary(c, wt.time)}
                </div>;
            } else {
                let times = n.times!;
                let active = wt.time >= times[0].start;
                let inRange = wt.time >= times[0].start && wt.time <= eventEndTime(times[times.length - 1]);
                let opacity = active ? 1 : 0.6;
                let blur = 0; // active ? 0 : 2;
                let showLine = times.length > 1 || !times[0].isBreak;

                function handlePlayPause() {
                    if (wt.running) {
                        wt.running = false;
                        wt.markDirty();
                    } else {
                        wt.running = true;
                        if (!inRange) {
                            wt.time = times[0].start;
                        }
                    }
                    wt.markDirty();
                }

                function handleArrowTo() {
                    if (!inRange) {
                        wt.time = times[0].start;
                        wt.markDirty();
                    }
                }

                return <div key={i} className={s.commentaryBreak} data-nid={i} style={{ opacity, filter: `blur(${blur}px)` }}>
                    {showLine && <>
                        <button className={clsx(s.jump, 'btn')} onClick={handleArrowTo}>
                            <FontAwesomeIcon icon={faArrowDown} />
                        </button>
                        <button className={clsx(s.playPause, 'btn')} onClick={handlePlayPause}>
                            <FontAwesomeIcon icon={wt.running && inRange ? faPause : faPlay} />
                        </button>
                        <PhaseTimelineHoriz times={n.times!} />
                    </>}
                </div>;
            }
        })}
    </>;
}

function markupSimple(inputStr: string): React.ReactNode {
    let italicLocs: number[] = [];
    let boldLocs: number[] = [];

    let prevC = '';
    let idx = 0;
    for (let c of inputStr) {
        if (c === '_' && prevC !== '_') {
            italicLocs.push(idx);
        // } else if (c === '*' && prevC !== '*') {
        //     boldLocs.push(idx);
        }
        idx++;
    }

    let nodesFlat: INode[] = [];
    function addNodes(t: INode['t'], locs: number[]) {
        for (let i = 0; i < Math.ceil(locs.length / 2); i++) {
            nodesFlat.push({ t: t, start: locs[i * 2], end: (locs[i * 2 + 1] ?? inputStr.length) + 1 });
        }
    }

    addNodes('i', italicLocs);
    addNodes('b', boldLocs);

    interface INode {
        t: '' | 'b' | 'i';
        start: number; // inclusive
        end: number; // exclusive
        children?: INode[];
    }

    function insertIntoTree(treeNode: INode, node: INode) {
        // we know node is fully contained within treeNode. But what about treeNode's children?

        // the children are distinct but form a partial cover of the treeNode
        let prevEnd = treeNode.start;
        let currStart = node.start;
        let directNewChildren: INode[] = [];

        for (let c of treeNode.children ?? []) {
            if (currStart < c.start) {
                directNewChildren.push({ ...node, start: currStart, end: c.start });
                prevEnd = currStart;
                currStart = c.start;
            }
            if (currStart < c.end && node.end > c.start) {
                insertIntoTree(c, { ...node, start: Math.max(currStart, c.start), end: Math.min(node.end, c.end) });
                currStart = Math.min(node.end, c.end);
                prevEnd = node.end;
            }
        }
        if (currStart < node.end) {
            directNewChildren.push({ ...node, start: currStart, end: node.end });
        }

        if (directNewChildren.length > 0) {
            treeNode.children = [...treeNode.children ?? [], ...directNewChildren];
            treeNode.children.sort((a, b) => a.start - b.start);
        }
    }

    let treeBase: INode = { t: '', start: 0, end: inputStr.length, children: [] };

    for (let node of nodesFlat) {
        insertIntoTree(treeBase, node);
    }

    function buildReactDom(node: INode, i: number) {
        let pad = node.t === '' ? 0 : 1;
        let res: ReactNode[] = [];
        let children = node.children ?? []
        let segStart = node.start + pad;
        for (let i = 0; i < children.length + 1; i++) {
            let segEnd = i < children.length ? children[i].start : node.end - pad;

            if (segEnd > segStart) {
                res.push(inputStr.slice(segStart, segEnd));
            }

            if (i < children.length) {
                res.push(buildReactDom(children[i], i));
                segStart = children[i].end;
            }
        }

        if (node.t === 'b') {
            return <b key={i}>{res}</b>;
        } else if (node.t === 'i') {
            return <i key={i}>{res}</i>;
        } else {
            return res;
        }
    }

    return buildReactDom(treeBase, 0);
}

const SpaceToContinueHint: React.FC<{
    top: number;
    onClick: React.MouseEventHandler,
}> = ({ top, onClick }) => {

    return <div className={"absolute flex justify-center pointer-events-none top-0 left-0 right-0"} style={{ top, transform: `translateY(20px)` }}>
        <div className={"flex-shrink py-2 px-4 bg-blue-200 shadow-md rounded-3xl pointer-events-auto text-black cursor-pointer"} onClick={onClick}>
             Press <span className={s.key}>Space</span> to continue
        </div>
    </div>;
}

const SectionHighlight: React.FC<{
    top: number;
    height: number;
    width: number;
}> = ({ top, height, width }) => {
    let [tick, setTick] = useState(0);

    useRequestAnimationFrame(tick < 2, (dt) => {
        setTick(tick + dt);
    });

    let rectPad = 12;
    let svgW = width + rectPad * 2;
    let svgH = height + rectPad * 2;

    let pad = 3;
    let x0 = pad;
    let y0 = pad;
    let x1 = svgW - pad;
    let y1 = svgH - pad;

    let strokeWidth = lerpSmoothstep(3, 0, tick);

    if (height <= 0) {
        return null;
    }

    return <div className={s.sectionHighlightWrap} style={{ top: top - rectPad, height: svgH, width: svgW, left: -rectPad }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className={s.sectionHighlight}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="blue" strokeWidth={strokeWidth} opacity={strokeWidth} rx={5} ry={5} />
            {/* <path d={`M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`} fill="none" stroke="blue" strokeWidth="3" /> */}
        </svg>
    </div>;
}
