package main

import "core:mem"
import "base:runtime"
import "base:intrinsics"
import "core:container/intrusive/list"

PAGE_SIZE :: 64 * 1024

page_alloc :: proc(page_count: int) -> (data: []byte, err: mem.Allocator_Error) {
	when ODIN_OS == .JS {
		prev_page_count := intrinsics.wasm_memory_grow(0, uintptr(page_count))
	} else {
		runtime.print_string("NO page_alloc\n")
		prev_page_count := -1 
	}
    if prev_page_count < 0 {
		runtime.print_string("prev_page_count < 0\n")
        return nil, .Out_Of_Memory
    }


    ptr := ([^]u8)(uintptr(prev_page_count) * PAGE_SIZE)
    return ptr[:page_count * PAGE_SIZE], nil
}

// Bump-only page allocator (wasm memory.grow). Used for:
//   - MeMalloc slab pages
//   - MeMalloc internal metadata (pageMap, Dynamic_Arena block lists)
// Small requests are rounded up to a whole page so maps/arrays can use it
// without recursing into MeMalloc (which would infinite-loop).
page_allocator :: proc() -> mem.Allocator {
	procedure :: proc(allocator_data: rawptr, mode: mem.Allocator_Mode,
	                  size, alignment: int,
	                  old_memory: rawptr, old_size: int,
	                  location := #caller_location) -> ([]byte, mem.Allocator_Error) {
		#partial switch mode {
		case .Alloc, .Alloc_Non_Zeroed:
			if size <= 0 {
				return nil, nil
			}
			// Always hand back whole wasm pages (64KiB). Wasteful for tiny
			// metadata, but keeps MeMalloc off its own call stack.
			n_pages := (size + PAGE_SIZE - 1) / PAGE_SIZE
			if n_pages < 1 {
				n_pages = 1
			}
			return page_alloc(n_pages)
		case .Resize, .Resize_Non_Zeroed, .Free, .Free_All, .Query_Info:
			// No shrink/free — wasm memory can't be given back. Leak is fine
			// for rare pageMap growth / arena bookkeeping.
			return nil, .Mode_Not_Implemented
		case .Query_Features:
			set := (^mem.Allocator_Mode_Set)(old_memory)
			if set != nil {
				set^ = {.Alloc, .Alloc_Non_Zeroed, .Query_Features}
			}
		}

		return nil, nil
	}

	return {
		procedure = procedure,
		data = nil,
	}
}

