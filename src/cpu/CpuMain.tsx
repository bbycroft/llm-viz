'use client';

import * as React from 'react';

export const CPUMain = () => {

    return <div>Hello World</div>;
};

/* Err, what am I doing?

- Simulate & draw the operation of a simple CPU (to start off with).

- It has an ISA, a frontend, a backend, and a memory.
- We simulate it down to the level of clock cycles.

- Have objects which are buffers, registers, etc.
- And then have logic between them.

- We try to make the actual operations as low-overhead as possible, and then the rendering is
  pulling the state and rendering it.

- What form is the structure going to be defined in? Basically, will just do it as code, and storing
  data on structs. A single cycle of code will be a single cycle of the CPU.

- Goal is to start small & simple, and then work up to more complex things.

- Also want to handle real low-level things, like integer multiplication, addition etc.
- These will be at a different level of abstraction, however. At the main level, they'll just be
  muls & adds in our language.

- What's our ISA? Let's go with RISC-V.
*/

interface ICpu {
    pc: number;
    x: Int32Array; // 32 registers, x0-x31, x0 is always 0 (even after writes!)
    halt: boolean;
    haltReason: string | null;
    csr: Int32Array; // 4096 registers, csr0-csr4095
}

enum OpCode {
    OPIMM  = 0b0010011,
    OP     = 0b0110011,
    BRANCH = 0b1100011,
    LUI    = 0b0110111,
    AUIPC  = 0b0010111,
    JAL    = 0b1101111,
    JALR   = 0b1100111,
    SYSTEM = 0b1110011,
    LOAD   = 0b0000011,
    STORE  = 0b0100011,
    FENCE  = 0b0001111,
}

enum Funct3Op {
    // Immediate
    ADDI  = 0b000, // add
    SLTI  = 0b010, // set less than
    SLTIU = 0b011, // set less than unsigned
    XORI  = 0b100, // xor
    ORI   = 0b110, // or
    ANDI  = 0b111, // and

    SLLI  = 0b001, // shift left logical
    SRLI  = 0b101, // shift right logical
    SRAI  = 0b101, // shift right arithmetic

    SUB   = 0b000, // subtract
    ADD   = 0b000, // add
    SLL   = 0b001, // shift left logical
    SLT   = 0b010, // set less than
    SLTU  = 0b011, // set less than unsigned
    XOR   = 0b100, // xor
    SRA   = 0b101, // shift right arithmetic
    SRL   = 0b101, // shift right logical
    OR    = 0b110, // or
    AND   = 0b111, // and
}

enum Funct3Branch {
    // Branch
    BEQ   = 0b000, // branch equal
    BNE   = 0b001, // branch not equal
    BLT   = 0b100, // branch less than
    BGE   = 0b101, // branch greater than or equal
    BLTU  = 0b110, // branch less than unsigned
    BGEU  = 0b111, // branch greater than or equal unsigned
}

enum Funct3LoadStore {
    // Load/Store
    LB    = 0b000, // load byte
    LH    = 0b001, // load halfword
    LW    = 0b010, // load word
    LBU   = 0b100, // load byte unsigned
    LHU   = 0b101, // load halfword unsigned

    SB    = 0b000, // store byte
    SH    = 0b001, // store halfword
    SW    = 0b010, // store word
}

enum Funct3CSR {
    // CSR
    CSRRW = 0b001, // read/write CSR
    CSRRS = 0b010, // read/set CSR
    CSRRC = 0b011, // read/clear CSR
    CSRRWI = 0b101, // read/write CSR immediate
    CSRRSI = 0b110, // read/set CSR immediate
    CSRRCI = 0b111, // read/clear CSR immediate
}

// CSR registers
enum CSR_Reg {
    mstatus = 0x300, // machine status register
    misa = 0x301, // machine ISA register
    mdeleg = 0x302, // machine exception delegation register
    mideleg = 0x303, // machine interrupt delegation register
    mie = 0x304, // machine interrupt-enable register
    mtvec = 0x305, // machine trap-handler base address
    mcounteren = 0x306, // machine counter enable
    mstatush = 0x310, // machine status register, high word

    mscratch = 0x340, // machine scratch register
    mepc = 0x341, // machine exception program counter
    mcause = 0x342, // machine trap cause
    mtval = 0x343, // machine bad address or instruction
    mip = 0x344, // machine interrupt pending
    mtinst = 0x34a, // machine trap instruction
    mtval2 = 0x34b, // machine bad guest physical address
}

