import { Vec3 } from "@/src/utils/vector";
import { IExePort, IExeComp, PortType, ICompRenderArgs, IExeRunArgs } from "../CpuModel";
import { OpCode, Funct3Op, Funct3OpImm, Funct3Branch, Funct3LoadStore } from "../RiscvIsa";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import * as d3Color from 'd3-color';
import { riscvRegNames } from "./Registers";
import { isNotNil } from "@/src/utils/data";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";

export function createRiscvInsDecodeComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 40;
    let h = 20;
    let alu: ICompDef<ICompDataInsDecoder> = {
        defId: 'riscv/insDecode0',
        altDefIds: ['insDecodeRiscv32_0'],
        name: "Instruction Decoder",
        size: new Vec3(w, h),
        ports: [
            { id: 'ins', name: 'Ins', pos: new Vec3(0, 1), type: PortType.In | PortType.Data, width: 32 },

            { id: 'loadStoreCtrl', name: 'LS', pos: new Vec3(w, 1), type: PortType.Out | PortType.Ctrl, width: 5 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(w, 2), type: PortType.Out | PortType.Addr, width: 32 },
            { id: 'rhsImm', name: 'RHS Imm', pos: new Vec3(w, 6), type: PortType.Out | PortType.Data, width: 32 },
            { id: 'rhsSel', name: 'RHS Sel', pos: new Vec3(w, 8), type: PortType.Out | PortType.Ctrl, width: 1 },

            { id: 'pcRegMuxCtrl', name: 'Mux', pos: new Vec3(1, h), type: PortType.Out | PortType.Ctrl, width: 1 },
            { id: 'regCtrl', name: 'Reg', pos: new Vec3(4, h), type: PortType.Out | PortType.Ctrl, width: 3 * 6 },
            { id: 'pcAddImm', name: 'PC+Imm', pos: new Vec3(7, h), type: PortType.Out | PortType.Addr, width: 32 },
            // { id: 'pcOutTristateCtrl', name: 'PC LHS', pos: new Vec3(5, h), type: PortDir.Out | PortDir.Ctrl, width: 1 },

            { id: 'pcBranchCtrl', name: 'PC Branch', pos: new Vec3(11, h), type: PortType.Out | PortType.Ctrl, width: 1 },
            { id: 'lhsSel', name: 'LHS Sel', pos: new Vec3(15, h), type: PortType.Out | PortType.Ctrl, width: 1 },
            { id: 'aluCtrl', name: 'ALU', pos: new Vec3(18, h), type: PortType.Out | PortType.Ctrl, width: 5 },
        ],
        build: (builder) => {
            let data = builder.addData({
                ins: builder.getPort('ins'),

                addrOffset: builder.getPort('addrOffset'),
                rhsImm: builder.getPort('rhsImm'),
                regCtrl: builder.getPort('regCtrl'),
                loadStoreCtrl: builder.getPort('loadStoreCtrl'),
                aluCtrl: builder.getPort('aluCtrl'),
                // pcOutTristateCtrl: builder.getPort('pcOutTristateCtrl'),
                pcRegMuxCtrl: builder.getPort('pcRegMuxCtrl'),

                pcAddImm: builder.getPort('pcAddImm'),
                lhsSel: builder.getPort('lhsSel'),
                rhsSel: builder.getPort('rhsSel'),

                pcBranchCtrl: builder.getPort('pcBranchCtrl'),
            });

            builder.addPhase(insDecoderPhase0, [data.ins], [data.addrOffset, data.rhsImm, data.regCtrl, data.loadStoreCtrl, data.aluCtrl, data.pcRegMuxCtrl, data.lhsSel, data.rhsSel, data.pcAddImm]);

            return builder.build(data);
        },
        render: renderInsDecoder,
    };

    return [alu];
}

export interface ICompDataInsDecoder {
    ins: IExePort;

