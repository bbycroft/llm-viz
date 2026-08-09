#!/bin/bash

# Build native.wasm for the browser GPT model.
#
# Requires:
#   - odin on PATH (Windows: C:/repos/odin works; WSL: build/install odin for Linux)
#   - wasm-ld (ships with Odin under bin/wasm-ld, or system lld)
# Known-good: Odin monthly tag dev-2026-08
#
# Note: we commit the binary wasm so deploys don't need Odin.

set -euo pipefail
cd "$(dirname "$0")"

# Prefer a local Windows Odin checkout when building from Git Bash / similar.
if [[ -x "/c/repos/odin/odin.exe" ]]; then
  export PATH="/c/repos/odin:/c/repos/odin/bin:$PATH"
elif [[ -x "C:/repos/odin/odin.exe" ]]; then
  export PATH="C:/repos/odin:C:/repos/odin/bin:$PATH"
fi

MAX_MEM=$((65536 * 256))

LINKER_FLAGS="\
--import-memory \
--import-undefined \
--stack-first -zstack-size=8096 \
--initial-memory=65536 --max-memory=$MAX_MEM \
--lto-O3 --gc-sections --export=__heap_base"

# From src/llm/wasm → repo root public/
OUT="../../../public/native.wasm"

set -x
odin build . \
  -no-entry-point \
  -target:js_wasm32 \
  -o:speed \
  -no-bounds-check \
  -extra-linker-flags:"$LINKER_FLAGS" \
  -out:"$OUT"

ls -la "$OUT"
