import { IBlkDef, IGptModelLayout } from "@/src/GptModelLayout";
import { IRenderState } from "@/src/render/modelRender";
import { clamp } from "@/src/utils/data";
import { measureTextWidth } from "@/src/render/fontRender";
import { Vec3, Vec4 } from "../utils/vector";
import { IWalkthrough, Phase, PhaseGroup } from "./Walkthrough";
import { IProgramState } from "../Program";

export interface IWalkthroughArgs {
    state: IProgramState;
    layout: IGptModelLayout;
    walkthrough: IWalkthrough;
    tools: ReturnType<typeof phaseTools>;
}

export function phaseTools(state: IProgramState) {
    let phaseState = state.walkthrough;

    function c_str(str: string, duration: number = 0.3, style: DimStyle = DimStyle.T) {
        return { str, duration, start: 0, t: 0.0, color: dimStyleColor(style) };
    }

    function atTime(start: number, duration?: number, wait?: number): ITimeInfo {
        return createAtTime(phaseState, start, duration, wait);
    }

    function atEvent(evt: { str: string, duration: number, t: number, start: number }): ITimeInfo {
        return atTime(evt.start, evt.duration);
    }

    function afterTime(prev: ITimeInfo | null, duration: number, wait?: number): ITimeInfo {
        prev = prev ?? phaseState.times[phaseState.times.length - 1];
        return atTime(prev.start + prev.duration + prev.wait, duration, wait);
    }

    function cleanup(t: ITimeInfo, times: ITimeInfo[] = phaseState.times) {
        if (t.t > 0.0) {
            for (let prevTime of times) {
                prevTime.t = 1.0 - t.t;
                if (t.t >= 1.0) {
                    prevTime.active = false;
                }
            }
        }
    }

    function breakAfter(evt?: ITimeInfo) {
        evt = evt ?? phaseState.times[phaseState.times.length - 1];
        if (!evt) {
            return;
        }
        let breakEvt = afterTime(evt, 0.001);
        if (phaseState.running && breakEvt.t === 1.0 && (phaseState.lastBreakTime === null || phaseState.lastBreakTime <= breakEvt.start)) {
            phaseState.running = false;
            phaseState.time = breakEvt.start + breakEvt.duration;
            phaseState.lastBreakTime = phaseState.time;
        }
        breakEvt.isBreak = true;
    }

    function commentary(stringsArr: TemplateStringsArray, ...values: any[]) {
        return writeCommentary(state, null, stringsArr, ...values);
    }

    function commentaryPara(c: ICommentaryRes) {
        return (stringsArr: TemplateStringsArray, ...values: any[]) => {
            return writeCommentary(state, c, stringsArr, ...values);
        };
    }

    return { atTime, atEvent, afterTime, cleanup, commentary, commentaryPara, c_str, breakAfter };
}

function createAtTime(wt: IWalkthrough, start: number, duration?: number, wait?: number): ITimeInfo {
    duration = duration ?? 0;
    wait = wait ?? 0;
    let info: ITimeInfo = {
        name: '',
        start,
        duration,
        wait,
        t: duration === 0 ? (wt.time > start ? 1 : 0) : clamp((wt.time - start) / duration, 0, 1),
        active: wt.time > start,
    };
    wt.times.push(info);
    wt.phaseLength = Math.max(wt.phaseLength, start + duration + wait);
    return info;
}

export function eventEndTime(evt: ITimeInfo) {
    return evt.start + evt.duration + evt.wait;
}

export interface ICommentary extends ITimeInfo {
    strings: TemplateStringsArray;
    values: any[];
}

export function isCommentary(evt: ITimeInfo): evt is ICommentary {
    return 'strings' in evt;
}

export function commentary(wt: IWalkthrough, prev?: ITimeInfo | null, duration?: number) {
    return (stringsArr: TemplateStringsArray, ...values: any[]): ICommentary => {
        let t = 0;
        prev = prev ?? wt.times[wt.times.length - 1];

        if (prev) {
            t = prev.start + prev.duration + prev.wait;
        }

        let commentaryT = createAtTime(wt, prev ? eventEndTime(prev) : 0, duration ?? 0.2);

        let res: ICommentary = {
            ...commentaryT,
            strings: stringsArr,
            values,
        };

        wt.times[wt.times.length - 1] = res; // replace the time info with the commentary

        return res;
    }
}

