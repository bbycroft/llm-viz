
export type IRenderStyle = typeof baseRenderStyle;

export const baseRenderStyle = {
    bitsFontSize: 10,
    symFontSize: 12,

    litColor: "rgb(185, 28, 28)",
    lenColor: "rgb(22, 163, 74)",
    distColor: "rgb(37, 99, 235)",
    eobColor: "rgb(128, 0, 128)",
};

export function readBits(data: Uint8Array, bitOffset: number, nBits: number) {
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


// starting with code 265, as that's the first one with extra bits
export let lengthBitsExtra = new Uint8Array([
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
    4, 4, 4, 4,
    5, 5, 5, 5,
    0, 0, 0,
]);

export let lengthBitOffsets = new Uint16Array([11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 259, 260]);

export let distBitsExtra = new Uint8Array([
    0, 0, 0, 0,
    1, 1, 2, 2,
    3, 3, 4, 4,
    5, 5, 6, 6,
    7, 7, 8, 8,
    9, 9, 10, 10,
    11, 11, 12, 12,
    13, 13,
]);

export let distBitOffsets = makeOffsetsFromBitsExtra(distBitsExtra, 1);

export function makeOffsetsFromBitsExtra(bitsExtra: Uint8Array, offset = 0) {
    let arr = new Uint16Array(bitsExtra.length);
    for (let i = 0; i < bitsExtra.length; i++) {
        let nBits = bitsExtra[i];
        arr[i] = offset;
        offset += 1 << nBits;
    }
    return arr;
}


export function makeCanvasFont(size: number, bold: boolean = false) {
    return `${size}px monospace ${bold ? 'bold' : ''}`;
}

export function literalSymbolString(sym: number) {
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

export function distSymbolString(sym: number) {
    return sym.toString();
}


export function litLenStyle(style: IRenderStyle, symbol: number): [color: string, str: string, extraBitsColor: string] {
    let color = symbol === 256 ? style.eobColor : symbol > 256 ? style.lenColor : style.litColor;
    let symStr = literalSymbolString(symbol);
    return [color, symStr, 'black'];
}

export function litLenDefString(symbol: number) {
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

export function litLenResString(symbol: number, extraBitsVal: number): [base: string, extra: string] {
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

export function distDefString(sym: number) {
    let nBits = distBitsExtra[sym];
    let base = distBitOffsets[sym];
    return `D=${base}${nBits > 0 ? '+' + nBits + 'b' : ''}`;
}

export function distResString(symbol: number, extraBitsVal: number): [base: string, extra: string] {
    let nBits = distBitsExtra[symbol];
    let base = distBitOffsets[symbol];
    return [`D=${base}`, nBits > 0 ? '+' + extraBitsVal : ''];
}


export function distStyle(style: IRenderStyle, symbol: number): [color: string, str: string, extraBitsColor: string] {
    let color = style.distColor;
    let symStr = distSymbolString(symbol);
    return [color, symStr, 'black'];
}
