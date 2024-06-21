
// each bit goes left or right in the tree
// so have to look at each bit in the data, and follow the tree
import { AnimStepType, DeflateBlockMode, IAnimationSteps, IDeflateBlock, IDeflateData, IPrefixCoding } from "./DeflateRenderModel";
import { distBitOffsets, distBitsExtra, lengthBitOffsets, lengthBitsExtra } from "./deflateRenderHelpers";

// does this lend itself to some neat data structure?
// could just flatten it out?
// the spec for DEFLATE says there's max 15 bits for a code, so that's 2^15 = 32k entries
// so it's not too bad to just have a flat array
// and most likely, the max length of a code is much less than 15 bits

// but the principal (I think), is that we can flatten it out, ignoring the latter bits, by mapping
// many entries to the same node

// what's in our tree entry? Well we need to know the symbol value, as well as the number of actual
// bits in the code.
// Let's index into a lookup table, and that array will have the symbol value, and the number of bits

// if our code lengths are 15 bits, can we split it into 8 bits and 7 bits?
// "Shorter codes lexicographically precede longer codes."
// Well I guess what we can do is have a table for the first 8 bits, and then use a full 15bit table
// for the rest
// We can do a single comparison of those 8 bits to decide if it's in the larger table

export interface IPrefixTree {
    // is 2^n entries, where n is the max number of bits in a code (up to 15 = 32k entries)
    // values are index into the bitLength & symbol arrays
    lookup: Uint16Array;

    code: Uint16Array;
    bitLength: Uint8Array;
    symbol: Uint16Array; // symbols go from 0 to 286 (0-255 for literals, 256 for end of block, 257-285 for length codes), and 0-29 for distance codes
    highOffset: Uint16Array;

    maxBits: number;
    bitMask: number;
    numSymbols: number;

    lookupHigh: Uint8Array;
}

export interface IBitStream {
    data: Uint8Array;

    startBitsteam(): void; // needed after any byte operations, for peek24Bits & advance to work
    peek24Bits(): number;
    advance(bits: number): void;
    readBits(bits: number): number;

    skipToByteBoundary(): void;
    readByte(): number;
    skipNBytes(n: number): void;

    getOffset(): number;
    getBitOffset(): number;
}

interface IOutputBuffer {
    buffer: Uint8Array;
    dataView: DataView;
    offset: number;
}

function createOutputBuffer(): IOutputBuffer {
    let buffer = new Uint8Array(1024);
    return {
        buffer,
        dataView: new DataView(buffer.buffer),
        offset: 0,
    };
}

function ensureOutputBuffer(output: IOutputBuffer, nBytes: number) {
    if (output.offset + nBytes >= output.buffer.length) {
        let oldBuffer = output.buffer;
        output.buffer = new Uint8Array(oldBuffer.length * 2);
        output.buffer.set(oldBuffer);
        output.dataView = new DataView(output.buffer.buffer);
    }
}

function writeByteToOutputBuffer(output: IOutputBuffer, byte: number) {
    ensureOutputBuffer(output, 1);
    output.buffer[output.offset++] = byte;
}

function decodePrefixSymbols(stream: IBitStream, tree: IPrefixTree) {
    for (let i = 0; i < 10; i++) {
        let symbol = readSymbol(stream, tree);
    }
}

enum GzipFlags {
    FTEXT = 1 << 0,
    FHCRC = 1 << 1,
    FEXTRA = 1 << 2,
    FNAME = 1 << 3,
    FCOMMENT = 1 << 4,
}

enum GzipExtraFlags {
}

interface IGzipResult {
    fname: string;
    comment: string;
    data: Uint8Array;
    error?: string;
}

