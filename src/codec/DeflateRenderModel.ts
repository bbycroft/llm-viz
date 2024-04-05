import { BoundingBox3d, Vec2, Vec3 } from "../utils/vector";

export interface IDeflateData {
    src: Uint8Array;
    blocks: IDeflateBlock[];
}

export interface IDeflateBlock {
    mode: DeflateBlockMode;

    // for dynamic blocks
    hlit: number;
    hdist: number;
    hclen: number;

    codeLengthCoding: IPrefixCoding;
    litLenCoding: IPrefixCoding;
    distCoding: IPrefixCoding; // interleaved with litLenCoding, i.e. after dist symbols
}

export enum DeflateBlockMode {
    Uncompressed = 0,
    Fixed = 1,
    Dynamic = 2,
}

export interface IPrefixCoding {
    // bit sequence to symbol, we'll put these in arrays for compactness
    // all relative to a global byte & bit offset in the src bitstream
    // byteOffset: number;
    // bitOffset: number;

    symbolStartBit: Uint32Array;
    symbolBitLength: Uint8Array;
    symbolCode: Uint16Array;
    extraBitLength: Uint8Array; // any numbers after the symbol (attached directly to the symbol)
    subInfoBitLength: Uint8Array; // the dist coding (dist symbol + dist extra bits)
    symbolValue: Uint16Array; // the symbol value, i.e. the index into the tree.codes/tree.bitLengths array

    tree: IPrefixTree;
}

// symbols just map to 0 - n, so symbol value is just the index into these arrays
export interface IPrefixTree {
    maxBits: number;
    codes: Uint16Array;
    bitLengths: Uint8Array;

    usedSymbols: Uint16Array; // the list of symbols actually used in the tree
}



// export interface ICode {
//     tl: Vec2;
//     size: Vec2;
//     code: number;
//     text: string;
//     nBits: number;
//     color: string;

//     extraBits: number;
//     nExtraBits: number;


// }
