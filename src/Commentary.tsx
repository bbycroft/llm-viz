import React, { ReactNode } from 'react';
import s from './Commentary.module.css';
import { useRenderState } from './Sidebar';
import { phaseToGroup, IWalkthrough } from './walkthrough/Walkthrough';
import { ICommentaryRes } from './walkthrough/WalkthroughTools';

export const Commentary: React.FC = () => {
    let renderState = useRenderState();
    let walkthrough = renderState.walkthrough;

    return <>
        <div className={s.walkthroughText}>
            <div className={s.title}>{phaseToGroup(walkthrough)?.title}</div>
            <div className={s.walkthroughParas}>
                {walkthroughToText(walkthrough)}
            </div>
        </div>
        <div className={s.controls}>
            <button onClick={() => { }}>
                <div>Prev Phase</div>
            </button>

            <button onClick={() => { }}>
                <div>Continue</div>
            </button>

            <button onClick={() => { }}>
                <div>Next Phase</div>
            </button>
        </div>
    </>;
};


export function walkthroughToText(walkthrough: IWalkthrough) {

    function genCommentary(c: ICommentaryRes) {

        let res: React.ReactNode[] = [];
        let prevItems: ReactNode[] = [];
        for (let i = 0; i < c.stringsArr.length; i++) {

            let strRaw = c.stringsArr[i];
            if (strRaw.trim()) {
                let strPart = markupSimple(strRaw);
                prevItems.push(strPart);
            }

            if (i < c.values.length) {
                let val = c.values[i];
                if (val.insert) {
                    res.push(<p key={i}>{prevItems}</p>);
                    prevItems = [];

                    let fnVal = typeof val.insert === 'function' ? val.insert() : val.insert;
                    let el = typeof fnVal === 'string' ? fnVal : React.createElement(fnVal as React.FC, { key: 'i' + i });
                    res.push(el);
                }
                if (val.color) {
                    console.log(val);
                    let el = <span style={{ color: val.color.toHexColor() }}>{markupSimple(val.str)}</span>;
                    prevItems.push(el);
                }
            }
        }

        if (prevItems.length) {
            res.push(<p key={prevItems.length}>{prevItems}</p>);
        }

        return res;
    }

    return <>
        {walkthrough.commentary?.commentaryList.map((c, i) => {
            return <React.Fragment key={i}>
                {genCommentary(c)}
                <div className={s.commentaryBreak} data-cid={i}></div>
            </React.Fragment>;
        })}
    </>;
}

function markupSimple(inputStr: string) {
    let italicLocs: number[] = [];
    let boldLocs: number[] = [];
    let res = '';

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
