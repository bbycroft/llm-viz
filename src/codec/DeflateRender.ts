

import { Vec2 } from "../utils/vector";
import { bitsToBinStr, distBitOffsets, distBitsExtra, lengthBitOffsets, lengthBitsExtra, reverseBits } from "./DeflateDecoder";
import { IDeflateBlock, IPrefixCoding, IPrefixTree } from "./DeflateRenderModel";
import { lerp } from "../utils/math";
import { inverseLerp } from "../llm/walkthrough/Walkthrough04_SelfAttention";

function readBits(data: Uint8Array, bitOffset: number, nBits: number) {
    let byteOffset = bitOffset >> 3;
    let bitShift = bitOffset & 7;
    let bitMask = (1 << nBits) - 1;

    let lowBits = data[byteOffset] >>> bitShift;
    let highBits = data[byteOffset + 1] << (8 - bitShift);
    let bits = lowBits | highBits;

    if (nBits > 8) {
        let highBits2 = data[byteOffset + 2] << (16 - bitShift);
        bits |= highBits2;
    }
    if (nBits > 16) {
        let highBits3 = data[byteOffset + 3] << (24 - bitShift);
        bits |= highBits3;
    }

    return bits & bitMask;
}

interface IRenderCtx {

    style: IRenderStyle;
}

type IRenderStyle = typeof baseStyle;

let baseStyle = {
    bitsFontSize: 10,
    symFontSize: 12,

    litColor: "rgb(185, 28, 28)",
    lenColor: "rgb(22, 163, 74)",
    distColor: "rgb(37, 99, 235)",
    eobColor: "rgb(128, 0, 128)",
};

let baseRenderCtx: IRenderCtx = {
    style: baseStyle,
}

/*
Need to render rectangles around the codes, and across the dist + len codes. But need to render those
rects first, and then the text on top.

Which means deferring the text rendering. In particular, the blocks might extend over a new-line, so
need to have logic to handle that for rendering the rects.

We'll generate a list of blocks, based on text measurements, and then we'll render the rects, and then the text.
We'll trawl through that list for len/dist pairs, and render the rects distinctly for those.
*/

enum SymType {
    Literal,
    Length,
    EOB,
    Dist,
    CodeLen,
    Unknown,
}

interface ISymAndExtra {
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

interface ICellRange {
    rangeIdx: number; // ranges share the same index if they cross a line (& exactly one of them has isStart, and one has isEnd)
    firstCellIdx: number;
    lastCellIdx: number;
    isStart: boolean; // if false, wraps from prev line
    isEnd: boolean; // if false, wraps to next line
}

export function renderDeflate(ctx: CanvasRenderingContext2D, data: Uint8Array, block: IDeflateBlock, symPos: number) {
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
;
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

    // render the rectangles around each symbol
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < rectRanges.length; i++) {
        let range = rectRanges[i];
        let { firstCellIdx, lastCellIdx, rangeIdx, isStart, isEnd } = range;
        let { tl } = symAndExtras[firstCellIdx];
        let { tl: lastTl, size: lastSize } = symAndExtras[lastCellIdx];

        let rectWidth = lastTl.x + lastSize.x - tl.x;
        let rectHeight = lastTl.y + lastSize.y - tl.y;

        let rectX = tl.x - 2;
        let rectY = tl.y - 2;

        let radius = [0, 0, 0, 0];

        if (isStart) {
            radius[0] = radius[3] = 4;
        }

        if (isEnd) {
            radius[1] = radius[2] = 4;
        }

        let isLast = i === rectRanges.length - 1 && sym_t !== 1.0;
        if (isLast) {
            if (moveSym_t < 0.2) {
                continue;
            }
        }

        ctx.fillStyle = symAndExtras[firstCellIdx].symColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectWidth + 4, rectHeight, radius);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    let extraGapWidth = 0;

