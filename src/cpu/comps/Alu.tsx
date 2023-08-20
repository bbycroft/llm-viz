import { Vec3 } from "@/src/utils/vector";
import { PortDir, IComp, IExeComp, IExePort } from "../CpuModel";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

export function createAluComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let alu: ICompDef<ICompDataAlu> = {
        defId: 'aluRiscv32_0',
        name: "ALU",
        size: new Vec3(10, 6),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 3), type: PortDir.In, width: 6 },
            { id: 'lhs', name: 'LHS', pos: new Vec3(3, 0), type: PortDir.In, width: 32 },
            { id: 'rhs', name: 'RHS', pos: new Vec3(7, 0), type: PortDir.In, width: 32 },
            { id: 'result', name: 'Result', pos: new Vec3(5, 6), type: PortDir.OutTri, width: 32 },
        ],
        build: buildAlu,
    };

    return [alu];
}


interface ICompDataAlu {
    inCtrlPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
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

    console.log(`alu: ctrl=${ctrl.toString(2)} lhs=${lhs} rhs=${rhs} isEnabled=${isEnabled} isBranch=${isBranch}`);

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

    console.log('alu: res=' + outPort.value);
}
