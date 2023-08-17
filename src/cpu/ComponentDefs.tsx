import { hasFlag, isNil } from "../utils/data";
import { CompNodeType, IComp, IExeComp, IExeNet, IExePhase, IExePort } from "./CpuModel";

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
        }
    }
}


export function buildDefault(comp: IComp): IExeComp<{}> {
    let builder = new ExeCompBuilder<{}>(comp);
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

function aluPhase0(comp: IExeComp<ICompDataAlu>) {
    let data = comp.data;
    let ctrl = data.inCtrlPort.value;
    let lhs = data.inAPort.value;
    let rhs = data.inBPort.value;
    let outPort = data.outPort;
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
function regFilePhase0(comp: IExeComp<ICompDataRegFile>) {
    let data = comp.data;
    let ctrl = data.inCtrlPort.value;
    let outAPort = data.outAPort;
    let outBPort = data.outBPort;
    let outBitsA = (ctrl >> (1 + 0)) & 0x1f;
    let outBitsB = (ctrl >> (1 + 6)) & 0x1f;

    let outAEnabled = ctrl & 0b1;
    let outBEnabled = (ctrl >> 6) & 0b1;

    outAPort.outputEnabled = !!outAEnabled;
    outBPort.outputEnabled = !!outBEnabled;
    outAPort.value = outAEnabled ? data.file[outBitsA] : 0;
    outBPort.value = outBEnabled ? data.file[outBitsB] : 0;
}

// phase1 writes
function regFilePhase1(comp: IExeComp) {
    let data = comp.data;
    let ctrl = data.inCtrlPort.value;
    let inData = data.inDataPort.value;

    let inBits = (ctrl >> (1 + 12)) & 0x1f;
    let inEnabled = (ctrl >> 12) & 0b1;

    comp.data.writeEnabled = !!inEnabled;
    comp.data.writeReg = inBits;
    comp.data.writeData = inData;
}

// phase2 latches
function regFilePhase2Latch(comp: IExeComp) {
    let data = comp.data;
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

function adderPhase0(comp: IExeComp<ICompDataAdder>) {
    let data = comp.data;
    let outPort = data.outPort;
    outPort.outputEnabled = true;
    outPort.value = data.inPort0.value + data.inPort1.value;
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
