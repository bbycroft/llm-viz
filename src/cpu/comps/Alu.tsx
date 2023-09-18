import React from "react";
import { Vec3 } from "@/src/utils/vector";
import { PortType, IExeComp, IExePort } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { ensureSigned32Bit, ensureUnsigned32Bit, funct3BranchIcon, funct3OpIcon } from "./RiscvInsDecode";
import s from './CompStyles.module.scss';
import clsx from "clsx";
import { Funct3Op } from "../RiscvIsa";
import { createCanvasDivStyle } from "./RenderHelpers";

interface ICompDataAlu {
    inCtrlPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
    branchPort: IExePort;
}

export function createAluComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let alu: ICompDef<ICompDataAlu> = {
        defId: 'riscv/alu0',
        altDefIds: ['aluRiscv32_0'],
        name: "ALU",
        size: new Vec3(16, 12),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 3), type: PortType.In, width: 6 },
            { id: 'lhs', name: 'LHS', pos: new Vec3(3, 0), type: PortType.In, width: 32 },
            { id: 'rhs', name: 'RHS', pos: new Vec3(13, 0), type: PortType.In, width: 32 },

            { id: 'branch', name: 'Branch', pos: new Vec3(4, 12), type: PortType.Out, width: 1 },
            { id: 'result', name: 'Result', pos: new Vec3(8, 12), type: PortType.OutTri, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inCtrlPort: builder.getPort('ctrl'),
                inAPort: builder.getPort('lhs'),
                inBPort: builder.getPort('rhs'),
                outPort: builder.getPort('result'),
                branchPort: builder.getPort('branch'),
            });
            builder.addPhase(aluPhase0, [data.inCtrlPort, data.inAPort, data.inBPort], [data.outPort, data.branchPort]);
            return builder.build();
        },
        renderDom: ({ comp, exeComp }) => {
            if (!exeComp) {
                return <div className={clsx(s.baseComp, s.rectComp)} style={{ ...createCanvasDivStyle(comp) }}>
                    <div>ALU <span style={{ fontFamily: 'monospace' }}>{(0).toString(2).padStart(5, '0')}</span></div>
                </div>;
            }

            let { inCtrlPort, inAPort, inBPort } = exeComp.data;

            let ctrl = inCtrlPort.value;
            let lhs = ensureSigned32Bit(inAPort.value);
            let rhs = ensureSigned32Bit(inBPort.value);

            let isEnabled = (ctrl & 0b100000) !== 0;
            let isBranch =  (ctrl & 0b010000) !== 0;

            let funct3 = (ctrl >> 1) & 0b111;
            let isInverted = funct3 & 0b1;
            let isArithShiftOrSub = (ctrl & 0b1) !== 0;

            // want to show the integer values of the inputs and outputs (unless doing unsigned op)
            let opStr = '';
            if (isBranch) {
                opStr = funct3BranchIcon[funct3];
            } else {
                if (isArithShiftOrSub && funct3 === Funct3Op.ADD) {
                    opStr = '-';
                } else {
                    opStr = funct3OpIcon[funct3];
                }
            }
            let res = exeComp.data.outPort.value;
            let takeBranch = exeComp.data.branchPort.value;

            // also show the OP (branch or otherwise), and show the result, as well as the branch result
            return <div className={clsx(s.baseComp, s.rectComp)} style={{ ...createCanvasDivStyle(comp), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div>ALU <span style={{ fontFamily: 'monospace' }}>{exeComp?.data.inCtrlPort.value.toString(2).padStart(5, '0')}</span></div>
                {!isEnabled && <div>{'[disabled]'}</div>}
                {isEnabled && <>
                    {!isBranch && <>
                        <div>
                            {lhs} {opStr} {rhs}
                        </div>
                        <div>v</div>
                        <div>{ensureSigned32Bit(res).toString()}</div>
                    </>}
                    {isBranch && <>
                        <div>
                            {lhs} {opStr} {rhs}
                        </div>
                        <div>v</div>
                        <div>{takeBranch ? 'BRANCH' : '(no branch)'}</div>
                    </>}
                </>}
            </div>;
        },
    };

    return [alu];
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

function aluPhase0({ data: { inCtrlPort, inAPort, inBPort, outPort, branchPort } }: IExeComp<ICompDataAlu>) {
    let ctrl = inCtrlPort.value;
    let lhs = ensureSigned32Bit(inAPort.value);
    let rhs = ensureSigned32Bit(inBPort.value);

    let isEnabled = (ctrl & 0b100000) !== 0;
    let isBranch =  (ctrl & 0b010000) !== 0;

    // console.log(`alu: ctrl=${ctrl.toString(2)} lhs=${lhs} rhs=${rhs} isEnabled=${isEnabled} isBranch=${isBranch}`, rhs);

    inAPort.ioEnabled = isEnabled;
    inBPort.ioEnabled = isEnabled;
    outPort.ioEnabled = isEnabled && !isBranch;
    branchPort.ioEnabled = false;
    branchPort.value = 0;

    if (!isEnabled) {
        return;
    }

    if (isBranch) {
        let funct3 = (ctrl >> 1) & 0b111;
        let isInverted = funct3 & 0b1;
        let opts = funct3 & 0b110;
        let res = false;
        switch (opts) {
            case 0b000: res = lhs === rhs; break;
            case 0b100: res = lhs < rhs; break;
            case 0b110: res = (lhs >>> 0) < (rhs >>> 0); break;
        }
        // branch may need its own output port?
        outPort.value = 0;
        branchPort.value = (res ? 1 : 0) ^ isInverted;
        branchPort.ioEnabled = true;
        // console.log('alu: branch res=' + res + ' isInverted=' + isInverted + ' branchPort=' + branchPort.value);
    } else {
        let funct3 = (ctrl >> 1) & 0b111;
        let isArithShiftOrSub = (ctrl & 0b1) !== 0;
        let res = 0;
        switch (funct3) {
            case 0b000: res = isArithShiftOrSub ? lhs - rhs : lhs + rhs; break; // add/sub
            case 0b001: res = lhs << rhs; break; // shift left logical
            case 0b010: res = ensureSigned32Bit(lhs) < ensureSigned32Bit(rhs) ? 1 : 0; break; // set less than
            case 0b011: res = ensureUnsigned32Bit(lhs) < ensureUnsigned32Bit(rhs) ? 1 : 0; break; // set less than unsigned
            case 0b100: res = lhs ^ rhs; break; // xor
            case 0b101: res = isArithShiftOrSub ? lhs >> rhs : lhs >>> rhs ; break; // shift right arithmetic/logical
            case 0b110: res = lhs | rhs; break; // or
            case 0b111: res = lhs & rhs; break; // and
        }
        outPort.value = ensureSigned32Bit(res);
    }

    // console.log('alu: res=' + outPort.value);
}
