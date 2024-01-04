
#include "helpers.h"
._start:

#define SECNAME imm0_itype_li
SECTION2()
  li x1, 0
  li x2, -1
  li x3, 1
  li x4, 2
  li x5, 4
  li x6, 8
  li x7, 16
  li x8, 32
  li x9, 64
  li x10, 128
  li x11, 256
  li x12, 512
  li x13, 1024
  li x14, -2048
  li x15, -2
  li x16, -3
  li x17, -5
  li x18, -9
  li x19, -17
  li x20, -33
  li x21, -65
  li x22, -129
  li x23, -257
  li x24, -513
  li x25, -1025
  li x26, 2047
  li x27, 0
  li x28, 1
  li x29, 3
  li x30, 7
  li x31, 15
  li x1, 31
  li x2, 63
  li x3, 127
  li x4, 255
  li x5, 511
  li x6, 1023
  li x7, -1
  li x8, -2
  li x9, -4
  li x10, -8
  li x11, -16
  li x12, -32
  li x13, -64
  li x14, -128
  li x15, -256
  li x16, -512
  li x17, -1024
  li x18, 3
  li x19, 6
  li x20, 12
  li x21, 24
  li x22, 48
  li x23, 96
  li x24, 192
  li x25, 384
  li x26, 768
  li x27, 1536
  li x28, -1024
  li x29, -4
  li x30, -7
  li x31, -13
  li x1, -25
  li x2, -49
  li x3, -97
  li x4, -193
  li x5, -385
  li x6, -769
  li x7, -1537
  li x8, 1023
  j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME imm1_itype_lb
SECTION2()
  lb x0, 0(x0)
  lb x0, -1(x0)
  lb x0, 1(x0)
  lb x0, 2(x0)
  lb x0, 4(x0)
  lb x0, 8(x0)
  lb x0, 16(x0)
  lb x0, 32(x0)
  lb x0, 64(x0)
  lb x0, 128(x0)
  lb x0, 256(x0)
  lb x0, 512(x0)
  lb x0, 1024(x0)
  lb x0, -2048(x0)
  lb x0, -2(x0)
  lb x0, -3(x0)
  lb x0, -5(x0)
  lb x0, -9(x0)
  lb x0, -17(x0)
  lb x0, -33(x0)
  lb x0, -65(x0)
  lb x0, -129(x0)
  lb x0, -257(x0)
  lb x0, -513(x0)
  lb x0, -1025(x0)
  lb x0, 2047(x0)
  lb x0, 0(x0)
  lb x0, 1(x0)
  lb x0, 3(x0)
  lb x0, 7(x0)
  lb x0, 15(x0)
  lb x0, 31(x0)
  lb x0, 63(x0)
  lb x0, 127(x0)
  lb x0, 255(x0)
  lb x0, 511(x0)
  lb x0, 1023(x0)
  lb x0, -1(x0)
  lb x0, -2(x0)
  lb x0, -4(x0)
  lb x0, -8(x0)
  lb x0, -16(x0)
  lb x0, -32(x0)
  lb x0, -64(x0)
  lb x0, -128(x0)
  lb x0, -256(x0)
  lb x0, -512(x0)
  lb x0, -1024(x0)
  lb x0, 3(x0)
  lb x0, 6(x0)
  lb x0, 12(x0)
  lb x0, 24(x0)
  lb x0, 48(x0)
  lb x0, 96(x0)
  lb x0, 192(x0)
  lb x0, 384(x0)
  lb x0, 768(x0)
  lb x0, 1536(x0)
  lb x0, -1024(x0)
  lb x0, -4(x0)
  lb x0, -7(x0)
  lb x0, -13(x0)
  lb x0, -25(x0)
  lb x0, -49(x0)
  lb x0, -97(x0)
  lb x0, -193(x0)
  lb x0, -385(x0)
  lb x0, -769(x0)
  lb x0, -1537(x0)
  lb x0, 1023(x0)
  j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME imm2_stype_sb
