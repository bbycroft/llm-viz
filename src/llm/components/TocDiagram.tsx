import React, { memo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { BoundingBox3d, Vec3 } from '@/src/utils/vector';
import s from './TocDiagram.module.scss';
import * as d3Color from 'd3-color';
import { isNotNil, Subscriptions } from '@/src/utils/data';
import { Phase } from '../walkthrough/Walkthrough';
import clsx from 'clsx';
import { jumpToPhase } from '../Commentary';
import { useProgramState } from '../Sidebar';

enum ElType {
    Cell,
    PosEmbed,
    Block,
    Gap,
}

interface IEl {
    type: ElType;
    id?: string;
    label?: string | string[];
    gapType?: 'exit' | 'multihead' | 'add';
    height: number;
    width?: number;
    items?: IEl[];
    color?: string;
    padX?: number;
    padY?: number;
    marginY?: number;
    arrow?: boolean;
    special?: 'transformer' | 'llm';

    posPx?: Vec3;
    sizePx?: Vec3;
}

interface IEntryGroup {
    groupName: string;
    entries: IEntryInfo[];
}

interface IEntryInfo {
    id: Phase;
    title: string;
    ids: string[];
    groupIds: boolean;
}

export const TocDiagram: React.FC<{
    activePhase: Phase | null;
    onEnterPhase?: (phase: Phase) => void;
}> = ({ activePhase, onEnterPhase }) => {
    let [entryManager] = useState(() => new EntryManager());
    // used for measuring text
    let [diagramEl, setDiagramEl] = useState<SVGElement | null>(null);
    let [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    let progState = useProgramState();
    useLayoutEffect(() => {
        setCanvas(document.createElement('canvas')!);
    }, []);

    let [hoverId, setHoverId] = useState<Phase | null>(null);

    let setHover = useCallback((ev: React.MouseEvent, id: Phase, hover: boolean) => {
         setHoverId(hover ? id : null);
    }, []);

    let [activeId, setActiveId] = useState<Phase | null>(null);

    let setActive = useCallback((ev: React.MouseEvent, id: Phase, active: boolean) => {
        jumpToPhase(progState.walkthrough, id);
        onEnterPhase?.(id);
        setActiveId(active ? id : null);
    }, [progState.walkthrough, onEnterPhase]);

    activeId = activePhase ?? activeId;

    let colors = {
        ln: '#e9f29e',
        multihead: '#f2d59e',
        feedForward: '#9ef2f2',
        tokEmbed: '#f0a8fc',
        linear: '#a8c3fc',
        softmax: '#a8fcaf',
        line: '#000',
        focus: '#338',
    };

    let widthStd = 4;
    let widthMultihead = 7;
    let widthFeedForward = 5;
    let smallGap = 0.5;
    let plusGap = 1.0;
    let exitGap = 0.8;

    let structure: IEl = {
        type: ElType.Block, height: 0, color: '#eee', special: 'llm', padX: 2.0, padY: 1.0, id: 'llm', items: [
            { type: ElType.Cell, label: 'tok embed', height: 1, width: 4, color: colors.tokEmbed, id: 'tokEmbed' },
            { type: ElType.PosEmbed, height: 1.8, id: 'posEmbed' },
            { type: ElType.Block, height: 0, padX: 3, padY: 0, color: '#ddd', special: 'transformer', id: 'transformer', items: [
                { type: ElType.Gap, height: 1.2, gapType: 'exit', arrow: true },
                { type: ElType.Cell, height: 1, label: 'layer norm', width: widthStd, color: colors.ln, id: 'ln1' },
                { type: ElType.Gap, height: exitGap, gapType: 'multihead', arrow: true },
                { type: ElType.Cell, height: 2, label: ['multi-head, causal', 'self-attention'], width: widthMultihead, color: colors.multihead, id: 'selfAttend' },
                { type: ElType.Gap, height: plusGap, gapType: 'add' },
                { type: ElType.Gap, height: exitGap, gapType: 'exit', arrow: true },
                { type: ElType.Cell, height: 1, label: 'layer norm', width: widthStd, color: colors.ln, id: 'ln2' },
                { type: ElType.Gap, height: smallGap, arrow: true },
                { type: ElType.Cell, height: 2, label: ['feed', 'forward'], width: widthFeedForward, color: colors.feedForward, id: 'feedForward' },
                { type: ElType.Gap, height: plusGap, gapType: 'add' },
            ] },
            { type: ElType.Gap, height: smallGap, arrow: true },
            { type: ElType.Cell, height: 1, label: 'layer norm', width: widthStd, color: colors.ln, id: 'lnf' },
            { type: ElType.Gap, height: smallGap, arrow: true },
            { type: ElType.Cell, label: 'linear', height: 1, width: widthStd, color: colors.linear, id: 'linear' },
            { type: ElType.Gap, height: smallGap, arrow: true },
            { type: ElType.Cell, label: 'softmax', height: 1, width: widthStd, color: colors.softmax, id: 'softmaxOut' },
        ]
    };

    let entries: IEntryInfo[] = [];
    let entryGroups: IEntryGroup[] = [];

    function makeEntry(id: Phase, title: string, ids: string[] = [], groupIds: boolean = false) {
        let entry = { id, title, ids, groupIds };
        entries.push(entry);
        entryGroups[entryGroups.length - 1].entries.push(entry);
    }

    entryGroups.push({ groupName: 'Intro', entries: [] });
    makeEntry(Phase.Intro_Intro, 'Introduction', []);
    makeEntry(Phase.Intro_Prelim, 'Preliminaries', []);

    entryGroups.push({ groupName: 'Components', entries: [] });
    makeEntry(Phase.Input_Detail_Embedding, 'Embedding', ['tokEmbed', 'posEmbed'], true);
    makeEntry(Phase.Input_Detail_LayerNorm, 'Layer Norm', ['ln1', 'ln2', 'lnf']);
    makeEntry(Phase.Input_Detail_SelfAttention, 'Self Attention', ['selfAttend']);
    makeEntry(Phase.Input_Detail_Projection, 'Projection', ['selfAttend']);
    makeEntry(Phase.Input_Detail_Mlp, 'MLP', ['feedForward']);
    makeEntry(Phase.Input_Detail_Transformer, 'Transformer', ['transformer']);
    makeEntry(Phase.Input_Detail_Softmax, 'Softmax', ['softmaxOut']);
    makeEntry(Phase.Input_Detail_Output, 'Output', ['lnf', 'linear', 'softmaxOut'], true);

    function calcSizes(el: IEl): void {
        el.padX = el.padX ?? 0;
        el.padY = el.padY ?? 0;

         if (el.type === ElType.Block) {
            let sizePx = new Vec3(0, el.padY! * 2 * sizeScale);
            for (let item of el.items!) {
                calcSizes(item);
                sizePx.x = Math.max(sizePx.x, item.sizePx!.x);
                sizePx.y += item.sizePx!.y;
            }
            sizePx.x += el.padX! * sizeScale;
            el.sizePx = sizePx;
        } else {

            if (el.type === ElType.Gap) {
                el.width = 0;
            } else if (el.type === ElType.PosEmbed) {
                el.width = 10;
            }

            el.width = el.width ?? 1;
            el.height = el.height ?? 1;
            el.sizePx = new Vec3(el.width * sizeScale, el.height * sizeScale);
        }
    }

    function calcPosition(el: IEl, offset: Vec3) {
        el.posPx = offset;
        if (el.type === ElType.Block) {
            let midX = el.sizePx!.x / 2;
            let posPx = new Vec3(el.padX! * sizeScale, el.padY! * sizeScale);
            for (let item of el.items!) {
                calcPosition(item, new Vec3(midX - item.sizePx!.x / 2, posPx.y));
                posPx.y += item.sizePx!.y;
            }
        }
    }

    let sizeScale = 20;
    let fontSize = 14;

    calcSizes(structure);
    calcPosition(structure, new Vec3(10 + 0.5, 90 + 0.5));

    interface IElGlobalBounds {
        el: IEl;
        bounds: BoundingBox3d;
    }

    function findByIdBounds(id: string): BoundingBox3d | null {
        return findById(id)?.bounds ?? null;
    }

    function getElGlobalBounds(el: IEl, offset: Vec3): BoundingBox3d {
        let posGlobal = el.posPx!.add(offset);
        return new BoundingBox3d(posGlobal, posGlobal.add(el.sizePx!));
    }

    function findById(id: string, offset?: Vec3, el?: IEl): IElGlobalBounds | null {
        offset = offset ?? new Vec3(0, 0);
        el = el ?? structure;
        if (el.id === id) {
            return { el, bounds: getElGlobalBounds(el, offset) };
        }

        if (el.items) {
            for (let item of el.items) {
                let res = findById(id, el.posPx!.add(offset), item);
                if (res) {
                    return res;
                }
            }
        }
        return null;
    }

    function elIsHoveredOrActive(el: IEl): boolean | null {
        let targetId = isNotNil(hoverId) ? hoverId : activeId;
        let entry = entries.find(e => e.id === targetId);
        if (!entry) {
            return null;
        }
        let isHover = entry.ids.includes(el.id ?? '');
        return isHover;
    }

    function renderPlus(pos: Vec3, key: string) {
        let plusLen = 4;
        return <g key={key}>
            <circle cx={pos.x} cy={pos.y} r={6} stroke='#000000' fill='white' />;
            <line x1={pos.x - plusLen} y1={pos.y} x2={pos.x + plusLen} y2={pos.y} stroke='#000000' strokeWidth={1} />;
            <line x1={pos.x} y1={pos.y - plusLen} x2={pos.x} y2={pos.y + plusLen} stroke='#000000' strokeWidth={1} />;
        </g>;
    }

    function renderArrow(to: Vec3, from: Vec3, key: string) {
        let dir = to.sub(from).normalize();
        let dirProp = new Vec3(dir.y, -dir.x);
        let arrowLen = 5;
        let arrowWidth = 4;
        let left = to.mulAdd(dir, -arrowLen).mulAdd(dirProp, -arrowWidth / 2);
        let right = to.mulAdd(dir, -arrowLen).mulAdd(dirProp, arrowWidth / 2);
        let path = `M${left.x},${left.y} L${to.x},${to.y} L${right.x},${right.y}Z`;
        return <g key={key}>
            <path d={path} fill={colors.line} className={s.dataPath} />
        </g>;
    }

    function renderEl(el: IEl, idx: number) {
        let pos = el.posPx!;
        let size = el.sizePx!;
        let transform = `translate(${pos.x}, ${pos.y})`;
        let fill = el.color ?? '#00000000';
        let stroke = d3Color.color(fill)?.darker(0.5).toString();

        function renderResiduals() {
            let from = el.items!.filter(a => a.gapType === 'exit');
            let to = el.items!.filter(a => a.gapType === 'add');
            let segs: React.ReactNode[] = [];
            for (let i = 0; i < from.length; i++) {
                let fromItem = from[i];
                let toItem = to[i];
                let fromY = fromItem.posPx!.y + 0.25 * fromItem.sizePx!.y;
                let toY = toItem.posPx!.y + toItem.sizePx!.y / 2;
                let fromX = fromItem.posPx!.x + fromItem.sizePx!.x;
                let toX = toItem.posPx!.x + 8;
                let xVert = size.x - 10;
                let path = `M${fromX},${fromY} L${xVert},${fromY} L${xVert},${toY} L${toX+4},${toY}`;
                segs.push(<path key={i} d={path} fill='none' strokeLinejoin='round' opacity={opacityDimmed} className={s.dataPath} />);
                segs.push(renderArrow(new Vec3(toX, toY), new Vec3(toX + 10, toY), `residual-arrow-${i}`));
            }
            return segs;
        }

        let isHover = elIsHoveredOrActive(el);
        let opacityDimmed = isHover === false && (isNotNil(hoverId) || isNotNil(activePhase)) ? 0.5 : 1.0;

        let content: React.ReactNode = null;

        switch (el.type) {
            case ElType.Cell:
                let label = Array.isArray(el.label) ? el.label : [el.label];

                content = <>
                    <rect className={s.cell} width={size.x} height={size.y} fill={el.color ?? '#00000000'} rx={3} ry={3} stroke={stroke} strokeWidth={1} />
                    {label.map((l, i) => {
                        return <text key={i} x={size.x / 2} y={(i + 0.75) * sizeScale} width={size.x} fontSize={fontSize} textAnchor='middle'>{l}</text>;
                    })}
                </>;
                break;
            case ElType.PosEmbed:
                let center = el.sizePx!.mul(0.5);
                let embedX = center.x - 40;
                let textX = embedX - 14;

                content = <>
                    <line className={s.gap} x1={center.x} x2={center.x} y1={0} y2={size.y} stroke={colors.line} />
                    <text fontSize={11} textAnchor='end' x={textX} y={center.y + 0.25 * fontSize}>pos embed</text>
                    <circle cx={embedX} cy={center.y} r={10} stroke={colors.line} fill='none' />;
                    <line x1={embedX + 14} x2={center.x - 10} y1={center.y} y2={center.y} stroke={colors.line} strokeWidth={1} />;
                    <text textAnchor='middle' x={embedX} y={center.y + 5} fontSize={22}>~</text>
                    {renderArrow(new Vec3(center.x - 8, center.y), new Vec3(center.x - 12, center.y), 'posEmbedArrow')}
                    {renderPlus(center, 'posEmbed')}
                </>;
                break;
            case ElType.Block:
                let dashArray = el.special === 'llm' ? '2 2' : undefined;
                content = <>
                    <rect className={s.block} width={size.x} height={size.y} fill={el.color ?? '#000000'} rx={3} ry={3} strokeDasharray={dashArray} stroke={stroke} />
                    {el.items!.map((item, i) => renderEl(item, i))}
                    {renderResiduals()}
                    {el.special === 'transformer' && <text fontSize={13} textAnchor='start' x={4} y={14} fill={'#555'}>transformer i</text>}
                    {el.special === 'llm' && <text fontSize={13} textAnchor='start' x={4} y={14} fill={'#333'}>LLM</text>}
                </>;
                opacityDimmed = 1.0;
                break;
            case ElType.Gap:
                function renderMultihead(xPos: number) {
                    let topY = Math.round(0.3 * size.y);
                    let path = `M${size.x/2},${topY} L${xPos},${topY} L${xPos},${size.y - 2}`;
                    return <>
                        <path d={path} stroke={'black'} fill='none' className={s.dataPath} />
                        {renderArrow(new Vec3(xPos, size.y), new Vec3(xPos, size.y-10), 'multihead-arrow')}
                    </>;
                }

                content = <>
                    <line className={s.gap} x1={0} y1={0} x2={0} y2={size.y} stroke={'black'} />
                    {el.gapType === 'add' && renderPlus(new Vec3(size.x / 2, size.y / 2), 'add')}
                    {el.arrow && renderArrow(new Vec3(size.x / 2, size.y), new Vec3(size.x / 2, 0), '0')}
                    {el.gapType === 'multihead' && <>{renderMultihead(size.x / 2 - 30)}{renderMultihead(size.x / 2 + 30)}</>}
                </>;
                break;
        }

        return <g key={idx} transform={transform} opacity={opacityDimmed}>
            {content}
        </g>;
    }

    function renderExampleText() {
        if (!canvas) {
            return null;
        }
        let ctx = canvas.getContext('2d')!;
        ctx.font = '16px Merriweather';

        let textSegs = ['How', ' to', ' predict'];
        let ids = [2437, 284, 4331];

        let colors = [
            'rgba(107,64,216,.3)',
            'rgba(104,222,122,.4)',
            'rgba(244,172,54,.4)',
            'rgba(239,65,70,.4)',
            'rgba(39,181,234,.4)',
        ];


        let widths: number[] = [];
        let offsets = [0];
        for (let seg of textSegs) {
            widths.push(ctx.measureText(seg).width + 1);
            offsets.push(offsets[offsets.length - 1] + widths[widths.length - 1]);
        }

        let egTextSegs = [' text', ' tokens', ' words'];
        let egPct = [0.8, 0.5, 0.3];
        let egIds = [2420, 16326, 2456];
        let egWidths = egTextSegs.map(seg => ctx.measureText(seg).width + 1);

        let egColor = colors[widths.length];
        let egPosX = offsets[offsets.length - 1];
        let egMaxWidth = Math.max(...egWidths);
        let egTopY = -10;
        let egIdWidth = 28;

        let totalWidth = egPosX + egMaxWidth + egIdWidth + 6;
        let x = structure.sizePx!.x / 2 - totalWidth / 2 + 20.5;
        let y = 20;

        let node = <g transform={`translate(${x} ${y})`}>
            {textSegs.map((seg, i) => {
                return <React.Fragment key={i}>
                    <rect x={offsets[i]} y={0} width={widths[i] + 1} height={20} fill={colors[i]} />
                    <text x={offsets[i]} y={16} fontSize={16}>{seg.replaceAll(' ', '\xa0')}</text>
                    <text x={offsets[i] + widths[i] / 2} y={30} fontSize={9} textAnchor='middle' fill={'#338a'}>{ids[i]}</text>
                </React.Fragment>;
            })}
            {egTextSegs.map((seg, i) => {
                return <React.Fragment key={i}>
                    <rect x={egPosX} y={egTopY + 20 * i} width={egWidths[i] + 1} height={20} fill={egColor} />
                    <text x={egPosX} y={egTopY + 20 * i + 16} fontSize={16} fillOpacity={egPct[i]}>{seg.replaceAll(' ', '\xa0')}</text>
                    <text x={egPosX + egMaxWidth + egIdWidth} y={egTopY + 20 * i + 13} fontSize={9} textAnchor='end' fill={'#338a'}>{egIds[i]}</text>
                </React.Fragment>;
            })}
            <rect x={egPosX+1} y={egTopY+1} width={egMaxWidth + egIdWidth + 4} height={20 * egTextSegs.length - 2} fill={'none'} stroke={egColor} strokeDasharray={'4,4'} />
        </g>;

        return {
            node,
            inputPos: new Vec3(x, y + 40),
            inputWidth: egPosX,
            outputPos: new Vec3(x + egPosX, y + egTopY + 20 * egTextSegs.length + 2),
            outputWidth: egMaxWidth + egIdWidth + 4,
        };
    }

    let exampleInfo = renderExampleText();

    function renderInputLines() {
        let target = findByIdBounds('tokEmbed');
        if (!exampleInfo || !target) {
            return null;
        }

        let insetMain = 4;
        let inset = 4;

        let left = exampleInfo.inputPos.x + insetMain;
        let right = exampleInfo.inputPos.x + exampleInfo.inputWidth - insetMain;
        let top = Math.round(exampleInfo.inputPos.y);
        let bot = top + 10;
        let path = `M${left},${top} L${left + inset},${bot} L${right - inset},${bot} L${right},${top}`;
        let center = (left + right) / 2;
        let endPt = new Vec3(target.center().x, target.min.y);
        let horizY = endPt.y - 10;

        let path2 = `M${center},${bot} L${center},${horizY} L${endPt.x},${horizY} L${endPt.x},${endPt.y - 2}`;

        return <>
            <path d={path + path2} className={s.dataPath} />
            {renderArrow(endPt, new Vec3(endPt.x, endPt.y - 10), 'multihead-arrow')}
        </>;
    }

    function renderOutputLine() {
        let softmaxOut = findByIdBounds('softmaxOut');
        let llmTarget = findByIdBounds('llm');
        if (!exampleInfo || !softmaxOut || !llmTarget) {
            return null;
        }

        let startPt = new Vec3(softmaxOut.center().x, softmaxOut.max.y);
        let botY = startPt.y + 10;
        let rightX = llmTarget.max.x - 10;
        let topY = llmTarget.min.y + 10;
        let endPt = new Vec3(exampleInfo.outputPos.x + exampleInfo.outputWidth / 2, exampleInfo.outputPos.y);

        let path = `M${startPt.x},${startPt.y} L${startPt.x},${botY} L${rightX},${botY} L${rightX},${topY} L${endPt.x},${topY} L${endPt.x},${endPt.y + 2}`;

        return <>
            <path d={path} className={s.dataPath} />
            {renderArrow(endPt, new Vec3(endPt.x, endPt.y + 10), 'multihead-arrow')}
        </>;
    }

    function getFocusBounds(entry: IEntryInfo): BoundingBox3d[] {
        let idBounds = entry.ids.map(findByIdBounds).filter(isNotNil);

        if (entry.groupIds) {
            let box = new BoundingBox3d();
            idBounds.forEach(b => box.combineInPlace(b));
            return [box];
        } else {
            return idBounds;
        }
    }

    function renderFocusBoxes() {
        let focusId = hoverId ?? activeId;
        let hoverEntry = entries.find(e => e.id === focusId);
        return hoverEntry ? getFocusBounds(hoverEntry).map((bb, i) => renderFocusBox(bb, i)) : [];
    }

    function renderFocusBox(bb: BoundingBox3d, i: number) {
        let innerPad = new Vec3(4, 4);
        let tl = bb.min.sub(innerPad);
        let br = bb.max.add(innerPad);
        let pad = 30;

        let color = colors.focus;

        return <React.Fragment key={i}>
            <defs>
                <mask id={"hole" + i}>
                    <rect x={tl.x - pad} y={tl.y - pad} width={br.x - tl.x + 2 * pad} height={br.y - tl.y + 2 * pad} fill={'white'} />
                    <rect x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill="black"/>
                </mask>
            </defs>
            <rect x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill={color}
                mask={`url(#hole${i})`}
                style={{ filter: `drop-shadow(0px 0px 5px ${color})`}}
                />
            <rect x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill={'none'} stroke={'#338a'} strokeWidth={2} strokeDasharray={'8,4'} />
        </React.Fragment>;
    }

    function renderTocToDigramLines() {
        if (!diagramEl) {
            return null;
        }

        let svgRect = diagramEl.getBoundingClientRect();

        let offsetLeft = getElGlobalBounds(structure, new Vec3(0, 0)).max.x + 10;
        let offsetInc = 4;
        let i = 0;
        let result: React.ReactNode[] = [];

        for (let entry of entries) {
            let phase = entry.id;
            let tocEl = entryManager.entries.get(phase);
            if (!tocEl) {
                continue;
            }
            let tocRect = tocEl.getBoundingClientRect();

            let endPt = new Vec3(tocRect.left - svgRect.left - 4, tocRect.top - svgRect.top + tocRect.height / 2);

            let allBounds = getFocusBounds(entry);

            if (allBounds.length === 0) {
                continue;
            }

            let yPts = [...allBounds.map(b => b.center().y), endPt.y];
            let minY = Math.min(...yPts);
            let maxY = Math.max(...yPts);
            let midX = offsetLeft;
            let mainPath = `M${midX},${minY} L${midX},${maxY} M${midX},${endPt.y} L${endPt.x},${endPt.y}`;
            let isFocusEntry = hoverId ? entry.id === hoverId : entry.id === activeId;
            let opacity = isFocusEntry ? 1.0 : 0.1;

            let pathOpts = () => {
                return { stroke: colors.focus, strokeWidth: 1, fill: 'none', strokeOpacity: opacity };
            }

            result.push(<path key={i++} {...pathOpts()} d={mainPath} />);

            for (let bound of getFocusBounds(entry)) {
                let startPt = new Vec3(bound.max.x + 8, bound.center().y);
                let path = `M${startPt.x},${startPt.y} L${midX},${startPt.y}`;
                result.push(<path key={i++} {...pathOpts()} d={path} />);
            }

            offsetLeft += offsetInc;
        }

        return result;
    }

    let height = getElGlobalBounds(structure, new Vec3(0, 0))!.max.y + 10;

    let titleAbove = false;

    return <div>
        {titleAbove && <div className={s.tocTitle}>Table of Contents</div>}
        <div className={s.tocDiagram}>
            <svg viewBox={`0 0 310 ${height}`} width={'310px'} height={height} ref={setDiagramEl}>
                {exampleInfo?.node}
                {renderEl(structure, 0)}
                {renderInputLines()}
                {renderOutputLine()}
                {renderFocusBoxes()}
                {renderTocToDigramLines()}
            </svg>
            <div className={s.toc}>
                {!titleAbove && <div className={s.tocTitle}>Table of Contents</div>}
                {entryGroups.map((group, i) => {

                    return <React.Fragment key={i}>
                        <div className={s.tocGroupTitle}>{group.groupName}</div>
                        {group.entries.map((entry, j) => {
                            return <MenuEntry
                                key={j}
                                entryManager={entryManager}
                                title={entry.title}
                                id={entry.id}
                                active={entry.id === activeId}
                                hover={entry.id === hoverId}
                                setHover={setHover}
                                setActive={setActive}
                            />;
                        })}
                </React.Fragment>;
                })}
            </div>
        </div>
    </div>;
};

class EntryManager {
    subscriptions = new Subscriptions();
    entries = new Map<Phase, HTMLDivElement | null>();
    setEl(id: Phase, ref: HTMLDivElement | null) {
        if (ref) {
            this.entries.set(id, ref);
            return () => {
                this.entries.delete(id);
            }
        } else {
            this.entries.delete(id);
        }
    }
}

export const MenuEntry: React.FC<{
    entryManager: EntryManager,
    title: string,
    id: Phase,
    active: boolean,
    hover: boolean,
    setHover: (ev: React.MouseEvent, id: Phase, hover: boolean) => void,
    setActive: (ev: React.MouseEvent, id: Phase, active: boolean) => void,
}> = memo(function MenuEntry({ entryManager, id, title, active, hover, setHover, setActive }) {

    let setDivRef = useCallback((div: HTMLDivElement | null) => {
        entryManager.setEl(id, div);
    }, [entryManager, id]);


    function handleClick(ev: React.MouseEvent) {
        setActive(ev, id, !active);
    }

    function handleHover(ev: React.MouseEvent, hover: boolean) {
        setHover(ev, id, hover);
    }

    return <div
        ref={setDivRef}
        className={clsx(s.menuEntry, active && s.active, hover && s.hover)}
        onClick={handleClick}
        onMouseEnter={ev => handleHover(ev, true)}
        onMouseLeave={ev => handleHover(ev, false)}
    >
        {title}
    </div>;
});
