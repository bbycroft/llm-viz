import { Vec3 } from "@/src/utils/vector";
import { IExePort, IComp, IExeComp, PortDir } from "../CpuModel";
import { OpCode, Funct3Op } from "../RiscvIsa";
import { ExeCompBuilder, ICompBuilderArgs, ICompDef } from "./CompBuilder";

export function createRiscvInsDecodeComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 10;
    let h = 5;
    let alu: ICompDef<ICompDataInsDecoder> = {
        defId: 'insDecodeRiscv32_0',
        name: "Instruction Decoder",
        size: new Vec3(w, h),
        ports: [
            { id: 'ins', name: 'Ins', pos: new Vec3(0, 1), type: PortDir.In | PortDir.Data, width: 32 },

            { id: 'loadStoreCtrl', name: 'LS', pos: new Vec3(w, 1), type: PortDir.Out | PortDir.Ctrl, width: 4 },
            { id: 'addrOffset', name: 'Addr Offset', pos: new Vec3(w, 2), type: PortDir.Out | PortDir.Addr, width: 32 },
            { id: 'rhsImm', name: 'RHS Imm', pos: new Vec3(w, 3), type: PortDir.OutTri | PortDir.Data, width: 32 },

            { id: 'pcRegMuxCtrl', name: 'Mux', pos: new Vec3(1, h), type: PortDir.Out | PortDir.Ctrl, width: 1 },
            { id: 'regCtrl', name: 'Reg', pos: new Vec3(3, h), type: PortDir.Out | PortDir.Ctrl, width: 3 * 6 },
            { id: 'pcAddImm', name: 'PC+Imm', pos: new Vec3(5, h), type: PortDir.Out | PortDir.Addr, width: 32 },
            // { id: 'pcOutTristateCtrl', name: 'PC LHS', pos: new Vec3(5, h), type: PortDir.Out | PortDir.Ctrl, width: 1 },
            { id: 'pcAddMuxCtrl', name: 'LHS Sel', pos: new Vec3(7, h), type: PortDir.Out | PortDir.Ctrl, width: 1 },
            { id: 'aluCtrl', name: 'ALU', pos: new Vec3(9, h), type: PortDir.Out | PortDir.Ctrl, width: 5 },
        ],
        build: buildInsDecoder,
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
    pcAddMuxCtrl: IExePort; // 1-bit value, selects between PC + 4 and PC + imm
}

export function buildInsDecoder(comp: IComp) {
    let builder = new ExeCompBuilder<ICompDataInsDecoder>(comp);
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
        pcAddMuxCtrl: builder.getPort('pcAddMuxCtrl'),
    });
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
    data.rhsImm.ioEnabled = false;

    // 0: ALU out => REG, PC + x => PC
    // 1: ALU out => PC,  PC + x => REG
    data.pcRegMuxCtrl.value = 0;
    // data.pcOutTristateCtrl.value = 0;
    data.pcAddImm.value = 4;
    data.pcAddMuxCtrl.value = 1; // inverted

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

    console.log('opcode: ' + opCode.toString(16), ins.toString(2).padStart(32, '0'), OpCode[opCode], Funct3Op[funct3]);

    if (opCode === OpCode.OPIMM || opCode === OpCode.OP) {
        console.log('OPIMM/OP', ins.toString(2).padStart(32, '0'));

        if (opCode === OpCode.OP) {
            setRegCtrl(true, rs2, 1); // reg[rs2] => RHS
        } else if (funct3 === Funct3Op.SLLI || funct3 === Funct3Op.SRLI || funct3 === Funct3Op.SRAI) {
            data.rhsImm.value = rs2;
            data.rhsImm.ioEnabled = true;
        } else {
            data.rhsImm.value = signExtend12Bit(ins >>> 20);
            data.rhsImm.ioEnabled = true;
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
        data.pcAddMuxCtrl.value = 0; // PC -> LHS enabled
        setAluCtrl(true, false, Funct3Op.ADD, false);
        setRegCtrl(true, rd, 2); // ALU out => reg[rd]

    } else if (opCode === OpCode.JAL) {
        let offsetRaw = (((ins >>> 21) & 0x3FF) << 1) | // 10 bytes
                        (((ins >>> 20) & 0x01) << 11) | // 1 byte
                        (((ins >>> 12) & 0xFF) << 12) | // 8 bytes
                        (((ins >>> 31) & 0x01) << 20);  // 1 byte

        data.pcAddMuxCtrl.value = 0; // PC -> LHS enabled
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

    if (data.pcAddMuxCtrl.value) {
        data.regCtrl.value |= 0b1;
        // setRegCtrl(true, 0, 0); // 0 => LHS (to ensure we don't leave a floating value on the bus)
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
