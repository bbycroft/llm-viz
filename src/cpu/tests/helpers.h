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


#define LI_LARGE(reg, val) \
    lui reg, %hi(val); \
    addi reg, reg, %lo(val);

#define TEST_OP(OP, a, b, c) \
    li x2, a; \
    li x3, b; \
    OP x4, x2, x3; \
    li x5, c; \
    bne x4, x5, FAIL; \
    addi a1, a1, 1;

#define TEST_OP_LARGE(OP, a, b, c) \
    LI_LARGE(x2, a); \
    LI_LARGE(x3, b); \
    OP x4, x2, x3; \
    LI_LARGE(x5, c); \
    bne x4, x5, FAIL; \
    addi a1, a1, 1;
