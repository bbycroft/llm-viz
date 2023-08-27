#include "./helpers.h"

.globl _start;
_start:
.org 0x00
li s0, 0x40020000
li s1, 0xaa
sw s1, 0(s0)
lw a0, 0(s0)
li s1, 0xff
li s2, 20
loop:
sw s1, 3(s0)
lw a0, 0(s0)
addi s2, s2, -1
bne s2, zero, loop
li a0, 44
ecall
# j loop

// hex to nibbles:
// 0x0 -> 0000
// 0x1 -> 0001
// 0x2 -> 0010
// 0x3 -> 0011
// 0x4 -> 0100
// 0x5 -> 0101
// 0x6 -> 0110
// 0x7 -> 0111
// 0x8 -> 1000
// 0x9 -> 1001
// 0xa -> 1010
// 0xb -> 1011
// 0xc -> 1100
// 0xd -> 1101
// 0xe -> 1110
// 0xf -> 1111
