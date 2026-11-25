"""Run with pytest, torch and wasmtime against the browser's compiled Odin model."""

import ctypes
import os
from pathlib import Path

import pytest
import torch
import wasmtime


@pytest.mark.parametrize("values", [(-1000.0, -1001.0), (-3.0, -3.0), (2.0, -1.0)])
def test_output_softmax(values):
    store = wasmtime.Store()
    module = wasmtime.Module.from_file(
        store.engine, Path(__file__).resolve().parents[3] / "public/native.wasm"
    )
    linker = wasmtime.Linker(store.engine)
    memory = wasmtime.Memory(store, wasmtime.MemoryType(wasmtime.Limits(1, 256)))
    linker.define(store, "env", "memory", memory)
    i32 = wasmtime.ValType.i32()

    def rand_bytes(ptr, size):
        memory.write(store, os.urandom(size), ptr)

    def write(fd, ptr, size):
        os.write(fd, memory.read(store, ptr, ptr + size))

    linker.define_func("odin_env", "rand_bytes", wasmtime.FuncType([i32, i32], []), rand_bytes)
    linker.define_func("odin_env", "write", wasmtime.FuncType([i32, i32, i32], []), write)
    wasm = linker.instantiate(store, module).exports(store)
    wasm["init_allocator"](store, wasm["__heap_base"].value(store))
    model = wasm["wasm_create_model"](store, 2, 1, 1, 1, 1, 2)

    def tensor(target):
        descriptor = wasm["wasm_get_model_tensor"](store, model, target, 0)
        size, _, offset = (ctypes.c_uint32 * 3).from_buffer_copy(
            memory.read(store, descriptor, descriptor + 12)
        )
        return (ctypes.c_float * size).from_buffer(memory.get_buffer_ptr(store), offset)

    # TensorType in NativeBindings.ts. A final layer norm bias of 1 makes
    # the two output projection weights the logits, regardless of input.
    tensor(16)[0] = 1  # LnFBeta
    tensor(2)[:] = values  # LmHeadW
    wasm["wasm_run_model"](store, model)
    logits = torch.tensor(list(tensor(37))).reshape(2, 2)
    torch.testing.assert_close(logits, torch.tensor([values, values]))
    probabilities = torch.tensor(list(tensor(39))).reshape(2, 2)
    torch.testing.assert_close(probabilities, torch.softmax(logits, dim=-1))
    # Identical batches must expose identical normalization statistics.
    aggregates = torch.tensor(list(tensor(38))).reshape(2, 2)
    torch.testing.assert_close(aggregates[0], aggregates[1])
