package main

import "core:mem"
import "core:runtime"
import "core:intrinsics"
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

page_allocator :: proc() -> mem.Allocator {
	procedure :: proc(allocator_data: rawptr, mode: mem.Allocator_Mode,
	                  size, alignment: int,
	                  old_memory: rawptr, old_size: int,
	                  location := #caller_location) -> ([]byte, mem.Allocator_Error) {
		switch mode {
		case .Alloc, .Alloc_Non_Zeroed:
			assert(size % PAGE_SIZE == 0)
			return page_alloc(size/PAGE_SIZE)
		case .Resize, .Free, .Free_All, .Query_Info:
			runtime.print_string(".Resize NOT IMPLEMENTED\n")
			return nil, .Mode_Not_Implemented
		case .Query_Features:
			set := (^mem.Allocator_Mode_Set)(old_memory)
			if set != nil {
				set^ = {.Alloc, .Query_Features}
			}
		}

		return nil, nil
	}

	return {
		procedure = procedure,
		data = nil,
	}
}

