// Each section is created like ".text_add0", where "add0" is the name,
// Then, each section is defined to start at the address 0x00. So care
// must be taken to only load 1 of these sections at a time with custom
// elf-reading logic.
#define SECTION(name) \
    .section .text_##name, "ax", @progbits; \
    .globl _start_##name; \
    _start_##name:; \
    .org 0x00

#define END_SECTION(name) \
    success_##name: \
        li a0, 44; \
        ecall; \
    fail_##name: \
        li a0, 911; \
        ecall;

SECTION(add0)
    li x1, 10
    li x2, 20
    add x3, x1, x2
    li x4, 30
    bne x3, x4, fail_add0
END_SECTION(add0)

SECTION(add1)
    li x4, 30
    li x5, 40
    add x6, x4, x5
    li x4, 70
    bne x6, x4, fail_add1
END_SECTION(add1)

SECTION(add2)
    li x1, 4
    li x2, -8
    add x3, x1, x2
    li x4, -4
    bne x3, x4, fail_add2
END_SECTION(add2)

SECTION(bne0)
    li x1, 10
    bne x1, x1, fail_bne0
    li x2, 20
    bne x1, x2, bn0_step
    li x3, 30
bn0_step:
    li x4, 30
    beq x3, x4, fail_bne0
END_SECTION(bne0)

SECTION(must_fail0)
    li x1, 10
    li x2, 20
    bne x1, x2, fail_must_fail0
END_SECTION(must_fail0)