function readGzip(stream: IBitStream, renderData?: IDeflateData): IGzipResult {
    stream.skipToByteBoundary();
    let magic0 = stream.readByte();
    let magic1 = stream.readByte();
    let cm = stream.readByte(); // compression method
    let flags = stream.readByte() as GzipFlags;

    let result: IGzipResult = {
        fname: '',
        comment: '',
        data: new Uint8Array(0),
    };

    if (magic0 !== 0x1f || magic1 !== 0x8b) {
        result.error = `Not a gzip file: invalid magic bytes: (0x${magic0.toString(16).padStart(2)} 0x${magic1.toString(16).padStart(2)}). Expected (0x1f 0x8b).`;
        return result;
    }

    let mtime = 0;
    for (let i = 0; i < 4; i++) {
        mtime |= stream.readByte() << (i * 8);
    }

    let extraFlags = stream.readByte() as GzipExtraFlags;
    let os = stream.readByte();

    if (flags & GzipFlags.FEXTRA) {
        let xlen = stream.readByte() | (stream.readByte() << 8);
        stream.skipNBytes(xlen);
    }

    if (flags & GzipFlags.FNAME) {
        let a: number;
        while ((a = stream.readByte()) !== 0) {
            result.fname += String.fromCharCode(a);
        };
    }

    if (flags & GzipFlags.FCOMMENT) {
        let a: number;
        while ((a = stream.readByte()) !== 0) {
            result.comment += String.fromCharCode(a);
        };
    }

    if (flags & GzipFlags.FHCRC) {
        stream.skipNBytes(2);
    }

    console.log(`magic: ${magic0.toString(16).padStart(2)} ${magic1.toString(16).padStart(2)}, cm: ${cm}, flags: ${flags}, mtime: ${mtime}, extraFlags: ${extraFlags}, os: ${os}, fname: '${result.fname}', comment: '${result.comment}'`);

    stream.startBitsteam();

    let inflateOutput = createOutputBuffer();

    readDeflate(stream, inflateOutput, renderData);

    result.data = inflateOutput.buffer.subarray(0, inflateOutput.offset);

    return result;
}

function readDeflate(stream: IBitStream, inflateOutput: IOutputBuffer, renderData?: IDeflateData) {
    // first look at the block!
    let blockHeaderBits = stream.readBits(3);

    let lastBlock = (blockHeaderBits & 1) !== 0;
    let blockType = (blockHeaderBits >> 1) & 3;
    console.log('blockType', blockType, 'lastBlock', lastBlock);

    if (blockType === 0) {
        readUncompressedBlock(stream, inflateOutput);
    }

    if (blockType === 1) {
        readFixedHuffmanBlock(stream, inflateOutput);
    }

    if (blockType === 2) {
        readDynamicHuffmanBlock(stream, inflateOutput, renderData);
    }
}

function readUncompressedBlock(stream: IBitStream, inflateOutput: IOutputBuffer) {
    stream.skipToByteBoundary();
    let len = stream.readByte() | (stream.readByte() << 8);
    let nlen = stream.readByte() | (stream.readByte() << 8);

    ensureOutputBuffer(inflateOutput, len);
    for (let i = 0; i < len; i++) {
        inflateOutput.buffer[inflateOutput.offset++] = stream.readByte();
    }

    stream.startBitsteam();
}

function readFixedHuffmanBlock(stream: IBitStream, inflateOutput: IOutputBuffer) {
    let lengths = new Uint8Array(288);
    for (let i = 0; i < 144; i++) {
        lengths[i] = 8;
    }
    for (let i = 144; i < 256; i++) {
        lengths[i] = 9;
    }
    for (let i = 256; i < 280; i++) {
        lengths[i] = 7;
    }
    for (let i = 280; i < 288; i++) {
        lengths[i] = 8;
    }

    let symbols = new Uint16Array(288);
    for (let i = 0; i < 288; i++) {
        symbols[i] = i;
    }

    let literalAndLengthTree = buildPrefixTree(lengths, symbols);

    for (let cntr = 0; cntr < 60; cntr++) {
        let symbol = readSymbol(stream, literalAndLengthTree);

        if (symbol === 256) {
            break;
        }
        if (symbol < 256) {
            writeByteToOutputBuffer(inflateOutput, symbol);
        } else {
            let len = lengthSymbolToLength(symbol, stream);

            let distSymbol = stream.readBits(5);
            let dist = distSymbolToDistance(distSymbol, stream);

            ensureOutputBuffer(inflateOutput, len);
            let buf = inflateOutput.buffer;
            for (let i = 0; i < len; i++) {
                buf[inflateOutput.offset] = buf[inflateOutput.offset - dist];
                inflateOutput.offset++;
            }
        }
    }
}