    // render the text (bits & text) in the rectangles, with special attention on the final symbol
    for (let i = 0; i < symAndExtras.length; i++) {
        let { tl, size, type, symColor, extraColor, codeWidth, codeExtraWidth, symWidth, symExtraWidth, codeStr, codeExtraStr, symStr, symExtraStr, startBit } = symAndExtras[i];

        let centerX = tl.x + size.x / 2;
        let fullCodeWidth = codeWidth + codeExtraWidth;
        let fullSymWidth = symWidth + symExtraWidth;
        let codeStart = centerX - fullCodeWidth / 2;
        let symStart = centerX - fullSymWidth / 2;

        let isLast = i === symAndExtras.length - 1 && sym_t !== 1.0;

        if (!isLast) {
            ctx.fillStyle = symColor;
            ctx.font = bitStreamFont;
            ctx.fillText(codeStr, codeStart, tl.y);

            ctx.fillStyle = extraColor;
            ctx.font = bitStreamFont;
            ctx.fillText(codeExtraStr, codeStart + codeWidth, tl.y);

            ctx.fillStyle = symColor;
            ctx.font = symFont;
            ctx.fillText(symStr, symStart, tl.y + 11);

            ctx.fillStyle = extraColor;
            ctx.font = symFont;
            ctx.fillText(symExtraStr, symStart + symWidth, tl.y + 11);
        } else {
            // we want to animate the bitStream going from its previous form to the new form
            // so we need to walk through codeStr & codeExtraStr bit-by-bit and add gaps at the
            // 8-bit chunks. This determines their original positions in the bitstream, and then we
            // lerp to their new positions.
            let fullStr = codeStr + codeExtraStr;

            ctx.save();
            let finalStartPos = codeStart;
            let initStartPos = tl.x;
            ctx.font = bitStreamFont;
            let bitLen = ctx.measureText(fullStr[0]).width;
            for (let i = 0; i < fullStr.length; i++) {
                // rendering char by char, as that's easiest for splitting/joining
                let c = fullStr[i];
                let bitPos = lerp(initStartPos, finalStartPos, moveSym_t);

                ctx.fillStyle = i < codeStr.length ? symColor : extraColor;

                if (highlight_t < 1.0) {
                    ctx.globalAlpha = lerp(0, 4, highlight_t);
                    // ctx.fillStyle = "black";
                    // ctx.filter = `blur(1px)`;
                    ctx.font = bitStreamFont;
                    ctx.fillText(c, bitPos, tl.y);
                    ctx.filter = '';
                    ctx.globalAlpha = 1;
                }

                ctx.fillText(c, bitPos, tl.y);

                let hasGap = (startBit + i) % 8 === 7;

                initStartPos += bitLen + (hasGap ? gapWidth : 0);
                finalStartPos += bitLen;
                extraGapWidth += hasGap ? gapWidth : 0;
            }

            extraGapWidth += tl.x - codeStart - gapWidth;
            ctx.restore();
        }
    }

    colPos += extraGapWidth  * (1 - moveSym_t);

    function getBoundaryBitRanges(startBit: number, bitStr: string): string[] {
        let ranges: string[] = [];
        let bitCntr = startBit;
        for (let i = 0; i < bitStr.length;) {
            let nextBoundary = (bitCntr + 7) & ~7;
            let nBits = nextBoundary - bitCntr;
            nBits = Math.min(nBits === 0 ? 8 : nBits, bitStr.length - i);
            bitCntr += nBits;
            ranges.push(bitStr.slice(i, i + nBits));
            i += nBits;
        }

        return ranges;
    }

    // after the last symbol, render the remaining bits, but only for a couple line's worth
    // we'll split them into 8-bit chunks, aligned to 8-bit boundaries
    for (let i = 0; i < 10; i++) {
        let nextBoundary = (bitCntr + 7) & ~7;
        let nBits = nextBoundary - bitCntr;
        nBits = nBits === 0 ? 8 : nBits;
        nBits = Math.min(nBits, data.length * 8 - bitCntr);

        let bits = readBits(data, bitCntr, nBits);
        bitCntr += nBits;
        let bitsRevStr = bitsToBinStr(reverseBits(bits, nBits), nBits);

        ctx.font = bitStreamFont;
        let strLen = ctx.measureText(bitsRevStr).width;
        colPos += colPos === 0 ? 0 : gapWidth;

        ctx.fillStyle = "rgb(120, 120, 120)";
        ctx.fillText(bitsRevStr, colPos, lineIdx * lineHeight);

        colPos += strLen;
        maybeBumpLine();
    }

    ctx.save();
    ctx.translate(colsPerLine + 80, 0);

    let lastSym = symAndExtras[symAndExtras.length - 1];

    renderCodingTree(ctx, coding.tree, {
        renderSymbol: (symbol) => {
            let [color] = litLenStyle(style, symbol);
            let defStr = litLenDefString(symbol);
            return [color, defStr];
        },
    }, lastSym.type === SymType.Literal || lastSym.type === SymType.Length ? lastSym.sym : -1);

    ctx.translate(0, 360);
    renderCodingTree(ctx, distCoding.tree, {
        renderSymbol: (symbol) => {
            let [color] = distStyle(style, symbol);
            let defStr = distDefString(symbol);
            return [color, defStr];
        },
    }, lastSym.type === SymType.Dist ? lastSym.sym : -1);