SECTION2()
  sb x0, 0(x0)
  sb x0, -1(x0)
  sb x0, 1(x0)
  sb x0, 2(x0)
  sb x0, 4(x0)
  sb x0, 8(x0)
  sb x0, 16(x0)
  sb x0, 32(x0)
  sb x0, 64(x0)
  sb x0, 128(x0)
  sb x0, 256(x0)
  sb x0, 512(x0)
  sb x0, 1024(x0)
  sb x0, -2048(x0)
  sb x0, -2(x0)
  sb x0, -3(x0)
  sb x0, -5(x0)
  sb x0, -9(x0)
  sb x0, -17(x0)
  sb x0, -33(x0)
  sb x0, -65(x0)
  sb x0, -129(x0)
  sb x0, -257(x0)
  sb x0, -513(x0)
  sb x0, -1025(x0)
  sb x0, 2047(x0)
  sb x0, 0(x0)
  sb x0, 1(x0)
  sb x0, 3(x0)
  sb x0, 7(x0)
  sb x0, 15(x0)
  sb x0, 31(x0)
  sb x0, 63(x0)
  sb x0, 127(x0)
  sb x0, 255(x0)
  sb x0, 511(x0)
  sb x0, 1023(x0)
  sb x0, -1(x0)
  sb x0, -2(x0)
  sb x0, -4(x0)
  sb x0, -8(x0)
  sb x0, -16(x0)
  sb x0, -32(x0)
  sb x0, -64(x0)
  sb x0, -128(x0)
  sb x0, -256(x0)
  sb x0, -512(x0)
  sb x0, -1024(x0)
  sb x0, 3(x0)
  sb x0, 6(x0)
  sb x0, 12(x0)
  sb x0, 24(x0)
  sb x0, 48(x0)
  sb x0, 96(x0)
  sb x0, 192(x0)
  sb x0, 384(x0)
  sb x0, 768(x0)
  sb x0, 1536(x0)
  sb x0, -1024(x0)
  sb x0, -4(x0)
  sb x0, -7(x0)
  sb x0, -13(x0)
  sb x0, -25(x0)
  sb x0, -49(x0)
  sb x0, -97(x0)
  sb x0, -193(x0)
  sb x0, -385(x0)
  sb x0, -769(x0)
  sb x0, -1537(x0)
  sb x0, 1023(x0)
  j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME imm2_btype_bne
SECTION2()
  bne x0, x0, 0
  bne x0, x0, -2
  bne x0, x0, 2
  bne x0, x0, 4
  bne x0, x0, 8
  bne x0, x0, 16
  bne x0, x0, 32
  bne x0, x0, 64
  bne x0, x0, 128
  bne x0, x0, 256
  bne x0, x0, 512
  bne x0, x0, 1024
  bne x0, x0, 2048
  bne x0, x0, -4096
  bne x0, x0, -4
  bne x0, x0, -6
  bne x0, x0, -10
  bne x0, x0, -18
  bne x0, x0, -34
  bne x0, x0, -66
  bne x0, x0, -130
  bne x0, x0, -258
  bne x0, x0, -514
  bne x0, x0, -1026
  bne x0, x0, -2050
  bne x0, x0, 4094
  bne x0, x0, 0
  bne x0, x0, 2
  bne x0, x0, 6
  bne x0, x0, 14
  bne x0, x0, 30
  bne x0, x0, 62
  bne x0, x0, 126
  bne x0, x0, 254
  bne x0, x0, 510
  bne x0, x0, 1022
  bne x0, x0, 2046
  bne x0, x0, -2
  bne x0, x0, -4
  bne x0, x0, -8
  bne x0, x0, -16
  bne x0, x0, -32
  bne x0, x0, -64
  bne x0, x0, -128
  bne x0, x0, -256
  bne x0, x0, -512
  bne x0, x0, -1024
  bne x0, x0, -2048
  bne x0, x0, 6
  bne x0, x0, 12
  bne x0, x0, 24
  bne x0, x0, 48
  bne x0, x0, 96
  bne x0, x0, 192
  bne x0, x0, 384
  bne x0, x0, 768
  bne x0, x0, 1536
  bne x0, x0, 3072
  bne x0, x0, -2048
  bne x0, x0, -8
  bne x0, x0, -14
  bne x0, x0, -26
  bne x0, x0, -50
  bne x0, x0, -98
  bne x0, x0, -194
  bne x0, x0, -386
  bne x0, x0, -770
  bne x0, x0, -1538
  bne x0, x0, -3074
  bne x0, x0, 2046
  j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME imm2_utype_lui
