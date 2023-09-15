//+build js wasm32

package main

import "core:runtime"
import "core:mem"
// import "core:fmt"

meMallocMaster: MeMallocMaster = {}
main_context: runtime.Context

@export init_allocator :: proc "c" (heapBase: int) -> int {

    main_context = runtime.default_context()
    context = main_context

    page_alloc := page_allocator()

    me_malloc_init(&meMallocMaster)
    meMallocMaster.pageAllocator = page_alloc

    my_allocator := me_malloc_allocator(&meMallocMaster)

    mem.dynamic_pool_init(&meMallocMaster.dynamicPool, page_alloc, my_allocator, mem.DEFAULT_PAGE_SIZE);

    data, ok := mem.alloc_bytes(PAGE_SIZE, 0, page_alloc)
    arena := mem.Arena{}
    mem.arena_init(&arena, data)
    arenaAlloc := mem.arena_allocator(&arena)

    main_context.temp_allocator = arenaAlloc

    main_context.allocator = my_allocator
    context = main_context

    return 0
}

@export add_numbers :: proc "c" (a: int, b: int) -> int {
    context = main_context

    arr : [dynamic]int
    for i := 0; i < 10; i += 1 {
        append(&arr, i) 
    }

    arr2 : []int = make([]int, 10)
    for i := 0; i < 10; i += 1 {
        arr2[i] = i
    }

    return a + b + len(arr) * len(arr2)
}

@export sinf_custom :: proc "c" (x: f32) -> f32 {
    return sinf(x)
}

@export cosf_custom :: proc "c" (x: f32) -> f32 {
    return cosf(x)
}

@export expf_custom :: proc "c" (x: f32) -> f32 {
    return expf(x)
}

@export wasm_create_model :: proc "c" (B: int, T: int, C: int, n_layers: int, n_heads: int, n_vocab: int) -> ^GptModel {
    context = main_context

    config := GptConfig {
        B = B,
        T = T,
        C = C,
        n_layers = n_layers,
        n_heads = n_heads,
        n_vocab = n_vocab,
        A = C / n_heads,
    }

    modelVal := create_model_from_empty(config)

    modelPtr := new_clone(modelVal)

    return modelPtr
}

WasmTensorResult :: struct {
    size: int,
    ndims: int,
    data: rawptr,
    shapeArrPtr: rawptr,
    strideArrPtr: rawptr,
}

wasm_tensor_res := WasmTensorResult{}

@export wasm_get_model_tensor :: proc "c" (model: ^GptModel, target: GptModelTarget, index: int) -> rawptr {
    context = main_context

    tensor := get_model_tensor(model, target, index)

    wasm_tensor_res := WasmTensorResult {
        data = &tensor.data[0],
        shapeArrPtr = &tensor.shape[0],
        strideArrPtr = &tensor.stride[0],
        ndims = len(tensor.shape),
        size = len(tensor.data),
    }

    return &wasm_tensor_res
}

@export wasm_run_model :: proc "c" (model: ^GptModel) -> int {
    context = main_context

    run_model(model, nil)
    return 0
}

// @export
// addArrow :: proc "c" (ptr: rawptr, ) -> int {
//     return a + b
// }