    ctx.restore();
}

function litLenStyle(style: IRenderStyle, symbol: number): [color: string, str: string, extraBitsColor: string] {
    let color = symbol === 256 ? style.eobColor : symbol > 256 ? style.lenColor : style.litColor;
    let symStr = literalSymbolString(symbol);
    return [color, symStr, 'black'];
}

function litLenDefString(symbol: number) {
    if (symbol === 256) {
        return "EOB";
    }
    if (symbol > 256) {
        let idx = symbol - 265;
        let nBits = idx >= 0 ? lengthBitsExtra[idx] : 0;
        let base = idx >= 0 ? lengthBitOffsets[idx] : symbol - 257 + 3;
        return `L=${base}${nBits > 0 ? '+' + nBits + 'b' : ''}`;
    }

    return literalSymbolString(symbol);
}

function litLenResString(symbol: number, extraBitsVal: number): [base: string, extra: string] {
    if (symbol <= 256) {
        return [litLenDefString(symbol), ''];
    } else {
        let idx = symbol - 265;
        let nBits = idx >= 0 ? lengthBitsExtra[idx] : 0;
        let base = idx >= 0 ? lengthBitOffsets[idx] : symbol - 257 + 3;
        let extraBitsStr = '';
        if (nBits > 0) {
            extraBitsStr = `+${extraBitsVal}`;
        }
        return [`L=${base}`, extraBitsStr];
    }
}

function distDefString(sym: number) {
    let nBits = distBitsExtra[sym];
    let base = distBitOffsets[sym];
    return `D=${base}${nBits > 0 ? '+' + nBits + 'b' : ''}`;
}

function distResString(symbol: number, extraBitsVal: number): [base: string, extra: string] {
    let nBits = distBitsExtra[symbol];
    let base = distBitOffsets[symbol];
    return [`D=${base}`, nBits > 0 ? '+' + extraBitsVal : ''];
}


function distStyle(style: IRenderStyle, symbol: number): [color: string, str: string, extraBitsColor: string] {
    let color = style.distColor;
    let symStr = distSymbolString(symbol);
    return [color, symStr, 'black'];
}

interface ICodingTreeArgs {
    renderSymbol: (symbol: number) => [color: string, symStr: string];
}

function renderCodingTree(ctx: CanvasRenderingContext2D, tree: IPrefixTree, args: ICodingTreeArgs, active: number = -1) {
    let maxBits = tree.maxBits;

    let codeWidth = 50;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let lineHeight = 16;
    let numRows = 0;

    let topYPos = lineHeight / 2 - 3;

    let xPos = 0;
    let yPos = topYPos;

    for (let sym of tree.usedSymbols) {

        let bitLength = tree.bitLengths[sym];
        let bits = tree.codes[sym];

        let bitStr = bitsToBinStr(bits, bitLength);
        let [color, symStr] = args.renderSymbol(sym);
        let glowColor = 'rgb(128, 128, 128)';

        let isActive = sym === active;

        ctx.font = makeCanvasFont(10);
        fillTextGlow(ctx, bitStr, xPos, yPos, color, glowColor, isActive ? 1 : 0);

        ctx.font = makeCanvasFont(12);
        fillTextGlow(ctx, sym.toString().padStart(3, ' ') + ' ' + symStr, xPos + codeWidth, yPos, color, glowColor, isActive ? 1 : 0);

        yPos += lineHeight;

        numRows++;
        if (numRows > 20) {
            numRows = 0;
            xPos += codeWidth + 90;
            yPos = topYPos;
        }
    }
}

function fillTextGlow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, glowColor: string, glowSize: number) {
    if (glowSize > 0) {
        ctx.fillStyle = glowColor;
        ctx.filter = `blur(${glowSize}px)`;
        ctx.fillText(text, x, y);
        ctx.filter = 'none';
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

function literalSymbolString(sym: number) {
    if (sym === 32) {
        return "\u2423";
    }
    if (sym === 256) {
        return "EOB";
    }
    if (sym < 39) {
        return String.fromCodePoint(0x2400 + sym);
    }
    if (sym < 127) {
        return String.fromCharCode(sym);
    }

    return sym.toString();
}

function distSymbolString(sym: number) {
    return sym.toString();
}

function makeCanvasFont(size: number, bold: boolean = false) {
    return `${size}px monospace ${bold ? 'bold' : ''}`;
}
