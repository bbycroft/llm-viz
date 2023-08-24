// Each section is created like ".text_add0", where "add0" is the name,
// Then, each section is defined to start at the address 0x00. So care
// must be taken to only load 1 of these sections at a time with custom
// elf-reading logic.
#define SECTION_(name) \
    .section .text_##name, "ax", @progbits; \
    .globl _start_##name; \
    _start_##name:; \
    .org 0x00
#define SECTION(name) SECTION_(name)
#define SECTION2() SECTION(SECNAME)

#define END_SECTION_(name) \
    fail_##name: \
        li a0, 911; \
        ecall; \
    .word 0x0; \
    success_##name: \
        li a0, 44; \
        ecall;
#define END_SECTION(name) END_SECTION_(name)
#define END_SECTION2() END_SECTION(SECNAME)

#define CONCAT_(a, b) a##b
#define CONCAT(a, b) CONCAT_(a, b)

#define MAKE_FAIL() CONCAT(fail_, SECNAME)
#define FAIL MAKE_FAIL()

#define MAKE_SUCCESS() CONCAT(success_, SECNAME)
#define SUCCESS MAKE_SUCCESS()

// avoids having to add #undef SECNAME after each section
#pragma GCC diagnostic ignored "-Wmacro-redefined"

#define SECNAME addi0
SECTION2()
    li x1, 10
    addi x1, x1, 20
    li x4, 30
    beq x1, x4, SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME bne0
SECTION2()
    li x1, 10
    bne x1, x1, FAIL
    li x2, 20
    bne x1, x2, bn0_step
    li x3, 30
bn0_step:
    li x4, 30
    bne x3, x4, SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME must_fail0
SECTION2()
    li x1, 22
END_SECTION2()
#undef SECNAME

#define SECNAME jump0
SECTION2()
    li x3, 10
    jal jump0_step
    li x4, 34 // this step should be skipped
jump0_step:
    li x3, 34
    li x2, 0x08
    bne ra, x2, FAIL
    bne x3, x4, SUCCESS
END_SECTION2()
#undef SECNAME

#define TEST_OP(OP, a, b, c) \
    li x2, a; \
    li x3, b; \
    OP x4, x2, x3; \
    li x5, c; \
    bne x4, x5, FAIL; \
    addi a1, a1, 1;

#define TEST_OP_LARGE(OP, a, b, c) \
    lui x2, %hi(a); \
    addi x2, x2, %lo(a); \
    lui x3, %hi(b); \
    addi x3, x3, %lo(b); \
    OP x4, x2, x3; \
    lui x5, %hi(c); \
    addi x5, x5, %lo(c); \
    bne x4, x5, FAIL; \
    addi a1, a1, 1;

