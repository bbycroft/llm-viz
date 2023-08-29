#!/bin/sh

TARGET_DIR=../../../public/riscv/examples

CC=riscv64-unknown-elf-gcc
CCARGS=-mabi=ilp32
# CC=clang-16 -target riscv32

set -x

clang --target=riscv32 -march=rv32i -nostdlib -T linker_multi_section.ld -z keep-text-section-prefix add_tests.S -o add_tests.elf
clang --target=riscv32 -march=rv32i -E add_tests.S -o add_tests_.s
# clang -E add_tests.S -o add_tests_.s
llvm-objdump -d add_tests.elf > add_tests.dump
cp add_tests.elf $TARGET_DIR

# $CC $CCARGS -march=rv32i -g -O0 -c blinky.c -o blinky
clang --target=riscv32 -march=rv32i -nostdlib -T linker_tiny.ld -O0 -fno-inline -g blinky.c -o blinky.elf
llvm-objdump -S blinky.elf -j .text -j .rodata -j data > blinky.dump
# riscv64-unknown-elf-objdump -S blinky > blinky.dump
cp blinky.elf $TARGET_DIR

clang --target=riscv32 -march=rv32i -nostdlib -O0 -fno-inline -T linker_tiny.ld -g blinky2.S -o blinky2.elf
llvm-objdump -S blinky2.elf -j .text -j .rodata -j data > blinky2.dump
# riscv64-unknown-elf-objdump -S blinky > blinky.dump
cp blinky2.elf $TARGET_DIR