    addrOffset: IExePort; // will get added to load/store address
    rhsImm: IExePort; // set's the RHS with an immediate value
    regCtrl: IExePort; // 3x 6-bit values: [0: outA, 1: outB, 2: inA]
    loadStoreCtrl: IExePort; // controls load/store
    aluCtrl: IExePort; // controls ALU, 5-bit value: [0: enable, 1: isBranch, 2: funct3, 3: isSpecial]
    // pcOutTristateCtrl: IExePort; // 1-bit value, enables PC -> LHS
    pcRegMuxCtrl: IExePort; // 1-bit value, controls writes to (PC, REG), from (ALU out, PC + x), or swaps them

    pcAddImm: IExePort; // gets added to PC, overrides +4 for jumps
    lhsSel: IExePort; // 1-bit value, selects between PC & Reg A for LHS
    rhsSel: IExePort; // 1-bit value, selects between Reg B & Imm for RHS
    pcBranchCtrl: IExePort; // 1-bit value, selects between PC + 4 and PC + imm
}

function insDecoderPhase0({ data }: IExeComp<ICompDataInsDecoder>, runArgs: IExeRunArgs) {
    let ins = data.ins.value >>> 0;

    const opCode = ins & 0b1111111;
    const funct3 = (ins >>> 12) & 0b111;
    const rd = (ins >>> 7) & 0b11111;
    const rs1 = (ins >>> 15) & 0b11111;
    const rs2 = (ins >>> 20) & 0b11111;

    data.regCtrl.value = 0;
    // 1: ALU out => REG, PC + x => PC
    // 0: ALU out => PC,  PC + x => REG
    data.pcRegMuxCtrl.value = 1;
    data.pcAddImm.value = 0;
    data.rhsImm.value = 0;
    data.lhsSel.value = 1; // inverted
    data.pcBranchCtrl.value = 0;
    data.aluCtrl.value = 0;
    data.loadStoreCtrl.value = 0;
    data.rhsSel.value = 1;

    if (ins === 0) {
        // console.log('ILLEGAL INSTRUCTION: 0x0');
        // runArgs.halt = true;
        // data.willHalt = true;
        // NOP
        return;
    }

    // 0: read LHS, 1: read RHS, 2: write
    function setRegCtrl(enable: boolean, addr: number, offset: number) {
        let a = (enable ? 1 : 0) | (addr & 0b11111) << 1;
        let val = data.regCtrl.value;
        val = (val & ~(0b111111 << (offset * 6))) | (a << (offset * 6));
        data.regCtrl.value = val;
    }

    function setAluCtrl(enable: boolean, isBranch: boolean, funct3: number, isSpecial: boolean) {
        let val = (enable ? 1 : 0) << 5 |
                  (isBranch ? 1 : 0) << 4 |
                  funct3 << 1 |
                  (isSpecial ? 1 : 0) << 0;
        data.aluCtrl.value = val;
    }

    function setLoadStoreCtrl(enable: boolean, isLoad: boolean, funct3: number) {
        let val = (enable ? 1 : 0) << 0 |
                  (isLoad ? 1 : 0) << 1 |
                  funct3 << 2;
        data.loadStoreCtrl.value = val;
    }

    // console.log('opcode: ' + opCode.toString(16), ins.toString(2).padStart(32, '0'), OpCode[opCode], Funct3Op[funct3]);

    if (opCode === OpCode.OPIMM || opCode === OpCode.OP) {
        // console.log('OPIMM/OP', ins.toString(2).padStart(32, '0'));
        let isArithShiftOrSub = false;

        if (opCode === OpCode.OP) {
            setRegCtrl(true, rs2, 1); // reg[rs2] => RHS
            isArithShiftOrSub = ((ins >>> 30) & 0b1) === 0b1;
        } else if (funct3 === Funct3Op.SLLI || funct3 === Funct3Op.SRLI || funct3 === Funct3Op.SRAI) {
            data.rhsImm.value = rs2;
            data.rhsSel.value = 0; // RHS Imm
        } else {
            data.rhsImm.value = signExtend12Bit(ins >>> 20);
            data.rhsSel.value = 0; // RHS Imm
        }

        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        setAluCtrl(true, false, funct3, isArithShiftOrSub);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.LUI) {
        data.rhsImm.value = signExtend20Bit(ins >>> 12) << 12;
        data.rhsSel.value = 0; // RHS Imm
        setRegCtrl(true, 0x0, 0); // 0 => LHS
        setAluCtrl(true, false, Funct3Op.ADD, false);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.AUIPC) {
        data.rhsImm.value = signExtend20Bit(ins >>> 12) << 12;
        data.rhsSel.value = 0; // RHS Imm
        data.lhsSel.value = 0; // PC -> LHS enabled
        setAluCtrl(true, false, Funct3Op.ADD, false);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.JAL) {
        let offsetRaw = (((ins >>> 21) & 0x3FF) << 0) | // 10 bytes
                        (((ins >>> 20) & 0x01) << 10) | // 1 byte
                        (((ins >>> 12) & 0xFF) << 11) | // 8 bytes
                        (((ins >>> 31) & 0x01) << 19);  // 1 byte

        data.lhsSel.value = 0; // PC -> LHS enabled
        data.rhsImm.value = signExtend20Bit(offsetRaw) << 1;
        data.rhsSel.value = 0; // RHS Imm
        data.pcRegMuxCtrl.value = 0; // ALU out => PC; PC + 4 => REG
        setRegCtrl(true, rd, 2); // PC + 4 => reg[rd]
        setAluCtrl(true, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.JALR) {
        let offset = signExtend12Bit(ins >>> 20);
        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        data.rhsImm.value = offset;
        data.rhsSel.value = 0; // RHS Imm
        data.pcRegMuxCtrl.value = 0; // ALU out => PC; PC + 4 => REG
        setRegCtrl(true, rd, 2); // PC + 4 => reg[rd]
        setAluCtrl(true, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.BRANCH) {

        setRegCtrl(true, rs1, 0); // reg[rs1] => LHS
        setRegCtrl(true, rs2, 1); // reg[rs2] => RHS

        setAluCtrl(true, true, funct3, false);

        let offsetRaw = (((ins >>>  8) & 0x0F) << 0 ) | // 4 bits
                        (((ins >>> 25) & 0x3F) << 4 ) | // 6 bits
                        (((ins >>>  7) & 0x01) << 10) | // 1 bits
                        (((ins >>> 31) & 0x01) << 11);  // 1 bits

        data.pcAddImm.value = signExtend12Bit(offsetRaw) << 1;
        // console.log('branch offset: ' + data.pcAddImm.value.toString(16), data.pcAddImm.value);
        data.lhsSel.value = 1; // PC + offset => PC @TODO: not sure about this one, als a function of branch output
        data.pcBranchCtrl.value = 0; // PC + offset => PC

    } else if (opCode === OpCode.LOAD) {
        let offset = signExtend12Bit(ins >>> 20);
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
        setLoadStoreCtrl(true, true, funct3);
        data.addrOffset.value = offset;
        setRegCtrl(true, rs1, 0);
        setRegCtrl(true, 0, 1);
        setRegCtrl(true, rd, 2);
        setAluCtrl(false, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.STORE) {
        let offsetRaw = (((ins >>>  7) & 0x1F)     ) | // 5 bytes
                        (((ins >>> 25) & 0x7F) << 5);  // 7 bytes

        let offset = signExtend12Bit(offsetRaw);

        // switch (funct3) {
        //     case Funct3LoadStore.SB: mem.writeByte(addr, value); break;
        //     case Funct3LoadStore.SH: mem.writeHalfWord(addr, value); break;
        //     case Funct3LoadStore.SW: mem.writeWord(addr, value); break;
        //     default: break;
        // }

        setLoadStoreCtrl(true, false, funct3 & 0b11);
        data.addrOffset.value = offset;
        setRegCtrl(true, rs1, 0);
        setRegCtrl(true, rs2, 1);
        setRegCtrl(true, 0, 2);
        setAluCtrl(false, false, Funct3Op.ADD, false);

    } else if (opCode === OpCode.SYSTEM) {
        runArgs.halt = true;
        // data.willHalt = true;
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
    } else if (ins === 0) {
        // NOP
    } else {
        runArgs.halt = true;
        /*
        console.log('Unknown op: ' + opCode, ins.toString(2).padStart(32, '0'), cpu.pc.toString(16));
        // dumpCpu(cpu);
        cpu.halt = true;
        cpu.haltReason = 'Unknown op: ' + opCode;
        */
    }

    if (data.lhsSel.value) {
        // data.regCtrl.value |= 0b1;
        // setRegCtrl(true, 0, 0); // 0 => LHS (to ensure we don't leave a floating value on the bus)
    }
    // if (data.rhsImm.ioEnabled) {
    //     data.rhsImm.ioDir = IoDir.Out;
    // }
    // cpu.pc += pcOffset; // jump to location, or just move on to next instruction
    // cpu.x[0] = 0; // ensure x0 is always 0
}



export function signExtend8Bit(x: number) {
    return ((x & 0x80) !== 0) ? x - 0x100 : x;
}

export function signExtend12Bit(x: number) {
    return ((x & 0x800) !== 0) ? x - 0x1000 : x;
}

export function signExtend16Bit(x: number) {
    return ((x & 0x8000) !== 0) ? x - 0x10000 : x;
}

export function signExtend20Bit(x: number) {
    return (x & (1 << 19)) ? x - (1 << 20) : x;
}

export function signExtend32Bit(x: number) {
    return ((x & 0x80000000) !== 0) ? x - 0x100000000 : x;
}

let u32Arr = new Uint32Array(1);
let s32Arr = new Int32Array(1);

export function ensureSigned32Bit(x: number) {
    s32Arr[0] = x;
    return s32Arr[0];
}

export function ensureUnsigned32Bit(x: number) {
    u32Arr[0] = x;
    return u32Arr[0];
}

function renderInsDecoder({ ctx, comp, exeComp, cvs, styles }: ICompRenderArgs<ICompDataInsDecoder>) {

    return;

    if (!exeComp) {
        return;
    }

    let data = exeComp.data;
    let ins = data.ins.value;

    ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
    let originalBitStr = ins.toString(2).padStart(32, '0');
    let width = ctx.measureText(originalBitStr).width;

    let leftX = comp.pos.x + comp.size.x/2 - width/2;
    let lineY = (a: number) => comp.pos.y + 1.0 + styles.lineHeight * (a + 2.0);

    ctx.font = makeCanvasFont(styles.fontSize, FontType.Default | FontType.Italic);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('RISCV 32-bit Instruction Decode', leftX + width/2, lineY(-1.5));

    ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let hexText = ins.toString(16).padStart(8, '0');

    let alignedHexText = '';
    for (let i = 0; i < 4; i++) {
        alignedHexText += '   ' + hexText.substring(i * 2, i * 2 + 2) + '   ';
    }


    ctx.fillText(alignedHexText, leftX, lineY(0));
    // ctx.fillText(ins.toString(2).padStart(32, '0'), leftX, comp.pos.y + 0.5 + styles.lineHeight);


    // vertical lines separating the hex digits
    for (let i = 0; i < 3; i++) {
        let x = leftX + width / 4 * (i + 1);
        ctx.beginPath();
        ctx.moveTo(x, lineY(0));
        ctx.lineTo(x, lineY(2) - 0.2 * styles.lineHeight);
        ctx.setLineDash([0.4, 0.3]);
        ctx.strokeStyle = '#0005';
        ctx.stroke();
        ctx.setLineDash([]);
    }

    let strRemain = originalBitStr;

    let drawBitRange = (rightBit: number, count: number, color: string) => {
        let totalBits = originalBitStr.length;
        let rightIdx = totalBits - rightBit - 1;
        let leftIdx = rightIdx - count + 1;
        let str = originalBitStr.substring(leftIdx, rightIdx + 1);
        let strWrapped = ' '.repeat(leftIdx) + str + ' '.repeat(totalBits - rightIdx - 1);
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        ctx.fillText(strWrapped, leftX, lineY(1));
        strRemain = strRemain.substring(0, leftIdx) + ' '.repeat(count) + strRemain.substring(rightIdx + 1);
    };
    let bitRangeCenter = (rightBit: number, count: number) => {
        let bitWidth = width / originalBitStr.length;
        let targetIdx = originalBitStr.length - rightBit - count / 2;
        return leftX + bitWidth * targetIdx;
    };

    let opColor = '#e33';

    let rs1Color = '#3e3';
    let rs2Color = '#33e';
    let rdColor = '#ee3';
    let immColor = '#a3a';
    let func3Color = '#333';
    let infoColor = '#555';

    drawBitRange(0, 7, opColor);

    let opCode = ins & 0b1111111;
    const rd = (ins >>> 7) & 0b11111;
    const rs1 = (ins >>> 15) & 0b11111;
    const rs2 = (ins >>> 20) & 0b11111;

    let funct3 = (ins >>> 12) & 0b111;

    let drawBitsAndText = (rightBit: number, count: number, color: string, text: string, label: string) => {
        drawBitRange(rightBit, count, color);
        let center = bitRangeCenter(rightBit, count);
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(text, center, lineY(2));
    }

    let infoFont1 = makeCanvasFont(styles.fontSize * 0.8, FontType.Mono);
    let infoFont2 = makeCanvasFont(styles.fontSize * 0.6, FontType.Default | FontType.Italic);
    let line2Height = 3.5;
    let line3Height = 4.5;
    let line4Height = 5.5;

    interface IMessagePart {
        color: string;
        text: string;
        italic?: boolean;
    }

    let drawMessage = (parts: IMessagePart[], height: number, noBullet?: boolean) => {
        ctx.save();
        ctx.textAlign = 'left';
        let offset = leftX;
        if (!noBullet) {
            parts = [{ text: '• ', color: infoColor }, ...parts];
        }
        for (let part of parts) {
            ctx.font = part.italic ? infoFont2 : infoFont1;
            ctx.fillStyle = part.color;
            ctx.fillText(part.text, offset, lineY(height) + (part.italic ? 0.1 : 0));
            offset += ctx.measureText(part.text).width;
        }
        ctx.restore();
    };

    let drawOpAndMessage = (opCodeStr: string, funct3Str: string, message: string) => {
        let parts: IMessagePart[] = [{ color: opColor, text: opCodeStr }];
        if (funct3Str) {
            parts.push({ color: infoColor, text: ', ' }, { color: func3Color, text: funct3Str });
        }
        parts.push({ color: infoColor, text: '  —  ' + message, italic: true });
        drawMessage(parts, line2Height, true);
    };

    let drawMultiBits = (bitPattern: number[], bitColorOffsets: number[], color: string, label: string) => {
        for (let i = 0; i < bitColorOffsets.length; i += 1) {
            drawBitsAndText(bitPattern[i * 2], bitPattern[i * 2 + 1], d3Color.rgb(color).darker(bitColorOffsets[i]).toString(), '.', label + i);
        }
    };

    let buildBitsMessage = (bitPattern: number[], bitColorOffsets: number[], color: string) => {
        let parts: IMessagePart[] = [];
        for (let i = bitColorOffsets.length - 1; i >= 0; i -= 1) {
            let rightBit = bitPattern[i * 2];
            let count = bitPattern[i * 2 + 1];
            let totalBits = originalBitStr.length;
            let rightIdx = totalBits - rightBit - 1;
            let leftIdx = rightIdx - count + 1;
            let str = originalBitStr.substring(leftIdx, rightIdx + 1);
            parts.push({ color: d3Color.rgb(color).darker(bitColorOffsets[i]).toString(), text: str });
        }
        return parts;
    };
    // let drawFunc3AndMessage = (funct3Str: string, message: string) => {
    //     drawInfoAndMessage(funct3Str, func3Color, message, 4.5);
    // }

    drawBitsAndText(0, 7, opColor, OpCode[opCode] || '<invalid>', 'op');

    if (opCode === OpCode.OP || opCode === OpCode.OPIMM) {
        drawBitsAndText(15, 5, rs1Color, rs1.toString(), 'rs1');

        let funct3Str: string = '';

        if (opCode === OpCode.OP) {
            drawBitsAndText(20, 5, rs2Color, rs2.toString(), 'rs2');
            funct3Str = Funct3Op[funct3];
            let checkExtraBit = funct3 === Funct3Op.SLL || funct3 === Funct3Op.SRL || funct3 === Funct3Op.ADD;
            let isArithShiftOrSub = ((ins >>> 30) & 0b1) === 0b1;
            let isSub = funct3 === Funct3Op.ADD && isArithShiftOrSub;
            if (checkExtraBit) {
                drawBitsAndText(30, 1, func3Color, isArithShiftOrSub ? ('sub') : '0', 'extra');
            }
            drawOpAndMessage('OP', Funct3Op[funct3], `binary op between 2 registers`);
            // set [rd] <= [rs1] + [rs2]
            drawMessage([
                { color: infoColor, text: 'set ' },
                { color: rdColor, text: regFormatted(rd) },
                { color: infoColor, text: ' to: ' },
                { color: rs1Color, text: regFormatted(rs1) },
                { color: func3Color, text: ' ' + (isSub ? '-' : funct3OpIcon[funct3]) + ' ' },
                { color: rs2Color, text: regFormatted(rs2) },
            ], line3Height);

        } else if (opCode === OpCode.OPIMM) {
            drawBitsAndText(20, 12, immColor, data.rhsImm.value.toString(), 'imm');
            if (funct3 === Funct3OpImm.ADDI && rs1 === 0) {
                drawOpAndMessage('LI', '', `load immediate into register (via OPIMM ADDI & zero reg)`);
                drawMessage([
                    { color: infoColor, text: 'load immediate' },
                    { color: immColor, text: ` ${ensureSigned32Bit(data.rhsImm.value)} ` },
                    { color: infoColor, text: 'into ' },
                    { color: rdColor, text: regFormatted(rd) },
                ], line3Height);
            } else {
                drawOpAndMessage('OPIMM', Funct3OpImm[funct3], `binary op between register & immediate`);
                // set [rd] <= [rs1] + [imm]
                drawMessage([
                    { color: infoColor, text: 'set ' },
                    { color: rdColor, text: regFormatted(rd) },
                    { color: infoColor, text: ' to: ' },
                    { color: rs1Color, text: regFormatted(rs1) },
                    { color: func3Color, text: ' ' + funct3OpIcon[funct3] + ' ' },
                    { color: immColor, text: `${ensureSigned32Bit(data.rhsImm.value)}` },
                ], line3Height);
            }
            funct3Str = Funct3OpImm[funct3];
        }

        drawBitsAndText(12, 3, func3Color, funct3Str, 'funct3');
        drawBitsAndText(7, 5, rdColor, rd.toString(), 'rd');

    } else if (opCode === OpCode.BRANCH) {
        drawBitsAndText(15, 5, rs1Color, rs1.toString(), 'rs1');
        drawBitsAndText(20, 5, rs2Color, rs2.toString(), 'rs2');
        drawBitsAndText(12, 3, func3Color, Funct3Branch[funct3], 'funct3');

        let bitPattern = [8, 4,  25, 6,  7, 1,  31, 1];
        let bitColorOffsets = [-0.5, 0, 1, 2];

        drawMultiBits(bitPattern, bitColorOffsets, immColor, 'i');

        drawOpAndMessage('BRANCH', Funct3Branch[funct3], `jump if the condition is met (${funct3BranchNames[funct3]})`);

        let isUnsigned = funct3 === Funct3Branch.BLTU || funct3 === Funct3Branch.BGEU;
        drawMessage([
            { color: infoColor, text: 'branch if ' },
            { color: rs1Color, text: regFormatted(rs1) },
            { color: func3Color, text: ' ' + funct3BranchIcon[funct3] + ' ' },
            { color: rs2Color, text: regFormatted(rs2) },
            isUnsigned ? { color: infoColor, text: ' (unsigned)' } : null,
        ].filter(isNotNil), line3Height);

        drawMessage([
            { color: infoColor, text: 'to ' },
            { color: '#000', text: 'PC + ' },
            ...buildBitsMessage(bitPattern, bitColorOffsets, immColor),
            { color: '#000', text: '0' },
            { color: immColor, text: ` (${ensureSigned32Bit(data.pcAddImm.value)})` },
        ], line4Height);

    } else if (opCode === OpCode.JAL) {
        let bitPattern = [21, 10,  20, 1,  12, 8,  31, 1];
        let bitColorOffsets = [-0.5, 0, 1, 2];

        drawBitsAndText(7, 5, rdColor, rd.toString(), 'rd');
        drawMultiBits(bitPattern, bitColorOffsets, immColor, 'i');

        drawOpAndMessage('JAL', '', `jump to address (& store PC + 4 in register)`);
        drawMessage([
            { color: infoColor, text: 'set ' },
            { color: rdColor, text: regFormatted(rd) },
            { color: infoColor, text: ' to ' },
            { color: '#000', text: 'PC + 4' },
        ], line3Height);
        // jump to PC + <imm>
        drawMessage([
            { color: infoColor, text: 'jump to ' },
            { color: '#000', text: 'PC + ' },
            ...buildBitsMessage(bitPattern, bitColorOffsets, immColor),
            { color: immColor, text: ` (${ensureSigned32Bit(data.rhsImm.value)})` },
        ], line4Height);

    } else if (opCode === OpCode.JALR) {
        drawBitsAndText(15, 5, rs1Color, rs1.toString(), 'rs1');
        drawBitsAndText(7, 5, rdColor, rd.toString(), 'rd');
        drawBitsAndText(20, 12, immColor, data.rhsImm.value.toString(), 'imm');

        drawOpAndMessage('JALR', '', `jump to reg + imm (& store PC + 4 in register)`);
        drawMessage([
            { color: infoColor, text: 'set ' },
            { color: rdColor, text: regFormatted(rd) },
            { color: infoColor, text: ' to ' },
            { color: '#000', text: 'PC + 4' },
        ], line3Height);
        drawMessage([
            { color: infoColor, text: 'jump to ' },
            { color: rs1Color, text: regFormatted(rs1) },
            { color: infoColor, text: ' + ' },
            ...buildBitsMessage([20, 12], [0], immColor),
        ], line4Height);

    } else if (opCode === OpCode.LOAD) {
        drawBitsAndText(15, 5, rs1Color, rs1.toString(), 'rs1');
        drawBitsAndText(7, 5, rdColor, rd.toString(), 'rd');
        let funct3Str = Funct3LoadStore[funct3].replace('S', 'L');
        drawBitsAndText(12, 3, func3Color, funct3Str, 'funct3');
        drawBitsAndText(20, 12, immColor, data.addrOffset.value.toString(), 'imm');

        drawOpAndMessage('LOAD', funct3Str, `load from memory (reg + offset)`);

        drawMessage([
            { color: infoColor, text: 'load from ' },
            { color: rs1Color, text: regFormatted(rs1) },
            { color: infoColor, text: ' + ' },
            ...buildBitsMessage([20, 12], [0], immColor),
            { color: immColor, text: ` (${ensureSigned32Bit(data.addrOffset.value)})` },
        ], line3Height);

        drawMessage([
            { color: infoColor, text: 'into ' },
            { color: rdColor, text: regFormatted(rd) },
        ], line4Height);

    } else if (opCode === OpCode.STORE) {
        let bitPattern = [7, 5,  25, 7];
        let bitColorOffsets = [0, 1];

        drawBitsAndText(15, 5, rs1Color, rs1.toString(), 'rs1');
        drawBitsAndText(20, 5, rs2Color, rs2.toString(), 'rs2');
        drawBitsAndText(12, 3, func3Color, Funct3LoadStore[funct3], 'funct3')
        drawMultiBits(bitPattern, bitColorOffsets, immColor, 'i');

        drawOpAndMessage('STORE', Funct3LoadStore[funct3], `store to memory (reg + offset)`);

        drawMessage([
            { color: infoColor, text: 'store ' },
            { color: rs2Color, text: regFormatted(rs2) },
        ], line3Height);

        drawMessage([
            { color: infoColor, text: 'at address ' },
            { color: rs1Color, text: regFormatted(rs1) },
            { color: infoColor, text: ' + ' },
            ...buildBitsMessage(bitPattern, bitColorOffsets, immColor),
            { color: immColor, text: ` (${ensureSigned32Bit(data.addrOffset.value)})` },
        ], line4Height);

    } else if (opCode === OpCode.LUI) {
        let val = data.rhsImm.value;
        drawBitsAndText(12, 20, immColor, data.rhsImm.value.toString(), 'imm');
        drawOpAndMessage('LUI', '', `load immediate as upper 20 bits into register`);
        drawMessage([
            { color: infoColor, text: 'load ' },
            { color: '#000', text: '0x' },
            { color: immColor, text: val.toString(16).padStart(8, '0').substring(0, 5) },
            { color: '#000', text: '0'.repeat(3) },
            { color: immColor, text: ` (${val.toString()})` },
        ], line3Height);

        drawMessage([
            { color: infoColor, text: 'into ' },
            { color: rdColor, text: regFormatted(rd) },
        ], line4Height);

    } else if (opCode === OpCode.SYSTEM) {

        drawOpAndMessage('SYSTEM', '', `system call (halt)`);
    }

    ctx.fillStyle = '#777';
    ctx.textAlign = 'left';
    ctx.fillText(strRemain, leftX, lineY(1));
}

function regFormatted(reg: number) {
    return `x${reg}(${riscvRegNames[reg]})`;
}

let funct3BranchNames: Record<number, string> = {
    [Funct3Branch.BEQ]: 'equal',
    [Funct3Branch.BNE]: 'not equal',
    [Funct3Branch.BLT]: 'less than',
    [Funct3Branch.BGE]: 'greater or equal',
    [Funct3Branch.BLTU]: 'less than (unsigned)',
    [Funct3Branch.BGEU]: 'greater or equal (unsigned)',
};

export const funct3BranchIcon: Record<number, string> = {
    [Funct3Branch.BEQ]: '==',
    [Funct3Branch.BNE]: '!=',
    [Funct3Branch.BLT]: '<',
    [Funct3Branch.BGE]: '>=',
    [Funct3Branch.BLTU]: '<',
    [Funct3Branch.BGEU]: '>=',
};

export const funct3OpIcon: Record<number, string> = {
    [Funct3Op.ADD]: '+',
    [Funct3Op.SLL]: '<<',
    [Funct3Op.SLT]: '<',
    [Funct3Op.SLTU]: '<',
    [Funct3Op.XOR]: '^',
    [Funct3Op.SRL]: '>>',
    [Funct3Op.OR]: '|',
    [Funct3Op.AND]: '&',
};
