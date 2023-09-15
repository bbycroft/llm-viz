#!/bin/bash

# This needs to be run with the odin exe in path, and lld/clang installed 
# Works with WSL2 with Ubuntu 22.04

# Note that we commit the binary wasm file to make deploying easier

cd "$(dirname "$0")"
MAX_MEM=$((65536 * 256))

LINKER_FLAGS=" \
--import-memory \
--import-undefined \
--stack-first -zstack-size=8096 \
--initial-memory=65536 --max-memory=$MAX_MEM \
--lto-O3 --gc-sections --export=__heap_base"
set -x

# odin build . -out:./main-native -o:speed
odin build . -no-entry-point -target:js_wasm32 -o:speed -no-bounds-check -extra-linker-flags:"$LINKER_FLAGS" -out:../../public/native.wasm
# wasm2wat ../../public/native.wasm > native.wat