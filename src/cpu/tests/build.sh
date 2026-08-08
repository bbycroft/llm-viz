#!/bin/sh
cd `dirname $0`

TARGET_DIR=../../../public/riscv/examples

set -x

# clang --target=riscv32 -march=rv32i -nostdlib -T linker_multi_section.ld -z keep-text-section-prefix add_tests.S -o add_tests.elf
# # clang --target=riscv32 -march=rv32i -E add_tests.S -o add_tests_.s
# llvm-objdump -d add_tests.elf > add_tests.dump
# cp add_tests.elf $TARGET_DIR

# clang --target=riscv32 -march=rv32i -nostdlib -T linker_tiny.ld -O0 -fno-inline -g blinky.c -o blinky.elf
# llvm-objdump -S blinky.elf -j .text -j .rodata -j data > blinky.dump
# # riscv64-unknown-elf-objdump -S blinky > blinky.dump
# cp blinky.elf $TARGET_DIR

# clang --target=riscv32 -march=rv32i -nostdlib -O0 -fno-inline -T linker_tiny.ld blinky2.S -o blinky2.elf
# llvm-objdump -S blinky2.elf -j .text -j .rodata -j data > blinky2.dump
# # riscv64-unknown-elf-objdump -S blinky > blinky.dump
# cp blinky2.elf $TARGET_DIR

# clang --target=riscv32 -march=rv32i -nostdlib -O0 -fno-inline -fuse-ld=/mingw64/bin/riscv32-unknown-elf-ld -T linker_tiny.ld riscv_basic.S -o riscv_basic.elf
# llvm-objdump -S riscv_basic.elf -j .text -j .rodata -j data > riscv_basic.dump
clang --target=riscv32 -march=rv32i -nostdlib -O0 -c riscv_basic.S -o riscv_basic.o
riscv32-unknown-elf-ld -T linker_tiny.ld riscv_basic.o -o riscv_basic.elf
riscv32-unknown-elf-objdump -S riscv_basic.elf > riscv_basic.dump
cp riscv_basic.elf $TARGET_DIR


# clang --target=riscv32 -march=rv32i -nostdlib -T linker_multi_section.ld -z keep-text-section-prefix imm_validation.S -o imm_validation.elf
# llvm-objdump -d imm_validation.elf > imm_validation.dump
# # riscv64-unknown-elf-objdump -S blinky > blinky.dump
# cp imm_validation.elf $TARGET_DIR
