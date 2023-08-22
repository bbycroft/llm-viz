
export enum OpCode {
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

export enum Funct3Op {
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
    SRL   = 0b101, // shift right logical
    SRx   = 0b101, // shift right arithmetic
    OR    = 0b110, // or
    AND   = 0b111, // and
}

export enum Funct3OpImm {
    ADDI  = 0b000, // add
    SLTI  = 0b010, // set less than
    SLTIU = 0b011, // set less than unsigned
    XORI  = 0b100, // xor
    ORI   = 0b110, // or
    ANDI  = 0b111, // and

    SLLI  = 0b001, // shift left logical
    SRxI  = 0b101, // shift right logical
    // SRAI  = 0b101, // shift right arithmetic
}

export enum Funct3Branch {
    // Branch
    BEQ   = 0b000, // branch equal
    BNE   = 0b001, // branch not equal
    BLT   = 0b100, // branch less than
    BGE   = 0b101, // branch greater than or equal
    BLTU  = 0b110, // branch less than unsigned
    BGEU  = 0b111, // branch greater than or equal unsigned
}

export enum Funct3LoadStore {
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

export enum Funct3CSR {
    // CSR
    CSRRW = 0b001, // read/write CSR
    CSRRS = 0b010, // read/set CSR
    CSRRC = 0b011, // read/clear CSR
    CSRRWI = 0b101, // read/write CSR immediate
    CSRRSI = 0b110, // read/set CSR immediate
    CSRRCI = 0b111, // read/clear CSR immediate
}

// CSR registers
export enum CSR_Reg {
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