SECTION2()
  lui x1, %hi(0)
  lui x1, %hi(-4096)
  lui x1, %hi(4096)
  lui x1, %hi(8192)
  lui x1, %hi(16384)
  lui x1, %hi(32768)
  lui x1, %hi(65536)
  lui x1, %hi(131072)
  lui x1, %hi(262144)
  lui x1, %hi(524288)
  lui x1, %hi(1048576)
  lui x1, %hi(2097152)
  lui x1, %hi(4194304)
  lui x1, %hi(8388608)
  lui x1, %hi(16777216)
  lui x1, %hi(33554432)
  lui x1, %hi(67108864)
  lui x1, %hi(134217728)
  lui x1, %hi(268435456)
  lui x1, %hi(536870912)
  lui x1, %hi(1073741824)
  lui x1, %hi(-2147483648)
  lui x1, %hi(-8192)
  lui x1, %hi(-12288)
  lui x1, %hi(-20480)
  lui x1, %hi(-36864)
  lui x1, %hi(-69632)
  lui x1, %hi(-135168)
  lui x1, %hi(-266240)
  lui x1, %hi(-528384)
  lui x1, %hi(-1052672)
  lui x1, %hi(-2101248)
  lui x1, %hi(-4198400)
  lui x1, %hi(-8392704)
  lui x1, %hi(-16781312)
  lui x1, %hi(-33558528)
  lui x1, %hi(-67112960)
  lui x1, %hi(-134221824)
  lui x1, %hi(-268439552)
  lui x1, %hi(-536875008)
  lui x1, %hi(-1073745920)
  lui x1, %hi(2147479552)
  lui x1, %hi(0)
  lui x1, %hi(4096)
  lui x1, %hi(12288)
  lui x1, %hi(28672)
  lui x1, %hi(61440)
  lui x1, %hi(126976)
  lui x1, %hi(258048)
  lui x1, %hi(520192)
  lui x1, %hi(1044480)
  lui x1, %hi(2093056)
  lui x1, %hi(4190208)
  lui x1, %hi(8384512)
  lui x1, %hi(16773120)
  lui x1, %hi(33550336)
  lui x1, %hi(67104768)
  lui x1, %hi(134213632)
  lui x1, %hi(268431360)
  lui x1, %hi(536866816)
  lui x1, %hi(1073737728)
  lui x1, %hi(-4096)
  lui x1, %hi(-8192)
  lui x1, %hi(-16384)
  lui x1, %hi(-32768)
  lui x1, %hi(-65536)
  lui x1, %hi(-131072)
  lui x1, %hi(-262144)
  lui x1, %hi(-524288)
  lui x1, %hi(-1048576)
  lui x1, %hi(-2097152)
  lui x1, %hi(-4194304)
  lui x1, %hi(-8388608)
  lui x1, %hi(-16777216)
  lui x1, %hi(-33554432)
  lui x1, %hi(-67108864)
  lui x1, %hi(-134217728)
  lui x1, %hi(-268435456)
  lui x1, %hi(-536870912)
  lui x1, %hi(-1073741824)
  lui x1, %hi(12288)
  lui x1, %hi(24576)
  lui x1, %hi(49152)
  lui x1, %hi(98304)
  lui x1, %hi(196608)
  lui x1, %hi(393216)
  lui x1, %hi(786432)
  lui x1, %hi(1572864)
  lui x1, %hi(3145728)
  lui x1, %hi(6291456)
  lui x1, %hi(12582912)
  lui x1, %hi(25165824)
  lui x1, %hi(50331648)
  lui x1, %hi(100663296)
  lui x1, %hi(201326592)
  lui x1, %hi(402653184)
  lui x1, %hi(805306368)
  lui x1, %hi(1610612736)
  lui x1, %hi(-1073741824)
  lui x1, %hi(-16384)
  lui x1, %hi(-28672)
  lui x1, %hi(-53248)
  lui x1, %hi(-102400)
  lui x1, %hi(-200704)
  lui x1, %hi(-397312)
  lui x1, %hi(-790528)
  lui x1, %hi(-1576960)
  lui x1, %hi(-3149824)
  lui x1, %hi(-6295552)
  lui x1, %hi(-12587008)
  lui x1, %hi(-25169920)
  lui x1, %hi(-50335744)
  lui x1, %hi(-100667392)
  lui x1, %hi(-201330688)
  lui x1, %hi(-402657280)
  lui x1, %hi(-805310464)
  lui x1, %hi(-1610616832)
  lui x1, %hi(1073737728)
  j SUCCESS
