import { IBlkDef, IGptModelLayout } from "@/src/GptModelLayout";
import { IRenderState } from "@/src/render/modelRender";
import { clamp } from "@/src/utils/data";
import { measureTextWidth, writeTextToBuffer } from "@/src/utils/font";
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { IWalkthrough, Phase } from "./Walkthrough";

export function phaseTools(state: IRenderState, phaseState: IWalkthrough) {
    function c_str(str: string, duration: number = 0.3, style: DimStyle = DimStyle.T) {
        return { str, duration, start: 0, t: 0.0, color: dimStyleColor(style) };
    }

    function atTime(start: number, duration?: number, wait?: number): ITimeInfo {
        duration = duration ?? 1;
        wait = wait ?? 0;
        let info: ITimeInfo = {
            name: '',
            start,
            duration,
            wait,
            t: clamp((phaseState.time - start) / duration, 0, 1),
            active: phaseState.time > start,
         };
         phaseState.times.push(info);
         phaseState.phaseLength = Math.max(phaseState.phaseLength, start + duration + wait);
         return info;
    }

    function atEvent(evt: { str: string, duration: number, t: number, start: number }): ITimeInfo {
        return atTime(evt.start, evt.duration);
    }

    function afterTime(prev: ITimeInfo, duration: number, wait?: number): ITimeInfo {
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

    function commentary(stringsArr: TemplateStringsArray, ...values: any[]) {
        let res = writeCommentary(state, null, stringsArr, ...values);
        return res;
    }

    function commentaryPara(c: ICommentaryRes) {
        return (stringsArr: TemplateStringsArray, ...values: any[]) => {
            return writeCommentary(state, c, stringsArr, ...values);
        };
    }

    return { atTime, atEvent, afterTime, cleanup, commentary, commentaryPara, c_str };
}

export function writeCommentary(state: IRenderState, prev: ICommentaryRes | null, stringsArr: TemplateStringsArray, ...values: any[]): ICommentaryRes {
    let t = prev?.duration ?? 0;
    let lineOffset = prev?.lineOffset ?? 0;
    let lineNum = prev?.lineNum ?? 0;
    let fontSize = 20;
    let maxWidth = 300;
    let charsPerSecond = 400;

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

    function writeWord(str: string, tStart: number, colOverride?: Vec4, fontOverride?: string) {

        while (str.startsWith('\n')) {
            lineNum += 1;
            lineOffset = 0;
            str = str.substring(1);
        }

        let strToDraw = str;
        let nextOff = 0;
        let w = measureTextWidth(state.modelFontBuf, str, fontSize);
        if (lineOffset + w > maxWidth) {
            lineNum += 1;
            lineOffset = 0;
            strToDraw = str.trimStart();
            w = measureTextWidth(state.modelFontBuf, strToDraw, fontSize);
            if (w > maxWidth) {
                // ignore for now; single word longer than line: should break at the character level
            }
            nextOff = w;
        } else {
            nextOff = lineOffset + w;
        }

        let color = new Vec4(0.5, 0.5, 0.5, 1).mul(0.5);
        if (targetT > tStart) {
            let targetColor = colOverride ?? new Vec4(0.1, 0.1, 0.1, 1);
            color = Vec4.lerp(color, targetColor, clamp((targetT - tStart) * 10, 0, 1));
        }
        writeTextToBuffer(state.overlayFontBuf, strToDraw, color, 10 + lineOffset, 10 + lineNum * fontSize * 1.2, fontSize, undefined, fontOverride);

        lineOffset = nextOff;
    }

    t = prev?.duration ?? 0;
    for (let i = 0; i < values.length + 1; i++) {
        let words = stringsArr[i].split(/(?=[ \n])/);

        for (let word of words) {
            writeWord(word, t);
            t += word.length / charsPerSecond;
        }

        if (i < values.length && 't' in values[i]) {
            let val = values[i];
            // calculate the t value of this point
            val.start = t;
            writeWord(values[i].str, t, val.color, val.fontFace);
            t += val.duration;
        }
    }

    let res = { stringsArr, values, duration: t, lineNum, lineOffset };

    if (prev) {
        prev.lineNum = lineNum;
        prev.lineOffset = lineOffset;
        prev.duration = t;
    } else {
        state.walkthrough.commentary = res;
    }

    return res;
}

export interface ICommentaryRes {
    stringsArr: TemplateStringsArray;
    values: any[];
    duration: number;
    lineNum: number;
    lineOffset: number;
}

export interface ITimeInfo {
    name: string;
    start: number;
    duration: number;
    wait: number;

    // will change over the course of a phase: used to lerp
    t: number; // 0 - 1
    active: boolean;
}

export function moveCameraTo(state: IRenderState, time: ITimeInfo, rot: Vec3, target: Vec3) {

}

export enum DimStyle {
    t,
    T,
    C,
    B,
    A,
    n_vocab,
}

export function dimStyleColor(style: DimStyle) {
     switch (style) {
        case DimStyle.t:
        case DimStyle.T:
            return new Vec4(0.4, 0.4, 0.9, 1);
        case DimStyle.C:
            return new Vec4(0.9, 0.3, 0.3, 1);
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
    groupId: string;
    title: string;
    phases: IPhaseDef[];
}

export interface IPhaseDef {
    id: Phase;
    title: string;
}
