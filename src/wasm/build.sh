#!/bin/bash

# This needs to be run with the odin exe in path, and lld/clang installed 
# Works with WSL2 with Ubuntu 22.04

# Note that we commit the binary wasm file to make deploying easier

cd "$(dirname "$0")"

LINKER_FLAGS="--import-memory -zstack-size=8096 --import-undefined --initial-memory=65536 --max-memory=1310720 --global-base=6560 --lto-O3 --gc-sections"

set -x

odin build . -no-entry-point -target:js_wasm32 -extra-linker-flags:"$LINKER_FLAGS" -out:../../public/native.wasm
wasm2wat ../../public/native.wasm > native.wat