const litPlusDistMax = 286 + 30;

const codeLengthOrder = new Uint16Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
]);

function readDynamicHuffmanBlock(stream: IBitStream, inflateOutput: IOutputBuffer, renderData?: IDeflateData) {

    let hlit = stream.readBits(5) + 257; // number of literal/length codes (not all of the length codes are used) (257-286)
    let hdist = stream.readBits(5) + 1; // number of distance codes (1-32)
    let hclen = stream.readBits(4) + 4; // number of code length codes (4-19)

    let codeLengthSym = new Uint16Array(19);
    for (let i = 0; i < 19; i++) {
        codeLengthSym[i] = i;
    }

    let codeLengths = new Uint8Array(19);
    for (let i = 0; i < hclen; i++) {
        codeLengths[codeLengthOrder[i]] = stream.readBits(3);
    }

    let codeLengthTree = buildPrefixTree(codeLengths, codeLengthSym);

    let lengths = new Uint8Array(hlit + hdist);
    let symbols = new Uint16Array(hlit + hdist);

    for (let i = 0; i < hlit; i++) {
        symbols[i] = i; // literal/length codes alphabet
    }
    for (let i = 0; i < hdist; i++) {
        symbols[i + hlit] = i; // distance codes alphabet
    }

    let codeLengthsSymbolOutput = renderData && createOutputBuffer();

    readCodeLengths(stream, codeLengthTree, lengths, hlit + hdist, codeLengthsSymbolOutput);

    let literalAndLengthTree = buildPrefixTree(lengths.subarray(0, hlit), symbols.subarray(0, hlit));
    let distanceTree = buildPrefixTree(lengths.subarray(hlit), symbols.subarray(hlit));

    let symbolOutput = renderData && createOutputBuffer();
    let distSymbolOutput = renderData && createOutputBuffer();

    let complete = false;
    for (let cntr = 0; cntr < 200 && !complete; cntr++) {
        let bitOffset = symbolOutput ? stream.getBitOffset() : 0;
        let symbol = readSymbol(stream, literalAndLengthTree);

        let nExtraBits = 0;
        let nDistTotalBits = 0;

        if (symbol === 256) {
            complete = true; // end of block
        }
        if (symbol < 256) {
            ensureOutputBuffer(inflateOutput, 1);
            inflateOutput.buffer[inflateOutput.offset++] = symbol;
        } else {
            nExtraBits = symbol < 265 ? 0 : lengthBitsExtra[symbol - 265];
            let len = lengthSymbolToLength(symbol, stream);

            let distBitOffset = codeLengthsSymbolOutput ? stream.getBitOffset() : 0;
            let distSymbol = readSymbol(stream, distanceTree);

            let nDistExtraBits = distBitsExtra[distSymbol];
            let dist = distSymbolToDistance(distSymbol, stream);

            distSymbolOutput && addSymbolToOutputBuffer(distSymbolOutput, distSymbol, distBitOffset, nDistExtraBits, 0);

            nDistTotalBits = stream.getBitOffset() - distBitOffset;

            ensureOutputBuffer(inflateOutput, len);
            let buf = inflateOutput.buffer;
            let offset = inflateOutput.offset;
            for (let i = 0; i < len; i++) {
                buf[offset] = buf[offset - dist];
                offset++;
            }
            inflateOutput.offset = offset;
        }

        symbolOutput && addSymbolToOutputBuffer(symbolOutput, symbol, bitOffset, nExtraBits, nDistTotalBits);
    }

    if (renderData) {
        let blockRenderData: IDeflateBlock = {
            mode: DeflateBlockMode.Dynamic,
            hlit: hlit,
            hdist: hdist,
            hclen: hclen,
            codeLengthCoding: toRenderCoding(codeLengthsSymbolOutput!, codeLengthTree),
            distCoding: toRenderCoding(distSymbolOutput!, distanceTree),
            litLenCoding: toRenderCoding(symbolOutput!, literalAndLengthTree),
            animSteps: null!,
        };
        renderData.blocks.push(blockRenderData);
    }
}

