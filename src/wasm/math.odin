package main

/**
Converted from:

Cephes Math Library Release 2.2:  June, 1992
Copyright 1985, 1987, 1988, 1992 by Stephen L. Moshier
Direct inquiries to 30 Frost Street, Cambridge, MA 02140
*/

PIO4F :f32: 0.7853981633974483096
FOPI :f32: 1.27323954473516

/* These are for a 24-bit significand: */
DP1 :f32: 0.78515625
DP2 :f32: 2.4187564849853515625e-4
DP3 :f32: 3.77489497744594108e-8
lossth :f32: 8192.
T24M1 :f32: 16777215.

sincof :: [?]f32{
    -1.9515295891E-4,
     8.3321608736E-3,
    -1.6666654611E-1,
}

coscof :: [?]f32{
     2.443315711809948E-005,
    -1.388731625493765E-003,
     4.166664568298827E-002,
}

sinf :: proc "contextless" (xx: f32) -> f32 {
    sign: i32 = 1
    x: f32 = xx
    if x < 0 {
        sign = -1
        x = -x
    }
    if x > T24M1 {
        // mtherr( "sinf", TLOSS );
        return 0.0
    }

    j := u32(FOPI * x) /* integer part of x/(PI/4) */
    y := f32(j)

    /* map zeros to origin */
    if (j & 1) != 0 {
        j += 1
        y += 1.0
    }

    j &= 7 /* octant modulo 360 degrees */

    /* reflect in x axis */
    if j > 3 {
        sign = -sign
        j -= 4
    }

    if x > lossth {
        // mtherr( "sinf", PLOSS );
        x = x - y * PIO4F
    } else {
        /* Extended precision modular arithmetic */
        x = ((x - y * DP1) - y * DP2) - y * DP3
    }

    z := x * x;

    if (j == 1) || (j == 2) {
        y = coscof[0]
        y = y * z + coscof[1]
        y = y * z + coscof[2]
        y *= z * z
        y -= 0.5 * z
        y += 1.0
    } else {
        y = sincof[0]
        y = y * z + sincof[1]
        y = y * z + sincof[2]
        y *= z * x
        y += x
    }

    if sign < 0 do y = -y

    return y
}


cosf :: proc "contextless" (xx: f32) -> f32 {
    sign: i32 = 1
    x: f32 = xx
    if x < 0 {
        x = -x
    }
    if x > T24M1 {
        // mtherr( "sinf", TLOSS );
        return 0.0
    }

    j := u32(FOPI * x) /* integer part of x/(PI/4) */
    y := f32(j)

    /* map zeros to origin */
    if (j & 1) != 0 {
        j += 1
        y += 1.0
    }

    j &= 7 /* octant modulo 360 degrees */

    /* reflect in x axis */
    if j > 3 {
        sign = -sign
        j -= 4
    }

    if j > 1 {
        sign = -sign
    }

    if x > lossth {
        // mtherr( "sinf", PLOSS );
        x = x - y * PIO4F
    } else {
        /* Extended precision modular arithmetic */
        x = ((x - y * DP1) - y * DP2) - y * DP3
    }

    z := x * x;

    if (j == 1) || (j == 2) {
        y = sincof[0]
        y = y * z + sincof[1]
        y = y * z + sincof[2]
        y *= z * x
        y += x
    } else {
        y = coscof[0]
        y = y * z + coscof[1]
        y = y * z + coscof[2]
        y *= z * z
        y -= 0.5 * z
        y += 1.0
    }

    if sign < 0 do y = -y

    return y
}
