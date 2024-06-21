
/*
We need to identify where in the process we're up to, ideally with an integer that we can index into.
(And it'll be a float to allow for transitions between states).

Our current idea of 1 index per symbol seems good, at least for the litLen & dist arrays, but note
that these two arrays are interleaved, which makes it difficult to do this precisely.

The codeLength array is small enough that we don't need to worry about it so much, and can just
evaluate it fully each render.

In general, we want to make these indexes bin-searchable, so we can figure out which block we're in,
how many blocks have been completed etc.

So there's a one-off post-process step, where we walk through the blocks and prefix codings, and set
start/length values for each block & symbol. We also create an array for each symbol, which maps to
an index in a particular prefix coding array.

So for a given dynamic block we might have:

1 step for the mode, 1 step for (hlit, hdist, hclen), 1 step for each of the codeLengths, 1 step
for each of the litLen & dist arrays.

It would work to put these in their own array, with type, idx, outputIdx, outputCount.
Might overload outputIdx/Count for the codeLengths as well, say? Based on type.

We'll need to decide what to render exactly. E.g. do we render a block opened, or collapsed, or many
blocks in a row?

Within a block, do we have a scrollbar? We'll have to do layout for the whole block processed so far
for this, but this can obviously be cached.
*/

import type { IOutputArrayState, IOutputArrayInfo } from "./renderOutputArray";
import type { IDeflateBlockState, IDeflateBlockInfo } from "./renderDeflateBlock";

export interface IDeflateData {
    src: Uint8Array;
    dest: Uint8Array;
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

    animSteps: IAnimationSteps;
}

export interface IDeflateRenderState {
    ctx: CanvasRenderingContext2D;
    symPos: number;
    data: IDeflateData;

    outputArrayState: IOutputArrayState;
    deflateBlockState: IDeflateBlockState;

    outputArrayInfo: IOutputArrayInfo;
    deflateBlockInfo: IDeflateBlockInfo;
}

export enum AnimStepType {
    DeflateHeaderBits,
    HeaderLengths,
    CodeLength,
    LitLenDistArray,
    LitLen,
    Dist,
}

export interface IAnimationSteps {
    stepOffset: number;
    outputByteOffset: number;
    stepCount: number;
    outputByteCount: number;

    // arrays for each anim step
    arrType: Uint8Array;
    arrOutputIdx: Uint32Array;
    arrOutputCount: Uint32Array;
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

