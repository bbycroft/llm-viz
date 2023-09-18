'use client';

import React from 'react';
import { useCreateGlobalKeyboardDocumentListener } from '../utils/keyboard';
import { riscvRegNames } from './comps/Registers';
import { CpuCanvas } from './CpuCanvas';
import s from './CpuMain.module.scss';
import { IMemoryMap } from './CpuModel';
import { readElfFileIntoMemory } from './ElfParser';
import { OpCode, Funct3Op, Funct3Branch, Funct3LoadStore, Funct3CSR, CSR_Reg } from './RiscvIsa';

export const CPUMain = () => {
    useCreateGlobalKeyboardDocumentListener();

    // let [cpuState] = useState(() => {
    //     return { system: createSystem() };
    // });

//    useEffect(() => {
//         console.log('Running tests ...');
//         runTests().then(() => {
//         });
//    }, []);

    return <div className={s.content}>
        <CpuCanvas />
    </div>;
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

/* Once again, what am I doing?

- We want to be able to render/display informative things about the operation of the CPU.
- So let's say we have a block diagram of the CPU, standard in docs.
  - We break it down into ins-decode, register-file, ALU, etc.
  - Also need to describe (visually) the bus, and how it works, which doesn't have an obvious parallel
    in the impl code.
  - Want to map the CPU ins decode etc to actual signal lines & gates. Seems complicated. And is getting
    to the point where describing in VHDL style thing is beneficial. Still have to lay them out visually
    though!

- Hmm, this basically means building up an entire gate model, and also editing the model in a custom editor.
- Most registers map to real variables in code, but the combinatorial logic is pushed down to the gate level.
- Higher level components are typically implemented directly, rather than at the gate level.

- Each abstraction level still binds to real JS values, and somehow need to make that linkage while being able
  to design/edit the circuit layout & components.

- Code or 2d layout editor?
- Need to create a bunch of 2d assets either way (blocks, lines, gates, etc).
- Editor is way more work: managing snapping etc.
- So will do most of it in code, with a few layout helpers, say. Maybe do the design in some external
  editor, and translate it to code by hand.

- Have to do the design work first!

- OK, so plan is to describe multiple levels of detail:

  - Have block diagrams with key components, showing their key values (PC, registers, etc).
  - Then, if you're zoomed in far enough, have them show the sub-components, or actual gates if
    low enough.
  - Probably stick to canvas2d for rendering, since it has lots of features for 2d.
  - At mid level, have busses, muxes, etc. i.e. not broken out into individual wires/gates, unless
    control signals.
  - Also probably won't aim to align sub components with parent components. Although it would be neat
    to see down to the lowest levels all at once!

- Let's think of what assets & components are needed (at the high levels):

   - Multi-bit rail (x bits wide)
   - Bus (x bits wide, with address & data lines & signals; will mostly be arrows with width)
   - Instruction decoder
   - Single register e.g. PC
   - Register file (x bits wide, y registers)
   - ALU: 2 in, 1 out, plus control signals
   - RAM
   - ROM

- First design is a single-cycle CPU, with a single register file, ALU, ROM & RAM. Pure harvard architecture,
  so reading ROM instrucion at the same time as doing all other operations, including RAM load/stores.

- As we zoom in a little, interesting part is the instruction decoder, and want to split that into gates
  quite early on.
  - So need AND, OR, NOT, XOR, etc gates. But also have comparitors (for evaluating what op), muxes, etc.
  - Want to show all operations but using high-level components as possible.

*/

/*
Global data structure (probably a rehash of the above but that's OK)

- We have a set of components, which are connected by wires (in ICpuLayoutBase).
- We have an object describing the state of the system (ICpuState).

- We have methods to update ICpuState, e.g. by stepping through a clock cycle, or resetting
  - This has associated UI (play, pause, step, reset, speed)
- Different components have various things to render (e.g. reg values, binary states), and want to map them to ICpuState.
- The components also have a series of ports, whose values are also mapped to ICpuState.
- We want the wires to have their values driven by the ports, and also check that, e.g., the tristates are set correctly.

- So we need some sort of bridge between these, and also, we don't want to have to update all the rendered components
  each time.
- Also, the graph of components & wires defines a system that we can step through.

- We a) execute ICpuState, b) copy to some model via a bridge, c) execute the model, d) render the model.
- The bridge copy is done via some ids, and the execute/render phases are purely derived from how the system is set up.

- We don't need to do the ids copy each time, but instead can do it once to create an object with the actual refs.
- Same thing in the execute/render phases.
- Important thing is that we're separating the editing from the execution/rendering.
- Or at least, we run some setup after each edit to remap ids to objects.

- Right now, we render from the edit model, but need to access the execute data model, so need to map _back_.
  - Do we add references to the render model, or create a lookup structure?

- Big goal here is to make it easy to create lots of different models/variants.

*/


export interface ICpu {
    pc: number;
    x: Int32Array; // 32 registers, x0-x31, x0 is always 0 (even after writes!)
    halt: boolean;
    haltReason: string | null;
    csr: Int32Array; // 4096 registers, csr0-csr4095
}

export interface Io_Gpio {
    portDir: number;
    portValue: number;
}

export enum Io_Gpio_Register {
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
    // console.clear();

    let basePath = (process.env.BASE_URL ?? '') + '/riscv/tests-ui-p/rv32ui-p-';

    for (let testName of testNames) {

        if (testName !== 'srai') {
            continue;
        }

        let elfFile = new Uint8Array(await (await fetch(basePath + testName)).arrayBuffer());

        console.log('Running test: ' + testName, 'from', basePath + testName);

        let system = createSystem();

        readElfFileIntoMemory(elfFile, system.memoryMap);

        doSimulation(system);
    }
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


function printHexAddr(addr: number) {
    return '0x' + (addr >>> 0).toString(16).padStart(8, '0');
}

function printBinAddr(addr: number) {
    return '0b' + (addr >>> 0).toString(2).padStart(32, '0');
}

function dumpCpu(cpu: ICpu) {
    for (let i = 1; i < 32; i++) {
        let val = cpu.x[i];
        console.log(`x${i.toString().padStart(2, '0')} (${riscvRegNames[i]}): ${val} (${printHexAddr(val)}) (${printBinAddr(val)})`);
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
