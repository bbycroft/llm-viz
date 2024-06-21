import { inverseLerp } from "../utils/math";
import { Vec2 } from "../utils/vector";
import { bitsToBinStr, lengthSymbolToLengthFromNumber, reverseBits } from "./DeflateDecoder";
import { AnimStepType, IAnimationSteps, IDeflateBlock, IDeflateData, IDeflateRenderState, IPrefixCoding } from "./DeflateRenderModel";
import { IRenderStyle, baseRenderStyle, distResString, distStyle, litLenResString, litLenStyle, makeCanvasFont, readBits } from "./deflateRenderHelpers";

export enum SymType {
    Literal,
    Length,
    EOB,
    Dist,
    CodeLen,
    Unknown,
}

export interface IDeflateBlockState {

}

export interface IDeflateBlockInfo {
    symAndExtras: ISymAndExtra[];
    rectRanges: ICellRange[];
}

export interface ISymAndExtra {
    tl: Vec2;
    size: Vec2;
    type: SymType;
    sym: number;
    startBit: number;
    symColor: string;
    extraColor: string;
    codeWidth: number;
    codeExtraWidth: number;
    symWidth: number;
    symExtraWidth: number;
    codeStr: string;
    codeExtraStr: string;
    symStr: string;
    symExtraStr: string;
}

export interface ICellRange {
    rangeIdx: number; // ranges share the same index if they cross a line (& exactly one of them has isStart, and one has isEnd)
    firstCellIdx: number;
    lastCellIdx: number;
    isStart: boolean; // if false, wraps from prev line
    isEnd: boolean; // if false, wraps to next line
}

interface IRenderCtx {

    style: IRenderStyle;
}

let baseRenderCtx: IRenderCtx = {
    style: baseRenderStyle,
}

// single-run function to populate useful data for rendering
export function initDeflateRenderData(data: IDeflateData) {

    let outputOffset = 0;
    let animIndexOffset = 0;
    for (let block of data.blocks) {
        if (block.mode === 2) {
            block.animSteps = populateDeflateBlockAnimSteps(data, block);
            block.animSteps.stepOffset = animIndexOffset;
            animIndexOffset += block.animSteps.stepCount;

            block.animSteps.outputByteOffset = outputOffset;
            outputOffset += block.animSteps.outputByteCount;
        }
    }

}

function populateDeflateBlockAnimSteps(data: IDeflateData, block: IDeflateBlock) {
    let nSteps = 2 + block.hclen + block.codeLengthCoding.symbolCode.length + block.litLenCoding.symbolCode.length + block.distCoding.symbolCode.length;

    let type = new Uint8Array(nSteps);
    let outputIdx = new Uint32Array(nSteps);
    let outputCount = new Uint32Array(nSteps);

    function appendStep(t: AnimStepType, arrIndex: number, count: number) {
        type[offset] = t;
        outputIdx[offset] = outputOffset;
        outputCount[offset] = count;
        outputOffset += count;
        offset++;
    }

    let offset = 0;
    let outputOffset = 0;

    appendStep(AnimStepType.DeflateHeaderBits, 0, 0);
    appendStep(AnimStepType.HeaderLengths, 0, 0);

    for (let i = 0; i < block.hclen; i++) {
        appendStep(AnimStepType.CodeLength, i, 0);
    }

    for (let i = 0; i < block.codeLengthCoding.symbolCode.length; i++) {
        appendStep(AnimStepType.LitLenDistArray, i, 0);
    }

    let distIdx = 0;
    let litLenCoding = block.litLenCoding;
    for (let i = 0; i < litLenCoding.symbolCode.length; i++) {
        let outputLen = 1;
        let symbol = litLenCoding.symbolValue[i];
        if (symbol > 256) {
            // length code
            let symStartBit = litLenCoding.symbolStartBit[i];
            let symBitLen = litLenCoding.symbolBitLength[i];
            let extraBitLength = litLenCoding.extraBitLength[i];
            let extraBitsValue = readBits(data.src, symStartBit + symBitLen, extraBitLength);
            let len = lengthSymbolToLengthFromNumber(symbol, extraBitsValue);

            appendStep(AnimStepType.LitLen, i, 0);
            appendStep(AnimStepType.Dist, distIdx, len);
            distIdx++;

        } else {
            // literal or end of block
            outputLen = symbol === 256 ? 0 : 1;
            appendStep(AnimStepType.LitLen, i, outputLen);
        }
    }

    let steps: IAnimationSteps = {
        stepOffset: 0,
        outputByteOffset: 0,
        stepCount: nSteps,
        outputByteCount: outputOffset,
        arrType: type,
        arrOutputIdx: outputIdx,
        arrOutputCount: outputCount,
    };

    return steps;
}