END_SECTION2()
#undef SECNAME

#define SECNAME imm2_jtype_jal
SECTION2()
  jal x0, 0
  jal x0, -2
  jal x0, 2
  jal x0, 4
  jal x0, 8
  jal x0, 16
  jal x0, 32
  jal x0, 64
  jal x0, 128
  jal x0, 256
  jal x0, 512
  jal x0, 1024
  jal x0, 2048
  jal x0, 4096
  jal x0, 8192
  jal x0, 16384
  jal x0, 32768
  jal x0, 65536
  jal x0, 131072
  jal x0, 262144
  jal x0, 524288
  jal x0, -1048576
  jal x0, -4
  jal x0, -6
  jal x0, -10
  jal x0, -18
  jal x0, -34
  jal x0, -66
  jal x0, -130
  jal x0, -258
  jal x0, -514
  jal x0, -1026
  jal x0, -2050
  jal x0, -4098
  jal x0, -8194
  jal x0, -16386
  jal x0, -32770
  jal x0, -65538
  jal x0, -131074
  jal x0, -262146
  jal x0, -524290
  jal x0, 1048574
  jal x0, 0
  jal x0, 2
  jal x0, 6
  jal x0, 14
  jal x0, 30
  jal x0, 62
  jal x0, 126
  jal x0, 254
  jal x0, 510
  jal x0, 1022
  jal x0, 2046
  jal x0, 4094
  jal x0, 8190
  jal x0, 16382
  jal x0, 32766
  jal x0, 65534
  jal x0, 131070
  jal x0, 262142
  jal x0, 524286
  jal x0, -2
  jal x0, -4
  jal x0, -8
  jal x0, -16
  jal x0, -32
  jal x0, -64
  jal x0, -128
  jal x0, -256
  jal x0, -512
  jal x0, -1024
  jal x0, -2048
  jal x0, -4096
  jal x0, -8192
  jal x0, -16384
  jal x0, -32768
  jal x0, -65536
  jal x0, -131072
  jal x0, -262144
  jal x0, -524288
  jal x0, 6
  jal x0, 12
  jal x0, 24
  jal x0, 48
  jal x0, 96
  jal x0, 192
  jal x0, 384
  jal x0, 768
  jal x0, 1536
  jal x0, 3072
  jal x0, 6144
  jal x0, 12288
  jal x0, 24576
  jal x0, 49152
  jal x0, 98304
  jal x0, 196608
  jal x0, 393216
  jal x0, 786432
  jal x0, -524288
  jal x0, -8
  jal x0, -14
  jal x0, -26
  jal x0, -50
  jal x0, -98
  jal x0, -194
  jal x0, -386
  jal x0, -770
  jal x0, -1538
  jal x0, -3074
  jal x0, -6146
  jal x0, -12290
  jal x0, -24578
  jal x0, -49154
  jal x0, -98306
  jal x0, -196610
  jal x0, -393218
  jal x0, -786434
  jal x0, 524286
  j SUCCESS
END_SECTION2()
#undef SECNAME
