import React, { ReactNode, useEffect } from 'react';
import s from './Commentary.module.scss';
import { PhaseTimelineHoriz } from './PhaseTimeline';
import { useProgramState } from './Sidebar';
import { clamp } from './utils/data';
import { lerp } from './utils/math';
import { phaseToGroup, IWalkthrough } from './walkthrough/Walkthrough';
import { eventEndTime, ICommentary, isCommentary, ITimeInfo } from './walkthrough/WalkthroughTools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import clsx from 'clsx';

export const Commentary: React.FC = () => {
    let progState = useProgramState();
    let [parasEl, setParasEl] = React.useState<HTMLDivElement | null>(null);
    let [curPos, setCurPos] = React.useState(-100);
    let [rangeInfo, setRangeInfo] = React.useState<{ start: number, end: number }>({ start: 0, end: 0 });
    let wt = progState.walkthrough;

    function handleKeyDown(ev: React.KeyboardEvent) {
        if (ev.key === ' ') {
            ev.preventDefault(); // prevent scrolling
        }
    }

    function handleContinueClick() {
        wt.running = !wt.running;
        progState.markDirty();
    }

    let numTimes = wt.times.length;

    let nodes: INode[] = [];
    let prevIsTime = false
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

    let prevBreak = -1;
    let nextBreak = -1;
    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        if (node.isBreak) {
            if (node.start < wt.time) {
                prevBreak = i;
            } else {
                nextBreak = i;
                break;
            }
        }
    }

    useEffect(() => {

        function handleChildren() {
            if (!parasEl?.children) return;

            let parasBcr = parasEl.getBoundingClientRect();

            for (let child of parasEl.children) {
                let nid = parseInt(child.getAttribute('data-nid')!);
                let c = nodes[nid];
                if (!c) {
                    continue;
                }
                let cStart = c.commentary?.start ?? c.times![0].start;
                let cEnd = eventEndTime(c.commentary ?? c.times![c.times!.length - 1]);

                if (cStart <= wt.time && cEnd >= wt.time) {
                    let childBcr = child.getBoundingClientRect();
                    let offset = childBcr.top - parasBcr.top + childBcr.height;
                    setCurPos(offset);
                    break;
                }
            }

            function findChild(idx: number) {
                for (let child of parasEl!.children) {
                    let nid = parseInt(child.getAttribute('data-nid')!);
                    if (nid === idx) {
                        return child;
                    }
                }
            }
            let startPos = 0;
            let endPos = 0;


            if (prevBreak >= 0) {
                let child = findChild(prevBreak)!;
                let childBcr = child.getBoundingClientRect();
                let offset = childBcr.top - parasBcr.top;
                startPos = offset;
            }
            if (nextBreak >= 0) {
                let child = findChild(nextBreak)!;
                let childBcr = child.getBoundingClientRect();
                let offset = childBcr.bottom - parasBcr.top;
                endPos = offset;
            }

            setRangeInfo({ start: startPos, end: endPos });
        }

        if (parasEl) {
            let observer = new ResizeObserver(handleChildren);
            observer.observe(parasEl);
            return () => {
                observer.disconnect();
            };
        }

    }, [parasEl, wt.phase, wt.time, numTimes, prevBreak, nextBreak]);

    console.log('start', rangeInfo.start, 'end', rangeInfo.end, 'cur', curPos);

    return <>
        <div className={s.walkthroughText} tabIndex={0} onKeyDownCapture={handleKeyDown}>
            <div className={s.title}>{phaseToGroup(wt)?.title}</div>
            <div className={s.walkthroughParas} ref={setParasEl}>
                {walkthroughToParagraphs(wt, nodes)}
                {!wt.running && <>
                    <div className={s.activeRange} style={{ top: rangeInfo.start, height: rangeInfo.end - rangeInfo.start }}>
                        <div className={s.beadOfLight} />
                    </div>
                    <div className={s.dividerLine} style={{ top: curPos }} />
                    <SpaceToContinueHint top={curPos} />
                </>}
            </div>
        </div>
        <div className={s.controls}>
            <button className={clsx(s.btn, s.prevNextBtn)} onClick={() => { }}>
                <div>Prev Phase</div>
            </button>

            <button className={clsx(s.btn, s.continueBtn)} onClick={handleContinueClick}>
                <div>Continue</div>
            </button>

            <button className={clsx(s.btn, s.prevNextBtn)} onClick={() => { }}>
                <div>Next Phase</div>
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
        let res: React.ReactNode[] = [];
        let paraItems: ReactNode[] = [];

        function pushParagraph() {
            if (paraItems.length) {
                res.push(<p key={keyId++}>{paraItems}</p>);
                paraItems = [];
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
                    paraItems.push(strPart);
                }
            }

            if (i < c.values.length) {
                let val = c.values[i];
                if (val.insert) {
                    pushParagraph();
                    let fnVal = typeof val.insert === 'function' ? val.insert() : val.insert;
                    let el = typeof fnVal === 'string' ? fnVal : React.createElement(fnVal as React.FC, { key: 'i' + i });
                    res.push(el);
                }
                if (val.color) {
                    let el = <span key={keyId++} style={{ color: val.color.toHexColor() }}>{markupSimple(val.str)}</span>;
                    paraItems.push(el);
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
                let blur = lerp(2, 0, displayFactor);
                return <div key={i} style={{ opacity, filter: `blur(${blur}px)` }} data-nid={i}>
                    {genCommentary(c, wt.time)}
                </div>;
            } else {
                let times = n.times!;
                let active = wt.time >= times[0].start;
                let inRange = wt.time >= times[0].start && wt.time <= eventEndTime(times[times.length - 1]);
                let opacity = active ? 1 : 0.6;
                let blur = active ? 0 : 2;
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

                return <div key={i} className={s.commentaryBreak} data-nid={i} style={{ opacity, filter: `blur(${blur}px)` }}>
                    {showLine && <>
                        <button className={clsx(s.jump, 'btn')}>
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
        } else if (c === '*' && prevC !== '*') {
            boldLocs.push(idx);
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
}> = ({ top }) => {

    return <div className={s.hint} style={{ top }}> 
        <div className={s.hintText}>
             Press <span className={s.key}>Space</span> to continue
        </div>
    </div>;
}