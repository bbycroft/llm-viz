import { hasFlag, isNil } from "../utils/data";
import { CompNodeType, IComp, IExeComp, IExeNet, IExePhase, IExePort } from "./CpuModel";
import { Funct3Op, OpCode } from "./RiscvIsa";

interface ICompDataAlu {
    inCtrlPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

class ExeCompBuilder<T> {
    ports: IExePort[] = [];
    portNameToIdx = new Map<string, number>();
    phases: IExePhase[] = [];
    seenLatch = false;
    valid = true;

    constructor(
        public comp: IComp,
    ) {
        this.ports = comp.nodes.map((node, i) => {
            return {
                portIdx: i,
                netIdx: -1,
                outputEnabled: true,
                type: node.type ?? CompNodeType.In,
                value: 0,
                width: node.width ?? 1,
            };
        });

        for (let i = 0; i < comp.nodes.length; i++) {
            this.portNameToIdx.set(comp.nodes[i].id, i);
        }
    }

    public getPort(id: string): IExePort {
        let portIdx = this.portNameToIdx.get(id);
        if (isNil(portIdx)) {
            let validPortsMsg = 'Valid ports are [' + Array.from(this.portNameToIdx.keys()).join(', ') + ']';
            throw new Error(`Port ${id} not found on component ${this.comp.name} (${this.comp.id}). ` + validPortsMsg);
        }
        return this.ports[portIdx];
    }

    public addPhase(func: (comp: IExeComp<T>) => void, inPorts: IExePort[], outPorts: IExePort[], isLatch: boolean = false): ExeCompBuilder<T> {
        if (this.seenLatch) {
            throw new Error(`Cannot add phase after latch phase`);
        }
        if (isLatch) {
            this.seenLatch = true;
        }
        this.phases.push({
            readPortIdxs: inPorts.map(a => a.portIdx),
            writePortIdxs: outPorts.map(a => a.portIdx),
            func,
            isLatch,
        });
        return this;
    }

