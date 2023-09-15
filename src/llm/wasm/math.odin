package main

import "core:math";
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


/* Converted by Brendan from the cephes math library (single precision) expf.c
 *
 *	Exponential function
 *
 *
 *
 * SYNOPSIS:
 *
 * float x, y, expf();
 *
 * y = expf( x );
 *
 *
 *
 * DESCRIPTION:
 *
 * Returns e (2.71828...) raised to the x power.
 *
 * Range reduction is accomplished by separating the argument
 * into an integer k and fraction f such that
 *
 *     x    k  f
 *    e  = 2  e.
 *
 * A polynomial is used to approximate exp(f)
 * in the basic range [-0.5, 0.5].
 *
 *
 * ACCURACY:
 *
 *                      Relative error:
 * arithmetic   domain     # trials      peak         rms
 *    IEEE      +- MAXLOG   100000      1.7e-7      2.8e-8
 *
 *
 * Error amplification in the exponential function can be
 * a serious matter.  The error propagation involves
 * exp( X(1+delta) ) = exp(X) ( 1 + X*delta + ... ),
 * which shows that a 1 lsb error in representing X produces
 * a relative error of X times 1 lsb in the function.
 * While the routine gives an accurate result for arguments
 * that are exactly represented by a double precision
 * computer number, the result contains amplified roundoff
 * error for large arguments not exactly represented.
 *
 *
 * ERROR MESSAGES:
 *
 *   message         condition      value returned
 * expf underflow    x < MINLOGF         0.0
 * expf overflow     x > MAXLOGF         MAXNUMF
 *
 */

 /*
 Cephes Math Library Release 2.2:  June, 1992
 Copyright 1984, 1987, 1989 by Stephen L. Moshier
 Direct inquiries to 30 Frost Street, Cambridge, MA 02140
 */
 
 /* Single precision exponential function.
  * test interval: [-0.5, +0.5]
  * trials: 80000
  * peak relative error: 7.6e-8
  * rms relative error: 2.8e-8
  */
//  #include "mconf.h"
//  extern float LOG2EF, MAXLOGF, MINLOGF, MAXNUMF;
 
C1: f32: 0.693359375;
C2: f32: -2.12194440e-4;

LOG2EF: f32: 1.44269504088896341;
LOGE2F: f32: 0.693147180559945309;
MAXNUMF: f32: 3.4028234663852885981170418348451692544e38;
MAXLOGF: f32: 88.72283905206835;
MINLOGF: f32: -103.278929903431851103; /* log(2^-149) */

expf :: proc "contextless" (x: f32) -> f32 {
    x := x

    if x > MAXLOGF {
        // mtherr( "expf", OVERFLOW );
        return MAXNUMF
    }

    if x < MINLOGF {
        // mtherr( "expf", UNDERFLOW );
        return 0.0
    }

    /* Express e**x = e**g 2**n
    *               = e**g e**( n loge(2) )
    *               = e**( g + n loge(2) )
    */
    z: f32 = math.floor(LOG2EF * x + 0.5) /* floor() truncates toward -infinity. */
    x -= z * C1
    x -= z * C2
    n: int = int(z)

    z = x * x
    /* Theoretical peak relative error in [-0.5, +0.5] is 4.2e-9. */
    z = (((((1.9875691500E-4 * x \
        + 1.3981999507E-3) * x \
        + 8.3334519073E-3) * x \
        + 4.1665795894E-2) * x \
        + 1.6666665459E-1) * x \
        + 5.0000001201E-1) * z \
        + x \
        + 1.0

    /* multiply by power of 2 */
    x = math.ldexp(z, n)

    return x
}


tanhf :: proc "contextless" (y: f32) -> f32 {
	P0 :: -9.64399179425052238628e-1
	P1 :: -9.92877231001918586564e1
	P2 :: -1.61468768441708447952e3
	Q0 :: +1.12811678491632931402e2
	Q1 :: +2.23548839060100448583e3
	Q2 :: +4.84406305325125486048e3

	MAXLOG :: 8.8029691931113054295988e+01 // log(2**127)


	x := y
	z := abs(x)
	switch {
	case z > 0.5*MAXLOG:
		if x < 0 {
			return -1
		}
		return 1
	case z >= 0.625:
		s := expf(2 * z)
		z = 1 - 2/(s+1)
		if x < 0 {
			z = -z
		}
	case:
		if x == 0 {
			return x
		}
		s := x * x
		z = x + x*s*((P0*s+P1)*s+P2)/(((s+Q0)*s+Q1)*s+Q2)
	}
	return z
}