#define SECNAME add_suite
SECTION2()
    TEST_OP(add, 10, 20, 30);
    TEST_OP(add, 10, -20, -10);
    TEST_OP(add, -10, 20, 10);
    TEST_OP(add, -10, -20, -30);
    TEST_OP_LARGE(add, (1 << 31) - 14,  20           , (1 << 31) + 6 ); // overflow
    TEST_OP_LARGE(add, (1 << 31) + 12, -30           , (1 << 31) - 18); // underflow
    TEST_OP_LARGE(add, (1 << 31) - 14, (1 << 31) + 14, 0             ); // large-num cancellation
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME sub_suite
SECTION2()
    TEST_OP(sub, 20, 10, 10);      // basic positive case
    TEST_OP(sub, -20, 10, -30);    // subtracting positive from negative
    TEST_OP(sub, 10, -10, 20);     // subtracting negative from positive
    TEST_OP(sub, -20, -10, -10);   // subtracting negative from negative
    TEST_OP_LARGE(sub, (1 << 31) - 14, 20, (1 << 31) - 34); // overflow
    TEST_OP_LARGE(sub, (1 << 31) + 12, -30, (1 << 31) + 42); // underflow
    TEST_OP_LARGE(sub, (1 << 31) - 14, (1 << 31) - 14, 0); // large-num cancellation
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME slt_suite
SECTION2()
    TEST_OP(slt, 5, 10, 1);        // less than
    TEST_OP(slt, 10, 5, 0);        // greater than
    TEST_OP(slt, 5, 5, 0);         // equal
    TEST_OP(slt, -5, 5, 1);        // negative less than positive
    TEST_OP(slt, 5, -5, 0);        // positive greater than negative
    TEST_OP(slt, -5, -10, 0);      // negative greater than more negative
    TEST_OP(slt, -10, -5, 1);      // more negative less than negative
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME sltu_suite
SECTION2()
    TEST_OP(sltu, 5, 10, 1);        // less than
    TEST_OP(sltu, 10, 5, 0);        // greater than
    TEST_OP(sltu, 5, 5, 0);         // equal
    TEST_OP(sltu, -5, 5, 0);        // negative (large num) greater than positive
    TEST_OP(sltu, 5, -5, 1);        // positive less than negative (large num)
    TEST_OP(sltu, -5, -10, 0);      // negative greater than more negative
    TEST_OP(sltu, -10, -5, 1);      // more negative less than negative
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME srl_suite
SECTION2()
    TEST_OP(srl, 45, 0, 45);
    TEST_OP(srl, 45, 1, 22);
    TEST_OP(srl, 45, 2, 11);
    TEST_OP(srl, 45, 5, 1);
    TEST_OP(srl, 45, 6, 0);
    TEST_OP(srl, 45, 130, 11);
    TEST_OP(srl, -45, 0, -45);
    TEST_OP(srl, -45, 31, 1);
    TEST_OP(srl, -45, 32, -45);
    TEST_OP_LARGE(srl, -45, 1, 0x7FFFFFFF - 22);
    TEST_OP_LARGE(srl, -126, 3, 0x1FFFFFFF - 15);
    TEST_OP_LARGE(srl, -126, 35, 0x1FFFFFFF - 15);
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME sra_suite
SECTION2()
    TEST_OP(sra, 45, 0, 45);
    TEST_OP(sra, 45, 1, 22);
    TEST_OP(sra, 45, 2, 11);
    TEST_OP(sra, -45, 0, -45);
    TEST_OP(sra, -45, 1, -23);
    TEST_OP(sra, -126, 3, -16);
    TEST_OP(sra, -126, 7, -1);
    TEST_OP(sra, -126, 8, -1);
    TEST_OP(sra, -126, 259, -16); // 256 + 3
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME and_suite
SECTION2()
    TEST_OP(and, 0b10101010, 0b11001100, 0b10001000);
    TEST_OP_LARGE(and, 0xFFFFFFFF, 0x00000000, 0x00000000);
    TEST_OP_LARGE(and, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF);
    TEST_OP_LARGE(and, 0x12345678, 0x87654321, 0x02244220);
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME or_suite
SECTION2()
    TEST_OP(or, 0b10101010, 0b11001100, 0b11101110);
    TEST_OP_LARGE(or, 0xFFFFFFFF, 0x00000000, 0xFFFFFFFF);
    TEST_OP(or, 0x00000000, 0x00000000, 0x00000000);
    TEST_OP_LARGE(or, 0x12345678, 0x87654321, 0x97755779);
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME xor_suite
SECTION2()
    TEST_OP(xor, 0b10101010, 0b11001100, 0b01100110);
    TEST_OP_LARGE(xor, 0xFFFFFFFF, 0xFFFFFFFF, 0x00000000);
    TEST_OP_LARGE(xor, 0xFFFFFFFF, 0x00000000, 0xFFFFFFFF);
    TEST_OP_LARGE(xor, 0x12345678, 0x87654321, 0x95511559);
    j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME auipc_suite
SECTION2()
    li x2, 425
    .equ A, 0x12345678
    auipc x3, %hi(A)
    addi x3, x3, %lo(A)
    lui x4, %hi(A + 4)
    addi x4, x4, %lo(A + 4)
    bne x3, x4, FAIL
    j SUCCESS
END_SECTION2()
#undef SECNAME