    public build(data: T): IExeComp<T> {
        return {
            comp: this.comp,
            data,
            phases: this.phases,
            phaseCount: this.phases.length,
            phaseIdx: 0,
            ports: this.ports,
            type: this.comp.type,
            valid: this.valid,
        };
    }
}


export function buildDefault(comp: IComp): IExeComp<{}> {
    let builder = new ExeCompBuilder<{}>(comp);
    builder.valid = false;
    let data = {};
    let inPorts = builder.ports.filter(p => hasFlag(p.type, CompNodeType.In));
    let outPorts = builder.ports.filter(p => hasFlag(p.type, CompNodeType.Out));
    builder.addPhase(defaultPhase0, inPorts, outPorts);
    return builder.build(data);
}

function defaultPhase0(comp: IExeComp<{}>) {
    // do nothing
}

export function buildAlu(comp: IComp): IExeComp<ICompDataAlu> {
    let builder = new ExeCompBuilder<ICompDataAlu>(comp);
    let data: ICompDataAlu = {
        inCtrlPort: builder.getPort('ctrl'),
        inAPort: builder.getPort('lhs'),
        inBPort: builder.getPort('rhs'),
        outPort: builder.getPort('result'),
    };
    builder.addPhase(aluPhase0, [data.inCtrlPort, data.inAPort, data.inBPort], [data.outPort]);
    return builder.build(data);
}

/*
RISC-V ALU ops from funct3 (& funct7):

SUB   = 0b000, // sub                    (extra bit flag)
ADD   = 0b000, // add
SLL   = 0b001, // shift left logical
SLT   = 0b010, // set less than
SLTU  = 0b011, // set less than unsigned
XOR   = 0b100, // xor
SRA   = 0b101, // shift right arithmetic
SRL   = 0b101, // shift right logical     (extra bit flag)
OR    = 0b110, // or
AND   = 0b111, // and

-- branches (note last bit just flips the branch condition)
-- so have equals, LT, LT unsigned

BEQ   = 0b000, // branch equal
BNE   = 0b001, // branch not equal
BLT   = 0b100, // branch less than
BGE   = 0b101, // branch greater than or equal
BLTU  = 0b110, // branch less than unsigned
BGEU  = 0b111, // branch greater than or equal unsigned

-- ctrl bit pattern becomes (5 bits):
-- bit      5: ALU enabled
-- bit      4: 0 = arith, 1 = branch
-- bits [3:1]: = funct3
-- bit      0: sub/shift logical
*/

function aluPhase0({ data: { inCtrlPort, inAPort, inBPort, outPort } }: IExeComp<ICompDataAlu>) {
    let ctrl = inCtrlPort.value;
    let lhs = inAPort.value;
    let rhs = inBPort.value;
    outPort.outputEnabled = false;

    let isEnabled = (ctrl & 0b100000) !== 0;
    let isBranch =  (ctrl & 0b010000) !== 0;

    if (!isEnabled) {
        return;
    }

    if (isBranch) {
        let isInverted = ctrl & 0b1;
        let opts = ctrl & 0b110;
        let res = false;
        switch (opts) {
            case 0b000: res = lhs === rhs; break;
            case 0b100: res = lhs < rhs; break;
            case 0b110: res = (lhs >>> 0) < (rhs >>> 0); break;
        }
        outPort.outputEnabled = true; // branch may need its own output port?
        outPort.value = (res ? 1 : 0) ^ isInverted;
    } else {
        let funct3 = (ctrl >> 1) & 0b111;
        let isArithShiftOrSub = (ctrl & 0b1) !== 0;
        let res = 0;
        switch (funct3) {
            case 0b000: res = isArithShiftOrSub ? lhs - rhs : lhs + rhs; break; // add/sub
            case 0b001: res = lhs << rhs; break; // shift left logical
            case 0b010: res = lhs < rhs ? 1 : 0; break; // set less than
            case 0b011: res = (lhs >>> 0) < (rhs >>> 0) ? 1 : 0; break; // set less than unsigned
            case 0b100: res = lhs ^ rhs; break; // xor
            case 0b101: res = isArithShiftOrSub ? lhs >> rhs : lhs >>> rhs ; break; // shift right arithmetic/logical
            case 0b110: res = lhs | rhs; break; // or
            case 0b111: res = lhs & rhs; break; // and
        }
        outPort.outputEnabled = true;
        outPort.value = res;
    }
}

export interface ICompDataRegFile {
    inCtrlPort: IExePort;
    outAPort: IExePort;
    outBPort: IExePort;
    inDataPort: IExePort;

    file: Uint32Array;

    writeEnabled: boolean;
    writeReg: number;
    writeData: number;
}

export function buildRegFile(comp: IComp): IExeComp<ICompDataRegFile> {
    let builder = new ExeCompBuilder<ICompDataRegFile>(comp);
    let data: ICompDataRegFile = {
        inCtrlPort: builder.getPort('ctrl'),
        inDataPort: builder.getPort('in'),
        outAPort: builder.getPort('outA'),
        outBPort: builder.getPort('outB'),

        file: new Uint32Array(32),

        writeEnabled: false,
        writeReg: 0,
        writeData: 0,
    };
    builder.addPhase(regFilePhase0, [data.inCtrlPort], [data.outAPort, data.outBPort]);
    builder.addPhase(regFilePhase1, [data.inCtrlPort, data.inDataPort], []);
    builder.addPhase(regFilePhase2Latch, [], [], true);
    return builder.build(data);
}

// inCtrl bits ((1 + 5) * 3 = 18 bits)

// phase0 reads
function regFilePhase0({ data: { inCtrlPort, outAPort, outBPort, file } }: IExeComp<ICompDataRegFile>) {
    let ctrl = inCtrlPort.value;
    let outBitsA = (ctrl >> (1 + 0)) & 0x1f;
    let outBitsB = (ctrl >> (1 + 6)) & 0x1f;

    let outAEnabled = ctrl & 0b1;
    let outBEnabled = (ctrl >> 6) & 0b1;

    outAPort.outputEnabled = !!outAEnabled;
    outBPort.outputEnabled = !!outBEnabled;
    outAPort.value = outAEnabled ? file[outBitsA] : 0;
    outBPort.value = outBEnabled ? file[outBitsB] : 0;
}

// phase1 writes
function regFilePhase1({ data }: IExeComp) {
    let ctrl = data.inCtrlPort.value;
    let inData = data.inDataPort.value;

    let inBits = (ctrl >> (1 + 12)) & 0x1f;
    let inEnabled = (ctrl >> 12) & 0b1;

    data.writeEnabled = !!inEnabled;
    data.writeReg = inBits;
    data.writeData = inData;
}

// phase2 latches
function regFilePhase2Latch({ data }: IExeComp) {
    if (data.writeEnabled && data.writeReg !== 0) {
        data.file[data.writeReg] = data.writeData;
    }
}


export interface ICompDataSingleReg {
    inCtrlPort: IExePort;
    outPort: IExePort;
    inPort: IExePort;

