import { IMemoryMap } from "./CpuModel";

export interface IElfHeader {
    magic: Uint8Array;
    class: number;
    endian: number;
    version: number;
    osAbi: number;
    abiVersion: number;
    type: number;
    machine: number;
    version2: number;
    entryPoint: number;
    phOff: number;
    shOff: number;
    flags: number;
    ehSize: number;
    phEntSize: number;
    phNum: number;
    shEntSize: number;
    shNum: number;
    shStrNdx: number;
}

export function readElfHeader(elfFile: Uint8Array): IElfHeader | null {
    let magic = elfFile.subarray(0, 0x4);
    if (magic[0] !== 0x7F || magic[1] !== 0x45 || magic[2] !== 0x4C || magic[3] !== 0x46) {
        throw new Error(`Invalid ELF file (magic was ${magic}, but should be 0x7F 'E' 'L' 'F')`);
    }

    let class_ = elfFile[0x4];
    let endian = elfFile[0x5];
    let version = elfFile[0x6];
    let osAbi = elfFile[0x7];
    let abiVersion = elfFile[0x8];

    if (class_ !== 1 || endian !== 1 || version !== 1) {
        throw new Error(`Invalid ELF file: (class, endian, version) was (${class_}, ${endian}, ${version}), but should be (1 [32bit], 1 [little endian], 1)`);
    }

    // let osAbi = elfFile[0x7];
    // let abiVersion = elfFile[0x8];

    let type = elfFile[0x10];
    let machine = elfFile[0x12];
    let version2 = read32UintLe(elfFile, 0x14);

    if ((type !== 2 && type !== 1) || machine !== 0xF3) {
        throw new Error(`Invalid ELF file: (type, machine) was (${type}, 0x${machine.toString(16)}), but should be (1 [relocatable] or 2 [exe], 0xf3 [RISC-V])`);
    }

    // console.log(`ELF type: 0x${type.toString(16)} (exe), machine: 0x${machine.toString(16)} (RISC-V), entry: 0x${entryPoint.toString(16)}`);

    return {
        magic,
        class: class_,
        endian,
        version,
        osAbi,
        abiVersion,
        type,
        machine,
        version2,
        entryPoint: read32UintLe(elfFile, 0x18),
        phOff: read32UintLe(elfFile, 0x1C),
        shOff: read32UintLe(elfFile, 0x20),
        flags: read32UintLe(elfFile, 0x24),
        ehSize: read16UintLe(elfFile, 0x28),
        phEntSize: read16UintLe(elfFile, 0x2A),
        phNum: read16UintLe(elfFile, 0x2C),
        shEntSize: read16UintLe(elfFile, 0x2E),
        shNum: read16UintLe(elfFile, 0x30),
        shStrNdx: read16UintLe(elfFile, 0x32),
    };
}

export interface IElfTextSection {
    name: string;
    offset: number;
    size: number;
    arr: Uint8Array;
}

export function listElfTextSections(elfFile: Uint8Array, header: IElfHeader): IElfTextSection[] {
    let sections: IElfTextSection[] = [];

    let shOff = header.shOff;
    let shEntSize = header.shEntSize;
    let shNum = header.shNum;

    let shStrTabOffset = read32UintLe(elfFile, header.shOff + header.shStrNdx * header.shEntSize + 0x10);

    for (let i = 0; i < shNum; i++) {
        let base = shOff + i * shEntSize;
        let shName = read32UintLe(elfFile, base + 0x0);
        let shType = read32UintLe(elfFile, base + 0x4);
        let shFlags = read32UintLe(elfFile, base + 0x8);
        let shOffset = read32UintLe(elfFile, base + 0x10);
        let shSize = read32UintLe(elfFile, base + 0x14);

        if (shType === 1 && shFlags === 6 && shSize > 0) { // SHT_PROGBITS && SHF_ALLOC
            let name = readString(elfFile, shStrTabOffset + shName);
            sections.push({
                name,
                offset: shOffset,
                size: shSize,
                arr: elfFile.subarray(shOffset, shOffset + shSize),
            });
        }
    }
    return sections;
}

