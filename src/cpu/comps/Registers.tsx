import { Vec3 } from "@/src/utils/vector";
import { PortDir, IComp, IExeComp, IExePort } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder"

export function createRegisterComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let reg32: ICompDef<ICompDataRegFile> = {
        defId: 'reg32Riscv',
        name: "Registers",
        size: new Vec3(10, 24),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(5, 0), type: PortDir.In, width: 3 * 6 },
            { id: 'in', name: 'In', pos: new Vec3(0, 3), type: PortDir.In, width: 32 },
            { id: 'outA', name: 'Out A', pos: new Vec3(10, 3), type: PortDir.OutTri, width: 32 },
            { id: 'outB', name: 'Out B', pos: new Vec3(10, 5), type: PortDir.OutTri, width: 32 },
        ],
        build: buildRegFile,
    };

    let regSingle: ICompDef<ICompDataSingleReg> = {
        defId: 'reg1',
        name: "Register",
        size: new Vec3(10, 2),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(3, 0), type: PortDir.In, width: 1 },
            { id: 'in', name: 'In', pos: new Vec3(0, 1), type: PortDir.In, width: 32 },
            { id: 'out', name: 'Out', pos: new Vec3(10, 1), type: PortDir.Out, width: 32 },
        ],
        build: buildSingleReg,
    };

    return [reg32, regSingle];
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


export const riscvRegNames = [
    'zero', 'ra', 'sp', 'gp', 'tp',
    't0', 't1', 't2',
    's0', 's1',
    'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    't3', 't4', 't5', 't6'
];
