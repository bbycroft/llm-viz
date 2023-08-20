// Each section is created like ".text_add0", where "add0" is the name,
// Then, each section is defined to start at the address 0x00. So care
// must be taken to only load 1 of these sections at a time with custom
// elf-reading logic.
#define SECTION(name) \
    .section .text_##name, "ax", @progbits; \
    .globl _start_##name; \
    _start_##name:; \
    .org 0x00

SECTION(add0)
    li x1, 10
    li x2, 20
    add x3, x1, x2

SECTION(add1)
    li x4, 30
    li x5, 40
    add x6, x4, x5