function addSymbolToOutputBuffer(output: IOutputBuffer, symbol: number, bitOffset: number, nExtraBits: number, nSubBits: number) {
    ensureOutputBuffer(output, 8);
    let view = output.dataView;
    let offset = output.offset;
    view.setUint32(offset, bitOffset, true);
    view.setUint16(offset + 4, symbol, true);
    view.setUint8(offset + 6, nExtraBits);
    view.setUint8(offset + 7, nSubBits);
    output.offset += 8;
}

function toRenderCoding(symbolBuffer: IOutputBuffer, tree: IPrefixTree): IPrefixCoding {
    let numSymbols = symbolBuffer.offset >>> 3;
    let symbolValue = new Uint16Array(numSymbols);
    let symbolBitLength = new Uint8Array(numSymbols);
    let symbolCode = new Uint16Array(numSymbols);
    let symbolStartBit = new Uint32Array(numSymbols);
    let extraBitLength = new Uint8Array(numSymbols);
    let subInfoBitLength = new Uint8Array(numSymbols);

    let renderTree = toRenderTree(tree);

    for (let i = 0; i < numSymbols; i++) {
        let baseIdx = i * 8;
        let bitOffset = symbolBuffer.dataView.getUint32(baseIdx + 0, true);
        let symbol = symbolBuffer.dataView.getUint16(baseIdx + 4, true);
        let extraBits = symbolBuffer.dataView.getUint8(baseIdx + 6);
        let subBits = symbolBuffer.dataView.getUint8(baseIdx + 7);

        if (symbol === 268) {
            console.log(`For symbol 268, bitOffset: ${bitOffset}, extraBits: ${extraBits}, subBits: ${subBits}`);
        }

        symbolStartBit[i] = bitOffset;
        symbolValue[i] = symbol;
        extraBitLength[i] = extraBits;
        subInfoBitLength[i] = subBits;
        symbolBitLength[i] = renderTree.bitLengths[symbol];
        symbolCode[i] = renderTree.codes[symbol];

    }

    function toRenderTree(tree: IPrefixTree): IPrefixCoding["tree"] {
        let codes = new Uint16Array(tree.numSymbols);
        let bitLengths = new Uint8Array(tree.numSymbols);

        // unused symbols will leave the bitLength as 0
        for (let i = 0; i < tree.symbol.length; i++) {
            let symbol = tree.symbol[i];
            codes[symbol] = tree.code[i];
            bitLengths[symbol] = tree.bitLength[i];
        }

        return {
            maxBits: tree.maxBits,
            codes: codes,
            bitLengths: bitLengths,
            usedSymbols: tree.symbol,
       };
    }

    return {
        // byteOffset: 0,
        // bitOffset: 0,
        symbolStartBit,
        symbolBitLength,
        symbolCode,
        extraBitLength,
        subInfoBitLength,
        symbolValue,
        tree: renderTree,
    };
}


function lengthSymbolToLength(symbol: number, stream: IBitStream) {
    if (symbol <= 264) {
        return symbol - 257 + 3;
    }
    let idx = symbol - 265;
    return lengthBitOffsets[idx] + stream.readBits(lengthBitsExtra[idx]);
}