export function createDeflateBlockInfo(renderState: IDeflateRenderState, blockState: IDeflateBlockState): IDeflateBlockInfo {
    let ctx = renderState.ctx;

    let data = renderState.data.src;
    let block = renderState.data.blocks[0];
    let symPos = renderState.symPos;

    let renderCtx = baseRenderCtx;

    let style = renderCtx.style;
    let lineIdx = 0;
    let colPos = 0;
    let colsPerLine = 500;

    let lineHeight = 16;
    let gapWidth = 8;

    let bitStreamFontBold = makeCanvasFont(style.bitsFontSize, true);
    let bitStreamFont = makeCanvasFont(style.bitsFontSize);
    let symFont = makeCanvasFont(style.symFontSize);

    ctx.textAlign = "start";
    ctx.textBaseline = "top";
    let coding = block.litLenCoding;
    let distCoding = block.distCoding;
    let nSymbols = coding.symbolValue.length;

    let bitCntr = coding.symbolStartBit[0];

    function maybeBumpLine() {
        if (colPos >= colsPerLine) {
            lineIdx += 2;
            colPos = 0;
        }
    }

    let symAndExtras: ISymAndExtra[] = [];

    function renderCode(coding: IPrefixCoding, i: number, extraInfo: (symbol: number, extraBits: number) => [symStr: string, color: string, extraBitsStr: string, extraBitsColor: string, symType: SymType]): number {
        let symbol = coding.symbolValue[i];
        let bitOffset = coding.symbolStartBit[i];
        let numBits = coding.symbolBitLength[i];
        let numExtraBits = coding.extraBitLength[i];

        while (bitOffset > bitCntr) {
            colPos += gapWidth;
            let nBits = Math.min(8, bitOffset - bitCntr);

            ctx.font = bitStreamFont;
            let bits = readBits(data, bitCntr, nBits);
            bitCntr += nBits;

            let bitStrRev = bitsToBinStr(reverseBits(bits, nBits), nBits);
            let strLen = ctx.measureText(bitStrRev).width;

            // ctx.fillStyle = "purple";
            // ctx.fillText(bitStrRev, colPos + strLen / 2, lineIdx * lineHeight);

            symAndExtras.push({
                tl: new Vec2(colPos, lineIdx * lineHeight),
                size: new Vec2(strLen, lineHeight),
                type: SymType.Unknown,
                sym: -1,
                startBit: bitCntr - nBits,
                symColor: "purple",
                extraColor: "black",
                codeWidth: nBits,
                codeExtraWidth: 0,
                symWidth: 0,
                symExtraWidth: 0,
                codeStr: bitStrRev,
                codeExtraStr: '',
                symStr: '',
                symExtraStr: '',
            });

            colPos += strLen;

            maybeBumpLine();
        }

        let code = coding.symbolCode[i];
        bitCntr += numBits;

        let extraBits = numExtraBits === 0 ? 0 : readBits(data, bitOffset + numBits, numExtraBits);
        bitCntr += numExtraBits;

        let codeStr = bitsToBinStr(code, numBits);
        let extraBitsRevStr = numExtraBits === 0 ? '' : bitsToBinStr(reverseBits(extraBits, numExtraBits), numExtraBits);

        let [symStr, color, extraBitsStr, extraBitsColor, symType] = extraInfo(symbol, extraBits);

        let hasGapBefore = colPos > 0;

        // render the bits
        ctx.font = bitStreamFont;
        let codeWidth = ctx.measureText(codeStr).width;
        let extraBitsWidth = ctx.measureText(extraBitsRevStr).width;
        ctx.font = symFont;
        let symStrWidth = ctx.measureText(symStr).width;
        let extraBitsStrWidth = ctx.measureText(extraBitsStr).width;

        colPos += hasGapBefore ? gapWidth : 0;

        let fullCodeWidth = codeWidth + extraBitsWidth;
        let fullSymWidth = symStrWidth + extraBitsStrWidth;

        let fullWidth = Math.max(fullCodeWidth, fullSymWidth);

        symAndExtras.push({
            tl: new Vec2(colPos, lineIdx * lineHeight),
            size: new Vec2(fullWidth, 1.6 * lineHeight),
            type: symType,
            sym: symbol,
            startBit: bitOffset,
            symColor: color,
            extraColor: "black",
            codeWidth: codeWidth,
            codeExtraWidth: extraBitsWidth,
            symWidth: symStrWidth,
            symExtraWidth: extraBitsStrWidth,
            codeStr: codeStr,
            codeExtraStr: extraBitsRevStr,
            symStr: symStr,
            symExtraStr: extraBitsStr,
        });

        colPos += Math.max(fullCodeWidth, fullSymWidth);

        return symbol;
    }

    let symIdx = Math.ceil(symPos);
    let sym_t = symPos - symIdx + 1;

    let highlight_t = inverseLerp(0.0, 0.6, sym_t);
    let moveSym_t = inverseLerp(0.6, 1.0, sym_t);

    let distIdx = 0;
    let litLenIdx = 0;
    let maxSymIdx = Math.min(symIdx, coding.symbolCode.length + distCoding.symbolCode.length - 1);
    let prevWasLen = false;

    for (let i = 0; i < maxSymIdx; i++) {
        if (!prevWasLen) {
            let symbol = renderCode(coding, litLenIdx++, (symbol, extraBits) => {
                let [color] = litLenStyle(style, symbol);
                let [symStr, extraBitsStr] = litLenResString(symbol, extraBits);

                return [symStr, color, extraBitsStr, 'black', symbol === 256 ? SymType.EOB : symbol > 256 ? SymType.Length : SymType.Literal];
            });
            prevWasLen = symbol > 256;
        } else {
            renderCode(distCoding, distIdx++, (symbol, extraBits) => {
                let [color] = distStyle(style, symbol);
                let [symStr, extraBitsStr] = distResString(symbol, extraBits);
                return [symStr, color, extraBitsStr, 'black', SymType.Dist];
            });
            prevWasLen = false;
        }

        maybeBumpLine();
    }

    let rectRanges: ICellRange[] = [];

    let nextRangeIdx = 0;
    let lastYPos = 0;
    for (let i = 0; i < symAndExtras.length; i++) {
        let { tl, type } = symAndExtras[i];
        // we'll render the rects here:
        let isNextLine = tl.y !== lastYPos;
        lastYPos = tl.y;
        let lastRange = rectRanges[rectRanges.length - 1];

        if (type === SymType.Dist) {
            if (isNextLine) {
                lastRange.isEnd = false;
                rectRanges.push({ firstCellIdx: i, lastCellIdx: i, rangeIdx: lastRange.rangeIdx, isStart: false, isEnd: true });
            } else {
                lastRange.lastCellIdx = i;
            }
        } else {
            rectRanges.push({ firstCellIdx: i, lastCellIdx: i, rangeIdx: nextRangeIdx++, isStart: true, isEnd: true });
        }
    }

    return { symAndExtras, rectRanges };
}

