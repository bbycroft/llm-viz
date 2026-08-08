#include "helpers.h"

._start:

#define SECNAME add_example
SECTION2()
    add a6, ra, sp
    nop
    add a7, tp, t0
    nop
    add s2, t2, s0
    nop
    add s4, a6, a7
    add s4, s4, s2
    ecall
#undef SECNAME