export function lengthSymbolToLengthFromNumber(symbol: number, extraBits: number) {
    if (symbol <= 264) {
        return symbol - 257 + 3;
    }
    let idx = symbol - 265;
    return lengthBitOffsets[idx] + (extraBits & ((1 << lengthBitsExtra[idx]) - 1));
}


function distSymbolToDistance(symbol: number, stream: IBitStream) {
    return distBitOffsets[symbol] + stream.readBits(distBitsExtra[symbol]);
}

export function bitsToBinStr(bits: number, nBits: number) {
    return bits.toString(2).padStart(nBits, '0');
}

function readCodeLengths(stream: IBitStream, tree: IPrefixTree, lengthsOut: Uint8Array, numEntries: number, distSymbolOutput?: IOutputBuffer) {
    for (let i = 0; i < numEntries;) {
        let bitOffset = distSymbolOutput ? stream.getBitOffset() : 0;
        let symbol = readSymbol(stream, tree);

        let extraBitsRead = 0;

        if (symbol < 16) {
            lengthsOut[i++] = symbol;
        } else if (symbol === 16) {
            let prev = lengthsOut[i - 1];
            let repeat = stream.readBits(2) + 3;
            for (let j = 0; j < repeat; j++) {
                lengthsOut[i++] = prev;
            }
            extraBitsRead = 2;
        } else if (symbol === 17) {
            let repeat = stream.readBits(3) + 3;
            for (let j = 0; j < repeat; j++) {
                lengthsOut[i++] = 0;
            }
            extraBitsRead = 3;
        } else if (symbol === 18) {
            let repeat = stream.readBits(7) + 11;
            for (let j = 0; j < repeat; j++) {
                lengthsOut[i++] = 0;
            }
            extraBitsRead = 7;
        } else {
            // invalid!!
            i++;
        }

        distSymbolOutput && addSymbolToOutputBuffer(distSymbolOutput, symbol, bitOffset, extraBitsRead, 0);
    }
}

function symbolToStr(symbol: number) {
    if (symbol < 129) {
        return String.fromCharCode(symbol).replace('\n', '\\n');
    }
    return symbol.toString();
}

const MAX_BITS = 15;

function buildPrefixTree(lengths: Uint8Array, symbols: Uint16Array) {
    // let's first pretend we don't have lookupHigh, and just make the lookup array really big

    // and we'll copy the logic from the rfc, which will probably suggest how to build the tree!

    let bitLengthCount = new Uint16Array(MAX_BITS + 1); // max 15 bits for a code
    let nextCode = new Uint16Array(MAX_BITS + 1);
    let codes = new Uint16Array(lengths.length);
    let symbolToIndex = new Uint16Array(lengths.length);
    let numUsedCodes = 0;
    let maxBitLength = 0;

    for (let i = 0; i < lengths.length; i++) {
        let len = lengths[i];
        bitLengthCount[len]++;
        if (len !== 0) {
            symbolToIndex[i] = numUsedCodes++;
        }
        maxBitLength = Math.max(maxBitLength, len);
    }

    let code = 0;
    bitLengthCount[0] = 0;
    for (let bits = 1; bits <= maxBitLength; bits++) {
        code = (code + bitLengthCount[bits - 1]) << 1;
        nextCode[bits] = code;
    }

    for (let i = 0; i < lengths.length; i++) {
        let len = lengths[i];
        if (len !== 0) {
            codes[i] = nextCode[len]++;
        }
    }

    // console.log([...codes]);

    let tree: IPrefixTree = {
        maxBits: maxBitLength,
        bitMask: (1 << maxBitLength) - 1,
        numSymbols: lengths.length,

        // the entries that the lookup table indexes into
        symbol: new Uint16Array(numUsedCodes),
        bitLength: new Uint8Array(numUsedCodes),
        code: new Uint16Array(numUsedCodes),

        // the lookup table for matching against the stream data
        lookup: new Uint16Array(1 << maxBitLength),

        // unused for now! but an approach for handling longer codes without a huge lookup table
        highOffset: new Uint16Array(0),
        lookupHigh: new Uint8Array(0),
    };

    // first we'll fill out the entries...
    for (let i = 0; i < lengths.length; i++) {
        let len = lengths[i];
        if (len !== 0) {
            let idx = symbolToIndex[i];
            tree.bitLength[idx] = len;
            tree.symbol[idx] = symbols[i];
            tree.code[idx] = codes[i];
        }
    }

    // and then we'll construct the lookup table
    for (let i = 0; i < lengths.length; i++) {
        let len = lengths[i];
        if (len !== 0) {
            let idx = symbolToIndex[i];
            // let's say this is a 3 bit code, and the maxBitLength is 7
            // we want to repeat this code 2^4 = 16 times (the 4 comes from 7 - 3)
            // issue: the bit order is reversed! The MSB of the code is the first bit in the stream (which is the LSB of the bitsteam)

            let codeRev = reverseBits(codes[i], len);

            let repeatShift = len;
            let numRepeats = 1 << (maxBitLength - len);
            for (let j = 0; j < numRepeats; j++) {
                let code = codeRev | (j << repeatShift);
                tree.lookup[code] = idx;
            }
        }
    }

    return tree;
}