/*
Let's make up a memory-model:

- 32-bit address space.
- 1MB of ROM
- 1MB of RAM

- 0x0000_0000 - 0x1FFF_FFFF: ROM max 512MiB
- 0x2000_0000 - 0x3FFF_FFFF: RAM max 512MiB
- 0x4000_0000 - 0x4FFF_FFFF: IO  max 256MiB

- Then have a bunch of devices in the IO space.
  - Some standard IO devices:

  - GPIO

  - We'll have 32 GPIO pins, each of which can be input or output, and each corresponds to a bit

  - GPIO offset: 0x4000_1000 - 0x4000_1FFF (4KiB)

  - within that block, we have 32bit registers, and we'll index them as 0, 1, 2 etc

  - 0: PORT_DIR: 0 = output, 1 = input
  - 1: PORT_VALUE: input or output value
  - 2: PORT_OUT_SET: set output bits
  - 3: PORT_OUT_CLEAR: clear output bits

*/

interface Io_Gpio {
    portDir: number;
    portValue: number;
}

enum Io_Gpio_Register {
    PORT_DIR = 0,
    PORT_VALUE = 1,
    PORT_OUT_SET = 2,
    PORT_OUT_CLEAR = 3,
}

interface IMemoryLayout {
    romOffset: number;
    ramOffset: number;
    ioOffset: number;

    romSize: number;
    ramSize: number;
    ioSize: number;
}

const memoryLayout: IMemoryLayout = {
    romOffset: 0x0000_0000, // not actually used in our RISC-V implementation (PC starts at 0x8000_0000)
    ioOffset:  0x4000_0000,
    ramOffset: 0x8000_0000, // following the RISC-V convention, also where the program is loaded & the PC starts

    romSize: 1024 * 1024, // 1MB
    ramSize: 1024 * 1024, // 1MB
    ioSize:  1024 * 1024, // 1MB
}

let testNames = [
    'addi',
    'and',
    'andi',
    'auipc',
    'beq',
    'bge',
    'bgeu',
    'blt',
    'bltu',
    'bne',
    'fence_i',
    'jal',
    'jalr',
    'lb',
    'lbu',
    'lh',
    'lhu',
    'lui',
    'lw',
    'ma_data',
    'or',
    'ori',
    'sb',
    'sh',
    'simple',
    'sll',
    'slli',
    'slt',
    'slti',
    'sltiu',
    'sltu',
    'sra',
    'srai',
    'srl',
    'srli',
    'sub',
    'sw',
    'xor',
    'xori',
];

type ISystem = ReturnType<typeof createSystem>;

function doSimulation(system: ISystem) {
    let cpu = system.cpu;
    let memoryMap = system.memoryMap;
    cpu.pc = memoryMap.ramOffset;

    // Run program
    for (let i = 0; i < 10000; i++) {
        if (cpu.halt) {
            if (cpu.haltReason) {
                console.log('Program halted unexpectedly: ' + cpu.haltReason);
            }
            break;
        }
        executeInstruction(cpu, system.memoryAccess);
    }
}

async function runTests() {
    console.clear();

    let basePath = '/riscv/tests-ui-p/rv32ui-p-';

    for (let testName of testNames) {

        // if (testName !== 'srai') {
        //     continue;
        // }

        let elfFile = new Uint8Array(await (await fetch(basePath + testName)).arrayBuffer());

        console.log('Running test: ' + testName);

        let system = createSystem();

        readElfFileIntoMemory(elfFile, system.memoryMap);

        doSimulation(system);
    }
}

console.log(    '-==  Tests Started  ==-');
runTests().then(() => {
    console.log('-== Tests Completed ==-');
});

