import { Vec3 } from "@/src/utils/vector";
import { PortType, IExeComp, IExePort } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { funct3BranchIcon, funct3BranchNames, funct3OpIcon, funct3OpText } from "./RiscvInsDecode";
import { Funct3Branch, Funct3Op } from "../RiscvIsa";
import { aluValToStr, ensureSigned32Bit, ensureUnsigned32Bit, regValToStr, transformCanvasToRegion } from "./CompHelpers";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";
import { drawLineRect } from "@/src/llm/components/ModelCard";
import { info } from "console";

interface ICompDataAlu {
    inCtrlPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
    branchPort: IExePort;
}

interface ICompAluConfig extends IBaseCompConfig {
}

export function createAluComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let alu: ICompDef<ICompDataAlu, ICompAluConfig> = {
        defId: 'riscv/alu0',
        altDefIds: ['aluRiscv32_0'],
        name: "ALU",
        size: new Vec3(16, 12),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(0, 3), type: PortType.In, width: 6 },
            { id: 'lhs', name: 'LHS', pos: new Vec3(3, 0), type: PortType.In, width: 32 },
            { id: 'rhs', name: 'RHS', pos: new Vec3(13, 0), type: PortType.In, width: 32 },

            { id: 'branch', name: 'Branch', pos: new Vec3(4, 12), type: PortType.Out, width: 1 },
            { id: 'result', name: 'Result', pos: new Vec3(8, 12), type: PortType.Out, width: 32 },
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
        render: ({ ctx, cvs, comp, exeComp, bb, styles }) => {
            let { inCtrlPort, inAPort, inBPort } = exeComp.data;

            let ctrl = inCtrlPort.value;
            let lhs = ensureSigned32Bit(inAPort.value);
            let rhs = ensureSigned32Bit(inBPort.value);

            let isEnabled = (ctrl & 0b000001) !== 0;
            let isBranch =  (ctrl & 0b000010) !== 0;

            let funct3 = (ctrl >> 2) & 0b111;
            let isInverted = funct3 & 0b1;
            let isArithShiftOrSub = ((ctrl >> 5) & 0b1) !== 0;

            let isSpecialUsed = funct3 === Funct3Op.ADD || funct3 === Funct3Op.SRAI;

            let isUnsigned = (!isBranch && isArithShiftOrSub && funct3 === Funct3Op.SRAI)
                || (!isBranch && funct3 === Funct3Op.SLTU)
                || (isBranch && funct3 === Funct3Branch.BLTU)
                || (isBranch && funct3 === Funct3Branch.BGEU);

            // want to show the integer values of the inputs and outputs (unless doing unsigned op)
            let opStr = '';
            let opText = '';
            if (isBranch) {
                opStr = funct3BranchIcon[funct3];
                opText = funct3BranchNames[funct3];
            } else {
                if (isArithShiftOrSub && funct3 === Funct3Op.ADD) {
                    opStr = '-';
                } else {
                    opStr = funct3OpIcon[funct3];
                }

                let opTextArr = funct3OpText[funct3];
                opText = Array.isArray(opTextArr) ? opTextArr[isArithShiftOrSub ? 1 : 0] : opTextArr;
            }
            let res = exeComp.data.outPort.value;
            let takeBranch = exeComp.data.branchPort.value;


            ctx.save();

            transformCanvasToRegion(cvs, styles, comp, bb);

            let w = comp.size.x;
            let h = comp.size.y;

            ctx.font = makeCanvasFont(styles.fontSize, FontType.Default);
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('ALU', w/2, 1.0);

            let lineY = styles.lineHeight;

            interface ILinePart {
                text: string;
                color: string;
                type?: FontType;
            }

            function drawTextLine(line: number, parts: ILinePart[], noBullet?: boolean) {
                let x = 1;
                let y = line * lineY + 1.2;

                if (!noBullet) {
                    parts = [{ text: '• ', color: infoColor }, ...parts];
                }

                for (let i = 0; i < parts.length; i++) {
                    let part = parts[i];
                    ctx.textAlign = 'left';
                    ctx.fillStyle = part.color;
                    ctx.font = makeCanvasFont(styles.fontSize, part.type);
                    let width = ctx.measureText(part.text).width;
                    ctx.fillText(part.text, x, y);
                    x += width;
                }
            }

            // let opColor = '#e33';

            // let rs1Color = '#3e3';
            // let rs2Color = '#33e';
            // let rdColor = '#ee3';
            // let immColor = '#a3a';
            // let func3Color = '#333';
            // let infoColor = '#555';

            let baseColor = '#000';
            let isBranchColor = '#a3a';
            let enabledColor = '#e33';
            let func3Color = '#000';
            let lhsColor = '#3f3';
            let rhsColor = '#33e';
            let resColor = '#ee3';
            let unusedColor = '#666';
            let infoColor = '#555';

            drawTextLine(1, [
                { text: 'Ctrl: ', color: infoColor, type: FontType.Italic },
                { text: isArithShiftOrSub ? '1' : '0', color: isSpecialUsed && isEnabled ? func3Color : unusedColor },
                { text: funct3.toString(2).padStart(3, '0'), color: isEnabled ? func3Color : unusedColor },
                { text: isBranch ? '1' : '0', color: isEnabled ? isBranchColor : unusedColor },
                { text: isEnabled ? '1' : '0', color: enabledColor },
            ], true);


            let actionLine: ILinePart[] = []; //{ text: 'Action: ', color: infoColor, type: FontType.Italic }];

            if (!isEnabled) {
                actionLine.push({ text: 'disabled', color: enabledColor, type: FontType.Italic });
            } else {

                if (isBranch) {
                    actionLine.push({ text: 'do ', color: infoColor });
                    actionLine.push({ text: 'compare ', color: isBranchColor });
                    actionLine.push({ text: opText, color: func3Color });

                } else {
                    actionLine.push({ text: 'do ', color: infoColor });
                    actionLine.push({ text: 'arith ', color: isBranchColor });
                    actionLine.push({ text: opText, color: func3Color });
                }

            }

            drawTextLine(2, actionLine);

            if (isEnabled) {
                drawTextLine(3, [
                    { text: 'LHS: ', color: infoColor, type: FontType.Italic },
                    { text: aluValToStr(lhs, 0, !isUnsigned), color:  lhsColor },
                ]);

                drawTextLine(4, [
                    { text: 'OP: ', color: infoColor, type: FontType.Italic },
                    { text: opStr, color: func3Color },
                ]);

                drawTextLine(5, [
                    { text: 'RHS: ', color: infoColor, type: FontType.Italic },
                    { text: aluValToStr(rhs, 0, !isUnsigned), color: rhsColor },
                ]);

                if (isBranch) {
                    drawTextLine(6, [
                        { text: 'RES: ', color: infoColor, type: FontType.Italic },
                        { text: takeBranch ? 'true (take branch)' : 'false (no branch)', color: resColor },
                    ]);
                } else {
                    drawTextLine(6, [
                        { text: '=> ', color: infoColor, type: FontType.Italic },
                        { text: aluValToStr(res, 0, !isUnsigned), color: resColor },
                    ]);
                }
            }

            ctx.restore();
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
-- bit      0: ALU enabled
-- bit      1: 0 = arith, 1 = branch
-- bits [4:2]: = funct3
-- bit      5: sub/shift logical
*/

function aluPhase0({ data: { inCtrlPort, inAPort, inBPort, outPort, branchPort } }: IExeComp<ICompDataAlu>) {
    let ctrl = inCtrlPort.value;
    let lhs = ensureSigned32Bit(inAPort.value);
    let rhs = ensureSigned32Bit(inBPort.value);

    let isEnabled = (ctrl & 0b000001) !== 0;
    let isBranch =  (ctrl & 0b000010) !== 0;

    // console.log(`alu: ctrl=${ctrl.toString(2)} lhs=${lhs} rhs=${rhs} isEnabled=${isEnabled} isBranch=${isBranch}`, rhs);

    inAPort.ioEnabled = isEnabled;
    inBPort.ioEnabled = isEnabled;
    branchPort.value = 0;

    if (!isEnabled) {
        return;
    }

    if (isBranch) {
        let funct3 = (ctrl >> 2) & 0b111;
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
        // console.log('alu: branch res=' + res + ' isInverted=' + isInverted + ' branchPort=' + branchPort.value);
    } else {
        let funct3 = (ctrl >> 2) & 0b111;
        let isArithShiftOrSub = ((ctrl >> 5) & 0b1) !== 0;
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