    value: number;

    writeEnabled: boolean;
}

export function buildSingleReg(comp: IComp) {
    let builder = new ExeCompBuilder<ICompDataSingleReg>(comp);
    let data: ICompDataSingleReg = {
        inCtrlPort: builder.getPort('ctrl'),
        inPort: builder.getPort('in'),
        outPort: builder.getPort('out'),

        value: 0,
        writeEnabled: false,
    };
    builder.addPhase(singleRegPhase0, [data.inCtrlPort], [data.outPort]);
    builder.addPhase(singleRegPhase1Latch, [data.inPort], []);
    return builder.build(data);
}

function singleRegPhase0(comp: IExeComp<ICompDataSingleReg>) {
    let data = comp.data;
    let ctrl = data.inCtrlPort.value;
    let outPort = data.outPort;

    let outEnabled = ctrl & 0b1;
    outPort.outputEnabled = !!outEnabled;
    outPort.value = outEnabled ? data.value : 0;

    let inEnabled = (ctrl >> 1) & 0b1;
    data.writeEnabled = !!inEnabled;
}

function singleRegPhase1Latch(comp: IExeComp<ICompDataSingleReg>) {
    let data = comp.data;
    let inPort = data.inPort;

    if (data.writeEnabled) {
        data.value = inPort.value;
    }
}

export interface ICompDataAdder {
    inPort0: IExePort;
    inPort1: IExePort;
    outPort: IExePort;
}

export function buildAdder(comp: IComp) {
    let builder = new ExeCompBuilder<ICompDataAdder>(comp);
    let data: ICompDataAdder = {
        inPort0: builder.getPort('in0'),
        inPort1: builder.getPort('in1'),
        outPort: builder.getPort('out'),
    };
    builder.addPhase(adderPhase0, [data.inPort0, data.inPort1], [data.outPort]);
    return builder.build(data);
}

function adderPhase0({ data: { inPort0, inPort1, outPort } }: IExeComp<ICompDataAdder>) {
    outPort.value = inPort0.value + inPort1.value;
}

export function runNet(comps: IExeComp[], net: IExeNet) {

    if (net.tristate) {
        // need to ensure exactly 1 output is enabled
        let enabledCount = 0;
        let enabledPortValue = 0;
        for (let portRef of net.outputs) {
            let port = comps[portRef.compIdx].ports[portRef.portIdx];
            if (port.outputEnabled) {
                enabledCount++;
                enabledPortValue = port.value;
            }
        }
        net.enabledCount = enabledCount;
        net.value = enabledCount === 1 ? enabledPortValue : 0;
    } else {
        // has exactly 1 input
        if (net.inputs.length !== 1) {
            net.value = 0;
        } else {
            let portRef = net.inputs[0];
            let port = comps[portRef.compIdx].ports[portRef.portIdx];
            net.value = port.value;
        }
    }

    for (let portRef of net.inputs) {
        let port = comps[portRef.compIdx].ports[portRef.portIdx];
        port.value = net.value;
    }
}

export interface ICompDataInsDecoder {
    ins: IExePort;

    addrOffset: IExePort; // will get added to load/store address
    rhsImm: IExePort; // set's the RHS with an immediate value
    regCtrl: IExePort; // 3x 6-bit values: [0: outA, 1: outB, 2: inA]
    loadStoreCtrl: IExePort; // controls load/store
    aluCtrl: IExePort; // controls ALU, 5-bit value: [0: enable, 1: isBranch, 2: funct3, 3: isSpecial]
    pcOutTristateCtrl: IExePort; // 1-bit value, enables PC -> LHS
    pcRegMuxCtrl: IExePort; // 1-bit value, controls writes to (PC, REG), from (ALU out, PC + x), or swaps them