function logPrefixTree(tree: IPrefixTree, renderSymbol?: (symbol: number) => string) {
    let str = 'Tree:\n';
    for (let i = 0; i < tree.symbol.length; i++) {
        let code = tree.code[i];
        let nBits = tree.bitLength[i];
        let symbol = tree.symbol[i];

        let symbolStr = renderSymbol ? renderSymbol(symbol) : symbol.toString();
        let bitStr = bitsToBinStr(code, nBits);

        str += `  ${symbol.toString().padEnd(4)}: ${bitStr.padEnd(tree.maxBits)} (${nBits}): ${symbolStr}\n`;
    }

    console.log(str);
}

export function reverseBits(v: number, numBits: number) {
    v = ((v >> 1) & 0x5555) | ((v & 0x5555) << 1); // swap odd and even bits
    v = ((v >> 2) & 0x3333) | ((v & 0x3333) << 2); // swap consecutive pairs
    v = ((v >> 4) & 0x0F0F) | ((v & 0x0F0F) << 4); // swap nibbles ...
    v = ((v >> 8) & 0x00FF) | ((v & 0x00FF) << 8); // swap bytes

    return v >> (16 - numBits);
}

function readSymbol(stream: IBitStream, tree: IPrefixTree) {
    let bits = stream.peek24Bits();
    let entryIdx = tree.lookup[bits & tree.bitMask];
    let bitLength = tree.bitLength[entryIdx];
    stream.advance(bitLength);
    return tree.symbol[entryIdx];
}

export function createBitStream(data: Uint8Array): IBitStream {
    let bitOffset = 0;
    let offset = 0;
    let buffer: number = 0;

    function advance(bitCount: number) {
        buffer >>>= bitCount;
        bitOffset += bitCount;
        offset += bitOffset >> 3;
        bitOffset &= 7;

        let shift = (8 - bitOffset);
        buffer |= data[offset + 1] << shift;
        buffer |= data[offset + 2] << (shift + 8);
        buffer |= data[offset + 3] << (shift + 16);
    }

    function skipToByteBoundary() {
        if (bitOffset !== 0) {
            advance(8 - bitOffset);
        }
    }

    function startBitsteam() {
        buffer |= data[offset];
        advance(0);
    }

    return {
        peek24Bits() {
            return buffer;
        },
        advance,
        skipToByteBoundary,
        readByte() {
            return data[offset++];
        },
        readBits(n: number) {
            let bits = buffer & ((1 << n) - 1);
            advance(n);
            return bits;
        },
        skipNBytes(n: number) {
            offset += n;
        },
        startBitsteam,
        data: data,
        getOffset() { return offset; },
        getBitOffset() { return offset * 8 + bitOffset; },
    };
}

