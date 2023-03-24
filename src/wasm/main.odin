//+build js wasm32

package main

import "core:runtime"
import "core:mem"
// import "core:fmt"

dyn_pool: mem.Dynamic_Pool = {}
main_context: runtime.Context

@export
init_allocator :: proc "c" () -> int {
    main_context = runtime.default_context()
    context = main_context
    page_alloc := page_allocator()
    mem.dynamic_pool_init(&dyn_pool, page_alloc, page_alloc, mem.DEFAULT_PAGE_SIZE, mem.DEFAULT_PAGE_SIZE);
    main_context.allocator = mem.dynamic_pool_allocator(&dyn_pool)
    context = main_context

    return 0
}

@export
add_numbers :: proc "c" (a: int, b: int) -> int {
    context = main_context

    arr : [dynamic]int
    for i := 0; i < 10; i += 1 {
        append(&arr, i) 
    }

    return a + b + len(arr)
}



// @export
// addArrow :: proc "c" (ptr: rawptr, ) -> int {
//     return a + b
// }