function readString(elfFile: Uint8Array, offset: number): string {
    let str = '';
    for (let i = offset; i < elfFile.length; i++) {
        if (elfFile[i] === 0) {
            break;
        }
        str += String.fromCharCode(elfFile[i]);
    }
    return str;
}


export function readElfFileIntoMemory(elfFile: Uint8Array, memory: IMemoryMap) {

    let magic = elfFile.subarray(0, 0x4);
    if (magic[0] !== 0x7F || magic[1] !== 0x45 || magic[2] !== 0x4C || magic[3] !== 0x46) {
        throw new Error(`Invalid ELF file (magic was ${magic}, but should be 0x7F 'E' 'L' 'F')`);
    }

    let class_ = elfFile[0x4];
    let endian = elfFile[0x5];
    let version = elfFile[0x6];

    if (class_ !== 1 || endian !== 1 || version !== 1) {
        throw new Error(`Invalid ELF file: (class, endian, version) was (${class_}, ${endian}, ${version}), but should be (1 [32bit], 1 [little endian], 1)`);
    }

    // let osAbi = elfFile[0x7];
    // let abiVersion = elfFile[0x8];

    let type = elfFile[0x10];
    let machine = elfFile[0x12];

    if (type !== 2 || machine !== 0xF3) {
        throw new Error(`Invalid ELF file: (type, machine) was (${type}, ${machine}), but should be (2 [exe], 0xF3 [RISC-V])`);
    }

    let entryPoint = read32UintLe(elfFile, 0x18);

    // console.log(`ELF type: 0x${type.toString(16)} (exe), machine: 0x${machine.toString(16)} (RISC-V), entry: 0x${entryPoint.toString(16)}`);

    if (entryPoint !== 0x8000_0000) {
        throw new Error(`Invalid ELF file: entry point was 0x${entryPoint.toString(16)}, but should be 0x8000_0000`);
    }

    let phOff = read32UintLe(elfFile, 0x1C);
    let phEntSize = read16UintLe(elfFile, 0x2A);
    let phNum = read16UintLe(elfFile, 0x2C);

    let hasStartSegment = false;

    for (let i = 0; i < Math.min(phNum, 10); i++) {
        let base = phOff + i * phEntSize;
        let pType = read32UintLe(elfFile, base + 0x0);
        let pOffset = read32UintLe(elfFile, base + 0x4);
        let pVaddr = read32UintLe(elfFile, base + 0x8); // virtual address (should be 0x8000_0000 for ones that we want to load)
        let pPaddr = read32UintLe(elfFile, base + 0xC); // physical address (should be ??)
        let pFilesz = read32UintLe(elfFile, base + 0x10);
        let pMemsz = read32UintLe(elfFile, base + 0x14);
        let pFlags = read32UintLe(elfFile, base + 0x18);
        let pAlign = read32UintLe(elfFile, base + 0x1C);

        if (pType !== 1 || pMemsz === 0) { // only look at PT_LOAD segments
            continue;
        }

        if (pVaddr < 0x8000_0000 || pVaddr + pMemsz > 0x8000_0000 + memory.ram.length) {
            continue;
        }

        memory.ram.set(elfFile.subarray(pOffset, pOffset + pFilesz), pVaddr - 0x8000_0000);

        // console.log('Writing segment to memory: ' + pVaddr.toString(16) + ' - ' + (pVaddr + pFilesz).toString(16));

        if (pVaddr === 0x8000_0000) {
            hasStartSegment = true;
        }
        // loadedSegment = elfFile.subarray(pOffset, pOffset + pFilesz);
    }

    if (!hasStartSegment) {
        throw new Error('No segment starting at 0x8000_0000 found!');
    }
}

function read32UintLe(buffer: Uint8Array, offset: number): number {
    return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function read16UintLe(buffer: Uint8Array, offset: number): number {
    return (buffer[offset] | (buffer[offset + 1] << 8)) >>> 0;
}
