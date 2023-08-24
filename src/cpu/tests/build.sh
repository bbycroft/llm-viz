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
