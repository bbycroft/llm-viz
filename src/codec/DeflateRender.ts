

import { Vec2 } from "../utils/vector";
import { bitsToBinStr, distBitOffsets, distBitsExtra, lengthBitOffsets, lengthBitsExtra, reverseBits } from "./DeflateDecoder";
import { IDeflateBlock, IPrefixCoding, IPrefixTree } from "./DeflateRenderModel";

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
    LitLen,
    Dist,
    CodeLen,
}

interface ISymAndExtra {
    tl: Vec2;
    size: Vec2;
    type: SymType;
    symColor: string;
    extraColor: string;
    codeLen: number;
    codeExtraLen: number;
    symLen: number;
    symExtraLen: number;
    codeStr: string;
    codeExtraStr: string;
    symStr: string;
    symExtraStr: string;
}

export function renderDeflate(ctx: CanvasRenderingContext2D, data: Uint8Array, block: IDeflateBlock) {
    let renderCtx = baseRenderCtx;

    let style = renderCtx.style;
    let lineIdx = 0;
    let colPos = 0;
    let colsPerLine = 500;

    let lineHeight = 16;
    let gapWidth = 6;

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

    let distIdx = 0;

    function renderCode(coding: IPrefixCoding, i: number, extraInfo: (symbol: number, extraBits: number) => [symStr: string, color: string, extraBitsStr: string, extraBitsColor: string]): number {
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

            ctx.fillStyle = "purple";
            ctx.fillText(bitStrRev, colPos + strLen / 2, lineIdx * lineHeight);
            colPos += strLen;

            maybeBumpLine();
        }

        let code = coding.symbolCode[i];
        bitCntr += numBits;

        let extraBits = numExtraBits === 0 ? 0 : readBits(data, bitOffset + numBits, numExtraBits);
        bitCntr += numExtraBits;

        let codeStr = bitsToBinStr(code, numBits);
        let extraBitsRevStr = numExtraBits === 0 ? '' : bitsToBinStr(reverseBits(extraBits, numExtraBits), numExtraBits);

        let [symStr, color, extraBitsStr, extraBitsColor] = extraInfo(symbol, extraBits);

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

        let center = colPos + Math.max(fullCodeWidth, fullSymWidth) / 2;
        let codeStart = center - fullCodeWidth / 2;
        let strStart = center - fullSymWidth / 2;

        ctx.fillStyle = color;
        ctx.font = bitStreamFont;
        ctx.fillText(codeStr, codeStart, lineIdx * lineHeight);
        ctx.fillStyle = "black";
        ctx.fillText(extraBitsRevStr, codeStart + codeWidth, lineIdx * lineHeight);

        ctx.fillStyle = color;
        ctx.font = symFont;
        ctx.fillText(symStr, strStart, lineIdx * lineHeight + 11);
        ctx.fillStyle = extraBitsColor;
        ctx.fillText(extraBitsStr, strStart + symStrWidth, lineIdx * lineHeight + 11);

        colPos += Math.max(fullCodeWidth, fullSymWidth);

        return symbol;
    }

    for (let i = 0; i < nSymbols; i++) {
        let symbol = renderCode(coding, i, (symbol, extraBits) => {
            let [color] = litLenStyle(style, symbol);
            let [symStr, extraBitsStr] = litLenResString(symbol, extraBits);

            return [symStr, color, extraBitsStr, 'black'];
        });

        maybeBumpLine();

        if (symbol > 256) {
            renderCode(distCoding, distIdx, (symbol, extraBits) => {
                let [color] = distStyle(style, symbol);
                let [symStr, extraBitsStr] = distResString(symbol, extraBits);
                return [symStr, color, extraBitsStr, 'black'];
            });

            distIdx++;
        }

        maybeBumpLine();
    }

    ctx.save();
    ctx.translate(colsPerLine + 56, 0);

    renderCodingTree(ctx, coding.tree, {
        renderSymbol: (symbol) => {
            let [color] = litLenStyle(style, symbol);
            let defStr = litLenDefString(symbol);
            return [color, defStr];
        },
    });

    ctx.translate(0, 360);
    renderCodingTree(ctx, distCoding.tree, {
        renderSymbol: (symbol) => {
            let [color] = distStyle(style, symbol);
            let defStr = distDefString(symbol);
            return [color, defStr];
        },
    });


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
    if (symbol >= 256) {
        let idx = symbol - 265;
        let nBits = idx >= 0 ? lengthBitsExtra[idx] : 0;
        let base = idx >= 0 ? lengthBitOffsets[idx] : symbol - 257 + 3;
        return `L=${base}${nBits > 0 ? '+' + nBits + 'b' : ''}`;
    }

    return literalSymbolString(symbol);
}

function litLenResString(symbol: number, extraBitsVal: number): [base: string, extra: string] {
    if (symbol < 256) {
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

function renderCodingTree(ctx: CanvasRenderingContext2D, tree: IPrefixTree, args: ICodingTreeArgs) {
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

        ctx.font = "10px monospace";
        ctx.fillStyle = "black";
        ctx.fillText(bitStr, xPos, yPos);

        let [color, symStr] = args.renderSymbol(sym);
        ctx.font = "12px monospace";
        ctx.fillStyle = color;
        ctx.fillText(sym.toString().padStart(3, ' ') + ' ' + symStr, xPos + codeWidth, yPos);

        yPos += lineHeight;

        numRows++;
        if (numRows > 20) {
            numRows = 0;
            xPos += codeWidth + 90;
            yPos = topYPos;
        }
    }
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

function makeCanvasFont(size: number) {
    return `${size}px monospace`;
}