function readElfFileIntoMemory(elfFile: Uint8Array, memory: IMemoryMap) {

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

function createSystem() {
    let layout = memoryLayout;

    let memoryMap: IMemoryMap = {
        romOffset: layout.romOffset,
        ramOffset: layout.ramOffset,
        ioOffset:  layout.ioOffset,
        ioSize:    layout.ioSize,
        rom: new Uint8Array(layout.romSize),
        ram: new Uint8Array(layout.ramSize),
    };

    let cpu = createCpu();
    let [io, ioAccess] = createIo(layout.ioOffset);
    let memoryAccess = createMemory(memoryMap, ioAccess);

    return {
        cpu,
        memoryMap,
        memoryAccess,
        io,
    };
}

function addressToRegister(addr: number): number {
    return addr >> 2; // 4KiB blocks
}

function extractByte(value: number, byteIdx: number): number {
    return (value >> (byteIdx * 8)) & 0xFF;
}

function insertByte(value: number, byteIdx: number, byteValue: number): number {
    return (value & ~(0xFF << (byteIdx * 8))) | (byteValue << (byteIdx * 8));
}

interface Io_ToHost {
    value: number;
}

function createIo_ToHost(memOffset: number): [Io_ToHost, IOHandler] {
    let toHost: Io_ToHost = {
        value: 0,
    };

    function readWord(addr: number): number {
        let reg = addressToRegister(addr);
        switch (reg) {
            case 0: return toHost.value;
        }
        return 0;
    }

    function writeWord(addr: number, value: number): void {
        let reg = addressToRegister(addr);
        switch (reg) {
            case 0: console.log('tohost', value); toHost.value = value; break;
        }
    }

    return [toHost, { readWord, writeWord }];
};

function createIo_Gpio(memOffset: number): [Io_Gpio, IOHandler] {
    let gpio: Io_Gpio = {
        portDir: 0,
        portValue: 0,
    };

    function readWord(addr: number): number {
        let reg = addressToRegister(addr);
        switch (reg) {
            case Io_Gpio_Register.PORT_DIR: return gpio.portDir;
            case Io_Gpio_Register.PORT_VALUE: return gpio.portValue;
        }
        return 0;
    }

    function writeWord(addr: number, value: number): void {
        let reg = addressToRegister(addr);
        let portValue = gpio.portValue;
        switch (reg) {
            case Io_Gpio_Register.PORT_DIR: gpio.portDir = value; break;
            case Io_Gpio_Register.PORT_VALUE: portValue = value; break;
            case Io_Gpio_Register.PORT_OUT_SET: portValue |= value; break;
            case Io_Gpio_Register.PORT_OUT_CLEAR: portValue &= ~value; break;
        }
        // only want to modify bits if they're outputs
        gpio.portValue = (gpio.portDir & portValue) | (~gpio.portDir & gpio.portValue);
    }

    return [gpio, { readWord, writeWord }];
}

interface IMemoryAccess {
    readByte(addr: number): number;
    readHalfWord(addr: number): number;
    readWord(addr: number): number;

    writeByte(addr: number, value: number): void;
    writeHalfWord(addr: number, value: number): void;
    writeWord(addr: number, value: number): void;
}

interface IOHandler {
    readWord(addr: number): number;
    writeWord(addr: number, value: number): void;
}

interface IO_Devices {
    gpio: Io_Gpio;
    toHost: Io_ToHost;
}

function createIo(ioOffset: number): [IO_Devices, IOHandler] {
    let gpioOffset = ioOffset + 0x1000;
    let toHostOffset = ioOffset + 0x2000;
    let blockSize = 0x1000;

    let [gpio, gpioHandler] = createIo_Gpio(gpioOffset);
    let [toHost, toHostHandler] = createIo_ToHost(toHostOffset);

    let blocks = [
        null,          // 0x0000
        gpioHandler,   // 0x1000
        toHostHandler, // 0x2000
    ];

    function findHandler(addr: number): IOHandler | null {
        let blockId = (addr - ioOffset) & ~0xFFF;
        return blocks[blockId];
    }

    let ioHandler: IOHandler = {
        readWord(addr: number): number {
            let handler = findHandler(addr);
            return handler ? handler.readWord(addr & (blockSize - 1)) : 0;
        },
        writeWord(addr: number, value: number): void {
            findHandler(addr)?.writeWord(addr & (blockSize - 1), value);
        }
    };

    return [{ gpio, toHost }, ioHandler];
}

interface IMemoryMap {
    romOffset: number;
    ramOffset: number;
    ioOffset: number;
    ioSize: number;

    rom: Uint8Array;
    ram: Uint8Array;
}

function mapByteToWord(addr: number): [wordAddr: number, bitShift: number] {
    return [addr & ~0x3, (addr & 0x3) * 8];
}

function createMemory(map: IMemoryMap, ioHandler: IOHandler): IMemoryAccess {

    function isIOAddress(addr: number): boolean {
        return addr >= map.ioOffset && addr < map.ioOffset + map.ioSize;
    }

    function isRomAddress(addr: number): boolean {
        return addr >= map.romOffset && addr < map.romOffset + map.rom.byteLength;
    }

    function isRamAddress(addr: number): boolean {
        return addr >= map.ramOffset && addr < map.ramOffset + map.ram.byteLength;
    }

    function readByte(addr: number): number {
        if (isRomAddress(addr)) {
            return map.rom[addr - map.romOffset];
        } else if (isRamAddress(addr)) {
            return map.ram[addr - map.ramOffset];
        } else if (isIOAddress(addr)) {
            let [wordAddr, bitShift] = mapByteToWord(addr);
            return ioHandler.readWord(wordAddr) >> bitShift;
        }

        return 0;
    }

    function writeByte(addr: number, value: number): void {
        if (isRamAddress(addr)) {
            map.ram[addr - map.ramOffset] = value;
        } else if (isIOAddress(addr)) {
            let [wordAddr, bitShift] = mapByteToWord(addr);
            // nasty: obviously don't use writeByte where possible for IO!
            ioHandler.writeWord(wordAddr, (value << bitShift) | (ioHandler.readWord(wordAddr) & ~(0xFF << bitShift)));
        }
    }

    // we're little-endian, so the byte at lowest addr is the LSB
    return {
        readByte,
        readHalfWord(addr: number): number {
            return readByte(addr) | (readByte(addr + 1) << 8);
        },
        readWord(addr: number): number {
            if (isIOAddress(addr) && !(addr & 0x3)) { // aligned io access goes direct
                return ioHandler.readWord(addr);
            }

            return readByte(addr) |
                (readByte(addr + 1) << 8) |
                (readByte(addr + 2) << 16) |
                (readByte(addr + 3) << 24);
        },

        writeByte,
        writeHalfWord(addr: number, value: number): void {
            writeByte(addr, value & 0xff);
            writeByte(addr + 1, (value >> 8) & 0xff);
        },

        writeWord(addr: number, value: number): void {
            if (isIOAddress(addr) && !(addr & 0x3)) { // aligned io access goes direct
                ioHandler.writeWord(addr, value);
                return;
            }

            writeByte(addr, value & 0xff);
            writeByte(addr + 1, (value >> 8) & 0xff);
            writeByte(addr + 2, (value >> 16) & 0xff);
            writeByte(addr + 3, (value >> 24) & 0xff);
        },
    };

}

function createCpu(): ICpu {

    return {
        x: new Int32Array(32),
        pc: 0,
        halt: false,
        haltReason: null,
        csr: new Int32Array(4096),
    };
}

// probably should move ins into cpu. anyway.
function executeInstruction(cpu: ICpu, mem: IMemoryAccess) {
    let ins = mem.readWord(cpu.pc) >>> 0;

    const opCode = ins & 0b1111111;
    const funct3 = (ins >>> 12) & 0b111;
    const rd = (ins >>> 7) & 0b11111;
    const rs1 = (ins >>> 15) & 0b11111;
    const rs2 = (ins >>> 20) & 0b11111;

    let funct3Txt = '';
    switch (opCode) {
        case OpCode.OP:
        case OpCode.OPIMM:
            funct3Txt = Funct3Op[funct3]; break;
        case OpCode.BRANCH:
            funct3Txt = Funct3Branch[funct3]; break;
        case OpCode.LOAD:
        case OpCode.STORE:
            funct3Txt = Funct3LoadStore[funct3]; break;
    }

    // console.log(`ins: 0x${ins.toString(16).padStart(8, '0')}`);
    // console.log(`0x${cpu.pc.toString(16)}: ${OpCode[opCode]} ${funct3Txt} x${rs1} (${cpu.x[rs1]}), ${opCode !== OpCode.OPIMM ? `x${rs2} (${cpu.x[rs2]})` : rs2} -> ${rd}`);

    let pcOffset = 4;

    if (opCode === OpCode.OPIMM || opCode === OpCode.OP) {
        let rhs: number;

        if (opCode === OpCode.OP) {
            rhs = cpu.x[rs2];
        } else if (funct3 === Funct3Op.SLLI || funct3 === Funct3Op.SRLI || funct3 === Funct3Op.SRAI) {
            rhs = rs2;
        } else {
            rhs = signExtend12Bit(ins >>> 20);
        }

        let isArithShiftOrSub = ((ins >>> 30) & 0b1) === 0b1;

        let lhs = cpu.x[rs1];
        let res: number;

        // if (funct3 === Funct3Op.SRL) {
        //     console.log('isLogicalShiftOrSub', isArithShiftOrSub, 'funct3', Funct3Op[funct3], 'lhs', lhs, 'rhs', rhs);
        // }

        switch (funct3) {
            case Funct3Op.ADD: res = isArithShiftOrSub && opCode === OpCode.OP ? lhs - rhs : lhs + rhs; break; // includes SUB
            case Funct3Op.SLT: res = lhs < rhs ? 1 : 0; break;
            case Funct3Op.SLTU: res = (lhs >>> 0) < (rhs >>> 0) ? 1 : 0; break;
            case Funct3Op.XOR: res = lhs ^ rhs; break;
            case Funct3Op.SLL: res = lhs << rhs; break;
            case Funct3Op.SRL: res = isArithShiftOrSub ? lhs >> rhs : lhs >>> rhs ; break;
            case Funct3Op.OR: res = lhs | rhs; break;
            case Funct3Op.AND: res = lhs & rhs; break;
            default: res = 0; // thee above cover all 3-bit funct3 values, so this is unreachable.
        }

        cpu.x[rd] = res;

    } else if (opCode === OpCode.LUI) {
        cpu.x[rd] = signExtend20Bit(ins >>> 12) << 12;

    } else if (opCode === OpCode.AUIPC) {
        let offset = signExtend20Bit(ins >>> 12) << 12;
        cpu.x[rd] = cpu.pc + offset;

    } else if (opCode === OpCode.JAL) {
        let offsetRaw = (((ins >>> 21) & 0x3FF) << 1) | // 10 bytes
                        (((ins >>> 20) & 0x01) << 11) | // 1 byte
                        (((ins >>> 12) & 0xFF) << 12) | // 8 bytes
                        (((ins >>> 31) & 0x01) << 20);  // 1 byte
        let offset = signExtend20Bit(offsetRaw);
        cpu.x[rd] = cpu.pc + 4;
        pcOffset = offset;

    } else if (opCode === OpCode.JALR) {
        let offset = signExtend12Bit(ins >>> 20);
        pcOffset = ((cpu.x[rs1] >>> 0) + offset) - cpu.pc;
        cpu.x[rd] = cpu.pc + 4;
    
    } else if (opCode === OpCode.BRANCH) {
        let lhs = cpu.x[rs1];
        let rhs = cpu.x[rs2];

        let takeBranch = false;
        switch (funct3) {
            case Funct3Branch.BEQ: takeBranch = lhs === rhs; break;
            case Funct3Branch.BNE: takeBranch = lhs !== rhs; break;
            case Funct3Branch.BLT: takeBranch = lhs < rhs; break;
            case Funct3Branch.BGE: takeBranch = lhs >= rhs; break;
            case Funct3Branch.BLTU: takeBranch = (lhs >>> 0) < (rhs >>> 0); break;
            case Funct3Branch.BGEU: takeBranch = (lhs >>> 0) >= (rhs >>> 0); break;
            default: takeBranch = false;
        }

        if (takeBranch) {
            let offsetRaw = (((ins >>>  8) & 0x0F) << 0 ) | // 4 bytes
                            (((ins >>> 25) & 0x3F) << 4 ) | // 6 bytes
                            (((ins >>>  7) & 0x01) << 10) | // 1 byte
                            (((ins >>> 31) & 0x01) << 11);  // 1 byte

            pcOffset = signExtend12Bit(offsetRaw) << 1;
        }

    } else if (opCode === OpCode.LOAD) {
        let offset = signExtend12Bit(ins >>> 20);
        let base = cpu.x[rs1] >>> 0;
        let addr = base + offset;
        let value = 0;
        switch (funct3) {
            case Funct3LoadStore.LB: value = signExtend8Bit(mem.readByte(addr)); break;
            case Funct3LoadStore.LH: value = signExtend16Bit(mem.readHalfWord(addr)); break;
            case Funct3LoadStore.LW: value = signExtend32Bit(mem.readWord(addr)); break;
            case Funct3LoadStore.LBU: value = mem.readByte(addr); break;
            case Funct3LoadStore.LHU: value = mem.readHalfWord(addr); break;
            default: break;
        }
        // console.log(`LOAD: addr=${addr.toString(16)}, value=${value.toString(16)}`);
        cpu.x[rd] = value;

    } else if (opCode === OpCode.STORE) {
        let offsetRaw = (((ins >>>  7) & 0x1F)     ) | // 5 bytes
                        (((ins >>> 25) & 0x7F) << 5);  // 7 bytes

        let offset = signExtend12Bit(offsetRaw);
        let base = cpu.x[rs1] >>> 0;
        let addr = base + offset;
        let value = cpu.x[rs2];

        switch (funct3) {
            case Funct3LoadStore.SB: mem.writeByte(addr, value); break;
            case Funct3LoadStore.SH: mem.writeHalfWord(addr, value); break;
            case Funct3LoadStore.SW: mem.writeWord(addr, value); break;
            default: break;
        }

    } else if (opCode === OpCode.SYSTEM) {
        let csr = (ins >>> 20);
        if (funct3 !== 0x0) {
            let srcVal = (funct3 & 0b100 ? rs1 : cpu.x[rs1]) >>> 0;
            let funct3Local = funct3 | 0b100;
            cpu.x[rd] = cpu.csr[csr];
            switch (funct3Local) {
                case Funct3CSR.CSRRWI: cpu.csr[csr] = srcVal; break;
                case Funct3CSR.CSRRSI: cpu.csr[csr] |= srcVal; break; 
                case Funct3CSR.CSRRCI: cpu.csr[csr] &= ~srcVal; break;
            }
            // console.log(`CSR op ${Funct3CSR[funct3]} @ 0x${csr.toString(16)} (${CSR_Reg[csr]}): ${cpu.x[rd]} -> ${srcVal}`);
            if (csr < 0 || csr > 0xFFF) {
                console.log('ins: ' + ins.toString(2).padStart(32, '0'));
                console.log('Unknown CSR op: ' + csr.toString(16));
                cpu.halt = true;
            }
            // console.log('Unknown SYSTEM op (probably a CSR one): ' + funct3);
        } else {
            if (csr === 0x000) { // ecall
                let isTestResult = cpu.x[17] === 93;
                if (isTestResult) {
                    let testNum = cpu.x[10];
                    if (testNum === 0) {
                        console.log('ECALL: All tests passed!');
                    } else {
                        console.log(`ECALL: Test failed on test ${testNum >> 1}`);
                        dumpCpu(cpu);
                    }
                    cpu.halt = true;
                } else {
                    console.log('ECALL (unknown)');
                }
            } else if (csr === 0x001) { // ebreak
                console.log('EBREAK');
            } else if (csr === 0x102) { // sret
                console.log('SRET');
            } else if (csr === 0x302) { // mret
                pcOffset = (cpu.csr[CSR_Reg.mepc] >>> 0) - cpu.pc;
            } else {
                console.log('Unknown SYSTEM op: ' + csr);
            }
        }
    } else if (opCode === 0x0) {
        console.log('Unknown op: ' + opCode, ins.toString(2).padStart(32, '0'), cpu.pc.toString(16));
        // dumpCpu(cpu);
        cpu.halt = true;
        cpu.haltReason = 'Unknown op: ' + opCode;
    }

    cpu.pc += pcOffset; // jump to location, or just move on to next instruction
    cpu.x[0] = 0; // ensure x0 is always 0
}

let regNames = [
    'zero', 'ra', 'sp', 'gp', 'tp',
    't0', 't1', 't2',
    's0', 's1',
    'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    't3', 't4', 't5', 't6'
]

function printHexAddr(addr: number) {
    return '0x' + (addr >>> 0).toString(16).padStart(8, '0');
}

function printBinAddr(addr: number) {
    return '0b' + (addr >>> 0).toString(2).padStart(32, '0');
}

function dumpCpu(cpu: ICpu) {
    for (let i = 1; i < 32; i++) {
        let val = cpu.x[i];
        console.log(`x${i.toString().padStart(2, '0')} (${regNames[i]}): ${val} (${printHexAddr(val)}) (${printBinAddr(val)})`);
    }
}

function signExtend8Bit(x: number) {
    return ((x & 0x80) === 0x80) ? x - 0x100 : x;
}

function signExtend12Bit(x: number) {
    return ((x & 0x800) === 0x800) ? x - 0x1000 : x;
}

function signExtend16Bit(x: number) {
    return ((x & 0x8000) === 0x8000) ? x - 0x10000 : x;
}

function signExtend20Bit(x: number) {
    return ((x & 0x80000) === 0x80000) ? x - 0x100000 : x;
}

function signExtend32Bit(x: number) {
    return ((x & 0x80000000) === 0x80000000) ? x - 0x100000000 : x;
}

function castToUnsigned32Bit(x: number) {
    return x >>> 0;
}