export function writeCommentary(state: IProgramState, prev: ICommentaryRes | null, stringsArrRaw: TemplateStringsArray, ...values: any[]): ICommentaryRes {
    let t = prev?.duration ?? 0;
    let colNum = 0;
    let fontSize = 17;
    let maxWidth = 500;
    let charsPerSecond = 400;
    let lineHeight = fontSize * 1.2;

    let lineOffset = prev ? prev.lineOffset + lineHeight * 1.5 : 10;
    let stringsArr = stringsArrRaw.map(s => s.replace(/([ \n])+/g, ' '));

    for (let i = 0; i < values.length + 1; i++) {
        let str = stringsArr[i];

        t += str.length / charsPerSecond;

        if (i < values.length && 't' in values[i]) {
            // calculate the t value of this point
            values[i].start = t;
            t += values[i].duration;
        }
    }

    let targetT = state.walkthrough.time;

    function writeWord(str: string, tStart: number, tEnd: number, colOverride?: Vec4, fontOverride?: string) {

        while (str.startsWith('\n\n')) {
            lineOffset += lineHeight;
            colNum = 0;
            str = str.substring(2);
        }
        str = str.replace(/([ \n])+/g, ' ');

        let strToDraw = str;
        let nextOff = 0;
        let w = measureTextWidth(state.render.modelFontBuf, str, fontSize);
        if (colNum + w > maxWidth) {
            lineOffset += lineHeight;
            colNum = 0;
            strToDraw = str.trimStart();
            w = measureTextWidth(state.render.modelFontBuf, strToDraw, fontSize);
            if (w > maxWidth) {
                // ignore for now; single word longer than line: should break at the character level
            }
            nextOff = w;
        } else {
            nextOff = colNum + w;
        }

        let color = new Vec4(0.5, 0.5, 0.5, 1).mul(0.5);
        if (targetT > tStart) {
            let targetColor = colOverride ?? new Vec4(0.1, 0.1, 0.1, 1);
            // lerp is 0 at tStart, 1 at tEnd 
            let x = clamp((targetT - tStart) / (tEnd - tStart), 0, 1);
            color = Vec4.lerp(color, targetColor, x);
        }
        // writeTextToBuffer(state.overlayFontBuf, strToDraw, color, 10 + colNum, lineOffset, fontSize, undefined, fontOverride);

        colNum = nextOff;
    }

    t = prev?.duration ?? 0;
    for (let i = 0; i < values.length + 1; i++) {
        let words = stringsArr[i].split(/(?=[ \n]+)/).filter(a => a !== ' ');

        for (let word of words) {
            let tEnd = t + word.length / charsPerSecond;
            writeWord(word, t, tEnd);
            t = tEnd;
        }

        if (i < values.length && 't' in values[i]) {
            let val = values[i];
            // calculate the t value of this point
            val.start = t;
            writeWord(values[i].str, t, val.color, val.fontFace);
            t += val.duration;
        }
    }

    let commentryT = createAtTime(state.walkthrough, 0, t, 0);

    let res: ICommentaryRes = {
        ...commentryT,
        stringsArr: stringsArrRaw,
        values,
        lineOffset,
        colNum,
        commentaryList: [],
    };
    res.commentaryList = [res];

    if (prev) {
        prev.lineOffset = lineOffset;
        prev.colNum = colNum;
        prev.duration = t;
        prev.commentaryList = [...prev.commentaryList, res];
    } else {
        state.walkthrough.commentary = res;
    }

    return res;
}

export interface ICommentaryRes extends ITimeInfo {
    stringsArr: TemplateStringsArray;
    values: any[];
    commentaryList: ICommentaryRes[];
    duration: number;
    lineOffset: number;
    colNum: number;
}

export interface ITimeInfo {
    name: string;
    start: number;
    duration: number;
    wait: number;

    // will change over the course of a phase: used to lerp
    t: number; // 0 - 1
    active: boolean;

    isBreak?: boolean;
}

export function moveCameraTo(state: IProgramState, time: ITimeInfo, target: Vec3, rot: Vec3) {

    if (time.active && time.t < 1.0) {
        state.camera.angleDesired = rot;
        state.camera.angleZDesired = rot.z;
        state.camera.centerDesired = target;
    }

}


export enum DimStyle {
    None,
    t,
    T,
    C,
    B,
    A,
    n_vocab,
    n_heads,
    n_layers,
    Token,
    TokenIdx,
    C4,
}

export function dimStyleColor(style: DimStyle) {
     switch (style) {
        case DimStyle.t:
        case DimStyle.T:
            return new Vec4(0.4, 0.4, 0.9, 1);
        case DimStyle.C:
            return new Vec4(0.9, 0.3, 0.3, 1);
        case DimStyle.Token:
            return new Vec4(0.3, 0.7, 0.3, 1);
        case DimStyle.TokenIdx:
            return Vec4.fromHexColor('#1b495d');
        case DimStyle.n_vocab:
            return Vec4.fromHexColor('#7c3c8d'); // new Vec4(0.8, 0.6, 0.3, 1);
    }
    return new Vec4(0,0,0);
}

export function hideFromBlock(state: IRenderState, layout: IGptModelLayout, targetBlk: IBlkDef) {
    let seen = false;
    for (let blk of layout.cubes) {
        if (!seen && blk === targetBlk) {
            seen = true;
        }
        seen && blk.t === 'i' && hideBlock(blk);
    }
    function hideBlock(b: IBlkDef) {
        if (b.access) {
            b.access.disable = true;
        }
        b.subs?.forEach(hideBlock);
    }
}

export interface IPhaseGroup {
    groupId: PhaseGroup;
    title: string;
    phases: IPhaseDef[];
}

export interface IPhaseDef {
    id: Phase;
    title: string;
}