export function testCodeExpansion() {
    let lengths = new Uint8Array([3, 3, 3, 3, 3, 2, 4, 4]);
    let symbols = new Uint16Array(lengths.length);

    for (let i = 0; i < lengths.length; i++) {
        symbols[i] = 'A'.charCodeAt(0) + i;
    }

    let tree = buildPrefixTree(lengths, symbols);
}

export function testBitStream() {
    let numBytes = 12;
    let data = new Uint8Array(numBytes);

    for (let i = 0; i < numBytes; i++) {
        data[i] = 0b10110000 + i;
    }

    let stream = createBitStream(data);

    let str0 = '';
    for (let i = 0; i < numBytes; i++) {
        for (let j = 0; j < 8; j++) {
            str0 += (data[i] & (1 << j)) ? '1' : '0';
        }
        str0 += ' ';
    }

    let str1 = '';
    for (let i = 0; i < 8 * numBytes; i++) {
        let bits = stream.peek24Bits();
        str1 += (bits & 1) ? '1' : '0';
        stream.advance(1);
        if (i % 8 === 7) {
            str1 += ' ';
        }
    }

    let stream2 = createBitStream(data);
    let str2 = '';
    for (let i = 0; i < 4 * numBytes; i++) {
        let bits = stream2.peek24Bits();
        str2 += (bits & 1) ? '1' : '0';
        str2 += (bits & 2) ? '1' : '0';
        stream2.advance(2);
        if (i % 4 === 3) {
            str2 += ' ';
        }
    }

    // console.log(str0);
    // console.log(str1);
    // console.log(str2);

    console.clear();
    // testCodeExpansion();

    testGzipFile();
}

let origFileText = `Hello World, I'm going to be compressed Hello.

Some more text to be compressed. How does this work? Does it work correctly? I want it to actually
compress the data, and use dynamic mode for the compression. I want to see how well it works.
`;

export function testGzipFile() {
    // let hexData = '1f8b080870d7096600036f726967696e616c5f66696c652e74787400f348cdc9c95708cf2fca49d151f054cf5548cfcfcc4b5728c957484a5548cecf2d284a2d2e4e4d51f000a9d3e30200a7b561c72f000000';
    let hexData = '1f8b080826f8096602036f726967696e616c5f66696c652e74787400658e310ec3200c45774ef1b72e1157c8d221993b74a6e026a8802b704573fb3a9132757cf2d3f39f2825c69d6b0a03e64bc6c2b12c10c683e039bf2bb54601d3ee59636e9c09992b41e82b7f9ec5c41d81a941d6d8d0b9be465c778e7290cab59297b48d98d15d91fda21de7e5e352dacc59d302213871035c09f834a5adb81cbd0e088427d74339fdc8c59e49ed3522ac3aa6ebf2f379b3e60702dddb66f1000000';
    let nBytes = hexData.length / 2;
    let data = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) {
        data[i] = parseInt(hexData.substring(i * 2, i * 2 + 2), 16);
    }

    let uniqueChars = new Set<string>();
    for (let c of origFileText) {
        uniqueChars.add(c);
    }
    let uniqueCharsArr = [...uniqueChars].sort();
    // console.log('Unique chars:', uniqueCharsArr.join('').replace(/\n/g, '\\n'));
    // console.log('Unique chars:', uniqueCharsArr.map(x => x.charCodeAt(0)).join(' '));

    let deflateRenderInfo: IDeflateData = {
        src: data,
        blocks: [],
        dest: new Uint8Array(0),
    };

    let stream = createBitStream(data);
    let res = readGzip(stream, deflateRenderInfo);

    if (res.error) {
        console.log(res.error);
        return;
    }

    deflateRenderInfo.dest = res.data;



    console.log('fname: ', res.fname, 'comment:', res.comment);
    console.log(`data:' ${new TextDecoder().decode(res.data)}'`);

    console.log(deflateRenderInfo.blocks[0]);
    return deflateRenderInfo;
}
