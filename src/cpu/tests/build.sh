#!/bin/sh

TARGET_DIR=../../../public/riscv/examples

CC=riscv64-unknown-elf-gcc
CCARGS=-mabi=ilp32
# CC=clang-16 -target riscv32

$CC $CCARGS -march=rv32i -c add_tests.S -o add_tests
$CC $CCARGS -march=rv32i -E add_tests.S -o add_tests_.s
# clang -E add_tests.S -o add_tests_.s
llvm-objdump -d add_tests > add_tests.dump
mv add_tests $TARGET_DIR

set -x
$CC $CCARGS -march=rv32i -g -O0 -c blinky.c -o blinky
# clang-17 --target=riscv32 -march=rv32g -g -Os -fPIC -c blinky.c -o blinky
# llvm-objdump -S blinky > blinky.dump
riscv64-unknown-elf-objdump -S blinky > blinky.dump
mv blinky $TARGET_DIR