    pcAddImm: IExePort; // gets added to PC, overrides +4 for jumps
    pcAddMuxCtrl: IExePort; // 1-bit value, selects between PC + 4 and PC + imm
}

export function buildInsDecoder(comp: IComp) {
    let builder = new ExeCompBuilder<ICompDataInsDecoder>(comp);
    let data = {
        ins: builder.getPort('ins'),

        addrOffset: builder.getPort('addrOffset'),
        rhsImm: builder.getPort('rhsImm'),
        regCtrl: builder.getPort('regCtrl'),
        loadStoreCtrl: builder.getPort('loadStoreCtrl'),
        aluCtrl: builder.getPort('aluCtrl'),
        pcOutTristateCtrl: builder.getPort('pcOutTristateCtrl'),
        pcRegMuxCtrl: builder.getPort('pcRegMuxCtrl'),

        pcAddImm: builder.getPort('pcAddImm'),
        pcAddMuxCtrl: builder.getPort('pcAddMuxCtrl'),
    };
    builder.addPhase(insDecoderPhase0, [data.ins], [data.addrOffset, data.rhsImm, data.regCtrl, data.loadStoreCtrl, data.aluCtrl, data.pcRegMuxCtrl, data.pcAddMuxCtrl, data.pcAddImm]);
    return builder.build(data);
}

function insDecoderPhase0({ data }: IExeComp<ICompDataInsDecoder>) {
    let ins = data.ins.value >>> 0;

    const opCode = ins & 0b1111111;
    const funct3 = (ins >>> 12) & 0b111;
    const rd = (ins >>> 7) & 0b11111;
    const rs1 = (ins >>> 15) & 0b11111;
    const rs2 = (ins >>> 20) & 0b11111;

    data.regCtrl.value = 0;
    data.rhsImm.outputEnabled = false;

    // 0: ALU out => REG, PC + x => PC
    // 1: ALU out => PC,  PC + x => REG
    data.pcRegMuxCtrl.value = 0;
    data.pcOutTristateCtrl.value = 0;

    function setRegCtrl(enable: boolean, addr: number, offset: number) {
        let a = (enable ? 1 : 0) | (addr & 0b11111) << 1;
        let val = data.regCtrl.value;
        val = (val & ~(0b111111 << (offset * 6))) | (a << (offset * 6));
        data.regCtrl.value = val;
    }

    function setAluCtrl(enable: boolean, isBranch: boolean, funct3: number, isSpecial: boolean) {
        let val = (enable ? 1 : 0) << 4 |
                  (isBranch ? 1 : 0) << 3 |
                  funct3 << 1 |
                  (isSpecial ? 1 : 0) << 0;
        data.aluCtrl.value = val;
    }

    if (opCode === OpCode.OPIMM || opCode === OpCode.OP) {
        let rhs: number;

        if (opCode === OpCode.OP) {
            setRegCtrl(true, rs2, 1); // reg[rs2] => RHS
        } else if (funct3 === Funct3Op.SLLI || funct3 === Funct3Op.SRLI || funct3 === Funct3Op.SRAI) {
            data.rhsImm.value = rs2;
            data.rhsImm.outputEnabled = true;
        } else {
            data.rhsImm.value = signExtend12Bit(ins >>> 20);
            data.rhsImm.outputEnabled = true;
        }

        let isArithShiftOrSub = ((ins >>> 30) & 0b1) === 0b1;

        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        setAluCtrl(true, false, funct3, isArithShiftOrSub);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.LUI) {
        data.rhsImm.value = signExtend20Bit(ins >>> 12) << 12;
        setRegCtrl(true, 0x0, 0); // 0 => LHS
        setAluCtrl(true, false, Funct3Op.ADD, false);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.AUIPC) {
        data.rhsImm.value = signExtend20Bit(ins >>> 12) << 12;
        data.pcOutTristateCtrl.value = 1; // PC -> LHS enabled
        setAluCtrl(true, false, Funct3Op.ADD, false);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.JAL) {
        let offsetRaw = (((ins >>> 21) & 0x3FF) << 1) | // 10 bytes
                        (((ins >>> 20) & 0x01) << 11) | // 1 byte
                        (((ins >>> 12) & 0xFF) << 12) | // 8 bytes
                        (((ins >>> 31) & 0x01) << 20);  // 1 byte

        data.pcOutTristateCtrl.value = 1; // PC -> LHS enabled
        data.rhsImm.value = signExtend20Bit(offsetRaw);
        data.pcRegMuxCtrl.value = 1; // ALU out => PC; PC + 4 => REG
        setRegCtrl(true, rd, 2); // PC + 4 => reg[rd]

    } else if (opCode === OpCode.JALR) {
        let offset = signExtend12Bit(ins >>> 20);
        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        data.rhsImm.value = offset;
        data.pcRegMuxCtrl.value = 1; // ALU out => PC; PC + 4 => REG
        setRegCtrl(true, rd, 2); // PC + 4 => reg[rd]

    } else if (opCode === OpCode.BRANCH) {

        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        setRegCtrl(true, rs2, 1); // reg[rs2] => RHS

        setAluCtrl(true, true, funct3, false);

        let offsetRaw = (((ins >>>  8) & 0x0F) << 0 ) | // 4 bytes
                        (((ins >>> 25) & 0x3F) << 4 ) | // 6 bytes
                        (((ins >>>  7) & 0x01) << 10) | // 1 byte
                        (((ins >>> 31) & 0x01) << 11);  // 1 byte

        data.pcAddImm.value = signExtend12Bit(offsetRaw) << 1;
        data.pcAddMuxCtrl.value = 1; // PC + offset => PC @TODO: not sure about this one, als a function of branch output

    } else if (opCode === OpCode.LOAD) {
        // let offset = signExtend12Bit(ins >>> 20);
        // let base = cpu.x[rs1] >>> 0;
        // let addr = base + offset;
        // let value = 0;
        // switch (funct3) {
        //     case Funct3LoadStore.LB: value = signExtend8Bit(mem.readByte(addr)); break;
        //     case Funct3LoadStore.LH: value = signExtend16Bit(mem.readHalfWord(addr)); break;
        //     case Funct3LoadStore.LW: value = signExtend32Bit(mem.readWord(addr)); break;
        //     case Funct3LoadStore.LBU: value = mem.readByte(addr); break;
        //     case Funct3LoadStore.LHU: value = mem.readHalfWord(addr); break;
        //     default: break;
        // }

        // @TODO: implement LOAD signals
        setRegCtrl(true, 0, 0);
        setRegCtrl(true, 0, 1);
        setRegCtrl(true, 0, 2);
        setAluCtrl(true, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.STORE) {
        // let offsetRaw = (((ins >>>  7) & 0x1F)     ) | // 5 bytes
        //                 (((ins >>> 25) & 0x7F) << 5);  // 7 bytes

        // let offset = signExtend12Bit(offsetRaw);
        // let base = cpu.x[rs1] >>> 0;
        // let addr = base + offset;
        // let value = cpu.x[rs2];

        // switch (funct3) {
        //     case Funct3LoadStore.SB: mem.writeByte(addr, value); break;
        //     case Funct3LoadStore.SH: mem.writeHalfWord(addr, value); break;
        //     case Funct3LoadStore.SW: mem.writeWord(addr, value); break;
        //     default: break;
        // }

        // @TODO: implement STORE signals
        setRegCtrl(true, 0, 0);
        setRegCtrl(true, 0, 1);
        setRegCtrl(true, 0, 2);
        setAluCtrl(true, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.SYSTEM) {
        /*
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
        */
    } else if (opCode === 0x0) {
        /*
        console.log('Unknown op: ' + opCode, ins.toString(2).padStart(32, '0'), cpu.pc.toString(16));
        // dumpCpu(cpu);
        cpu.halt = true;
        cpu.haltReason = 'Unknown op: ' + opCode;
        */
    }

    // cpu.pc += pcOffset; // jump to location, or just move on to next instruction
    // cpu.x[0] = 0; // ensure x0 is always 0
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
