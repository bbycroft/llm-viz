#!/bin/sh

TARGET_DIR=../../../public/riscv/examples

clang -target riscv32 -march=rv32i -c add_tests.S -o add_tests
llvm-objdump -d add_tests > add_tests.dump
mv add_tests $TARGET_DIR
