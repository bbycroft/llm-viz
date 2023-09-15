
package main

ME_DEBUG :: false && ODIN_ARCH != .wasm32 && ODIN_ARCH != .wasm64

import "core:mem"
when ME_DEBUG {
import "core:fmt"
}

import "core:math"
import "core:runtime"
import "core:intrinsics"
import "core:container/intrusive/list"

// Time to build! We have __heap_base supplied and so can allocate from there
// Have Pages and Segments
// Pages are large chunks of allocated memory, and are aligned to 64KiB (expect for the first one, which is aligned to the heap base)
// Segments are smaller chunks of memory within pages, and have a fixed block size
// We generate segments as needed within pages, and allocate from them
// We also have a main set of metadata for managing the pages and segments

// We'll call it MeMalloc (as a play on mimalloc)

// This is just a global variable, so don't have to find somewhere for it
MeMallocMaster :: struct {
	pageAllocator: mem.Allocator,
    pageIdFountain: uint, // increments on each page allocation

	freeSegsFast: [32]^MeMallocSegment, // fast lookup for small segments

	pageList: list.List,
	freePageList: ^MeMallocPage, // singly linked list of all pages with free segments
    pageMap: map[uintptr]^MeMallocPage, // map of page start addresses to page metadata

    dynamicPool: mem.Dynamic_Pool,
}

ME_MALLOC_PAGE_SIZE :: 64 * 1024 // 64KiB, to match wasm page size
ME_MALLOC_SEG_SIZE :: 4096 // means we fit 16 segments in a page
ME_MALLOC_SEGS_PER_PAGE :: ME_MALLOC_PAGE_SIZE / ME_MALLOC_SEG_SIZE // 16
ME_MALLOC_PAGE_MAGIC :: 0x12345678

me_malloc_allocator :: proc(master: ^MeMallocMaster) -> mem.Allocator {
	procedure :: proc(allocator_data: rawptr, mode: mem.Allocator_Mode,
	                  size, alignment: int,
	                  old_memory: rawptr, old_size: int,
	                  location := #caller_location) -> ([]byte, mem.Allocator_Error) {
        
        master := (^MeMallocMaster)(allocator_data)

		switch mode {
		case .Alloc, .Alloc_Non_Zeroed:
			res := me_malloc_alloc(master, uint(size))
            return mem.slice_ptr((^byte)(res), size), nil
        case .Free:
            me_malloc_free(master, old_memory)
            return nil, nil
		case .Resize, .Free_All, .Query_Info:
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
		data = master,
	}
}

MeMallocPage :: struct {
	magic: u32, // so we can verify it's actually a page
    pageId: uint, // increments on each page allocation
	pageType: MeMallocPageType,
	link: list.Node,
	// maintain a singly linked list of all pages with free segments (like blocks)
	nextFreePage: ^MeMallocPage,
	freeSegment: ^MeMallocSegment, // singly linked list of all segments with free blocks

	segments: [ME_MALLOC_SEGS_PER_PAGE]MeMallocSegment,
	firstSegmentBlock: MeMallocFreePtr, // where the first segment can potentially start (but it'll be rounded up to its block size)
}

MeMallocPageType :: enum {
	Small,
	Large,
}

MeMallocSegment :: struct {
	segStart: rawptr, // offset from start of page
    segIdx: uint, // index of segment within page
	segSize: uint,
	numBlocks: uint,
	blockSize: uint,
	freeBlocks: uint,
	nextFreeSegment: ^MeMallocSegment,
	firstBlock: ^MeMallocFreePtr,
	freeBlock: ^MeMallocFreePtr,
}

// stored within each block (provided it's unused)
MeMallocFreePtr :: struct {
	next: ^MeMallocFreePtr,
}

me_malloc_init :: proc(master: ^MeMallocMaster) {

}

me_malloc_alloc_page :: proc(master: ^MeMallocMaster) -> ^MeMallocPage {
    when ME_DEBUG {
        fmt.printf("me_malloc_alloc_page trying to allocate page\n")
    }

	pagePtr := mem.alloc(ME_MALLOC_PAGE_SIZE, ME_MALLOC_PAGE_SIZE, master.pageAllocator)

	page: ^MeMallocPage = (^MeMallocPage)(pagePtr)

	page.magic = ME_MALLOC_PAGE_MAGIC
	page.pageType = .Small
    page.pageId = master.pageIdFountain
    master.pageIdFountain += 1

	list.push_back(&master.pageList, &page.link)

	segStart := uintptr(&page.firstSegmentBlock);

	for _, i in page.segments {
		seg := &page.segments[i]
		if (i < len(page.segments) - 1) {
			seg.nextFreeSegment = &page.segments[i+1]
		}
		segEnd := mem.align_backward_uintptr(segStart + ME_MALLOC_SEG_SIZE, ME_MALLOC_SEG_SIZE)
        seg.segIdx = uint(i)
		seg.segStart = rawptr(segStart)
		seg.segSize = uint(segEnd - segStart)
		segStart = segEnd
	}
	page.freeSegment = &page.segments[0]

    when ME_DEBUG {
        fmt.printf("me_malloc_alloc_page now with %d segments of %d bytes, with the first having %d bytes\n", len(page.segments), ME_MALLOC_SEG_SIZE, page.segments[0].segSize)
    }

	return page
}

SMALL_STEP :: 16
SMALL_MAX :: 128

MED_STEP :: 64
MED_MAX :: 512

LARGE_STEP :: 512
LARGE_MAX :: 4096

me_malloc_alloc :: proc(master: ^MeMallocMaster, size: uint) -> rawptr {
    // when ME_DEBUG {
    // fmt.printf("me_malloc_alloc: %d\n", size)
    // }

    if size <= LARGE_MAX {
        blkIndex, blockSize := me_malloc_to_block_idx_size(size)
        seg := master.freeSegsFast[blkIndex]
        if seg != nil {
            when ME_DEBUG {
                // fmt.printf("me_malloc_alloc: %d found size %d, idx %d fast\n", size, blockSize, blkIndex)
            }
            return me_malloc_alloc_block_from_segment(master, seg)
        }
    } else {
        return mem.dynamic_pool_alloc(&master.dynamicPool, int(size))
    }

    _, blockSize := me_malloc_to_block_idx_size(size)

    // find a free segment in existing pages
    seg, page := me_malloc_find_small_segment(master, blockSize)
    page_alloced := false

    if (seg == nil) {
        // allocate a new page
        page = me_malloc_alloc_page(master)
        page_alloced = true
        seg, page = me_malloc_find_small_segment(master, blockSize)
    }

    if (page_alloced) {
        // need to ensure we do this after setting up the page, since it calls into the allocator
        // itself...
        master.pageMap[uintptr(page)] = page
    }

    me_malloc_init_small_segment(master, page, seg, blockSize)
    return me_malloc_alloc_block_from_segment(master, seg)
}

me_malloc_free :: proc(master: ^MeMallocMaster, ptr: rawptr) {
    // annoyingly, can't tell if our page is small or large, but assume small for now...
    // will need to query a hash table with the page pointer to find out

    page := (^MeMallocPage)(mem.align_backward_uintptr(uintptr(ptr), ME_MALLOC_PAGE_SIZE))

    if !(uintptr(page) in master.pageMap) {
        // oops, dynamic pool allocater doesn't support free
        return;
    }

    assert(page.magic == ME_MALLOC_PAGE_MAGIC)

    segPtr := mem.align_backward_uintptr(uintptr(ptr), ME_MALLOC_SEG_SIZE)

    segIdx := uint((segPtr - uintptr(page)) / ME_MALLOC_SEG_SIZE)

    seg:^MeMallocSegment = &page.segments[segIdx]

    when ME_DEBUG {
        // fmt.printf("me_malloc_free: %p, pageId %d, seg %v, segIdx %d\n", ptr, page.pageId, seg, segIdx)
    }

    if (seg.freeBlocks == 0) {
        me_malloc_segment_push_to_free_list(master, seg)
    }
    seg.freeBlocks += 1

    // check that ptr is actually at the start of a block
    basePos := mem.align_backward(seg.segStart, ME_MALLOC_SEG_SIZE); 

    assert((uintptr(ptr) - uintptr(basePos)) % uintptr(seg.blockSize) == 0, "ptr not at start of block, bad free!")

    block := (^MeMallocFreePtr)(ptr)
    block.next = seg.freeBlock
    seg.freeBlock = block

    if seg.freeBlocks == seg.numBlocks {
        me_malloc_segment_remove_from_free_list(master, seg)
    }
}

SMALL_IDX_BASE :: 0
MED_IDX_BASE :: SMALL_MAX / SMALL_STEP
LARGE_IDX_BASE :: (MED_MAX - SMALL_MAX) / MED_STEP + MED_IDX_BASE + 1
MAX_IDX :: (LARGE_MAX - MED_MAX) / LARGE_STEP + LARGE_IDX_BASE - 4

me_malloc_to_block_idx_size :: proc(size: uint) -> (uint, uint) {
    if size <= 8 {
        return 0, 8
    } else if size <= SMALL_MAX {
        size := mem.align_forward_uint(size, SMALL_STEP)
        return SMALL_IDX_BASE + size / SMALL_STEP, size
    } else if size <= MED_MAX {
        size := mem.align_forward_uint(size, MED_STEP)
        return MED_IDX_BASE + (size - SMALL_MAX) / MED_STEP, size
    } else if size <= LARGE_MAX {
        size := uint(math.next_power_of_two(int(size)))
        return (intrinsics.count_trailing_zeros(size) - 10) + LARGE_IDX_BASE, size 
    } else {
        return 0, 0
    }
}

me_malloc_alloc_block_from_segment :: proc(master: ^MeMallocMaster, seg: ^MeMallocSegment) -> rawptr {
    block := seg.freeBlock
    seg.freeBlock = block.next
    seg.freeBlocks -= 1

    if (seg.freeBlocks == 0) {
        me_malloc_segment_pop_from_free_list(master, seg)
    }

    return rawptr(block)
}

me_malloc_find_small_segment :: proc(master: ^MeMallocMaster, blockSize: uint) -> (^MeMallocSegment, ^MeMallocPage) {
	// umm, let's iterate through all pages and find a free segment
	pageIter := list.iterator_head(master.pageList, MeMallocPage, "link")
	for page, ok := list.iterate_next(&pageIter); ok; page, ok = list.iterate_next(&pageIter) {
		// check if this page has any free segments

        prevSegPtr := &page.freeSegment

        for seg := prevSegPtr^; seg != nil; seg = seg.nextFreeSegment {


            if seg.segSize >= blockSize {
                when ME_DEBUG {
                    fmt.printf("me_malloc_find_small_segment: found segment %d with size %d\n", seg.segIdx, seg.segSize)
                }
                prevSegPtr^ = seg.nextFreeSegment
                return seg, page
            } else {
                prevSegPtr = &seg.nextFreeSegment
            }
		}
    }

    when ME_DEBUG {
        fmt.printf("me_malloc_find_small_segment: no pages have segments to handle size %d\n", blockSize)
    }

	return nil, nil
}

align_forward_nonp2 :: proc(ptr: uintptr, align: uintptr) -> uintptr {
    return (ptr + align - 1) / align * align;
}

me_malloc_segment_push_to_free_list :: proc(master: ^MeMallocMaster, seg: ^MeMallocSegment) {
    blkIndex, _ := me_malloc_to_block_idx_size(seg.blockSize)
    seg.nextFreeSegment = master.freeSegsFast[blkIndex]
    master.freeSegsFast[blkIndex] = seg
}

me_malloc_segment_pop_from_free_list :: proc(master: ^MeMallocMaster, seg: ^MeMallocSegment) {
    blkIndex, _ := me_malloc_to_block_idx_size(seg.blockSize)
    if (master.freeSegsFast[blkIndex] == seg) {
        master.freeSegsFast[blkIndex] = seg.nextFreeSegment
        seg.nextFreeSegment = nil
    }
}

me_malloc_segment_remove_from_free_list :: proc(master: ^MeMallocMaster, seg: ^MeMallocSegment) {
    blkIndex, _ := me_malloc_to_block_idx_size(seg.blockSize)
    // just going to have to do an O(n) search for now
    prevSegPtr := &master.freeSegsFast[blkIndex]
    for segIter := prevSegPtr^; segIter != nil; segIter = segIter.nextFreeSegment {
        if segIter == seg {
            prevSegPtr^ = segIter.nextFreeSegment
            segIter.nextFreeSegment = nil
            return
        } else {
            prevSegPtr = &segIter.nextFreeSegment
        }
    }
}

me_malloc_init_small_segment :: proc(master: ^MeMallocMaster, page: ^MeMallocPage, seg: ^MeMallocSegment, blockSize: uint) {
    basePos := mem.align_backward(seg.segStart, ME_MALLOC_SEG_SIZE); 
    firstBlockPtr := align_forward_nonp2(uintptr(seg.segStart) - uintptr(basePos), uintptr(blockSize)) + uintptr(basePos)

	seg.blockSize = blockSize
	seg.numBlocks = uint((uintptr(seg.segStart) + uintptr(seg.segSize)) - firstBlockPtr) / blockSize
	seg.freeBlocks = seg.numBlocks
	seg.firstBlock = (^MeMallocFreePtr)(firstBlockPtr)
	seg.freeBlock = seg.firstBlock

    maxEndPtr := uintptr(basePos)
	// link all the blocks together
	for i in 0..<seg.numBlocks {
        blockPtr := (^MeMallocFreePtr)(uintptr(firstBlockPtr) + uintptr(i * blockSize))

        if i < seg.numBlocks - 1 {
            nextBlockPtr := (^MeMallocFreePtr)(uintptr(blockPtr) + uintptr(blockSize))
            blockPtr.next = nextBlockPtr
        } else {
            blockPtr.next = nil
        }
        maxEndPtr = uintptr(blockPtr) + uintptr(blockSize)
	}

    me_malloc_segment_push_to_free_list(master, seg)

    when ME_DEBUG {
        firstBlockOffset := uintptr(firstBlockPtr) - uintptr(seg.segStart)
        firstBlockBaseOffset := uintptr(firstBlockPtr) - uintptr(basePos)
        blockEndPtr := uintptr(seg.segStart) + uintptr(seg.segSize)

        assert(maxEndPtr <= blockEndPtr, "me_malloc_init_small_segment: max end ptr is greater than block end ptr")

        fmt.printf("me_malloc_init_small_segment: inited seg of size %d with %d blocks (page=%d,seg=%d) & offset %d/%d (given start of %p; check %d vs %d)\n",
            seg.blockSize, seg.numBlocks, page.pageId, seg.segIdx, firstBlockOffset, firstBlockBaseOffset, seg.segStart, blockEndPtr, maxEndPtr)
    }
}



test_me_malloc :: proc() {

when ME_DEBUG {
    my_master := MeMallocMaster{}
    me_malloc_init(&my_master)
    page_allocator := context.allocator
    my_master.pageAllocator = page_allocator

    my_allocator := me_malloc_allocator(&my_master)

    mem.dynamic_pool_init(&my_master.dynamicPool, page_allocator, my_allocator, PAGE_SIZE)

    track := mem.Tracking_Allocator{}
    mem.tracking_allocator_init(&track, my_allocator)

    allocator := mem.tracking_allocator(&track)

    for i in 0..<14 {
        mem.alloc(3000, 0, allocator)
    }

    small_ptrs := [70]rawptr{}

    for i in 0..<70 {
        ptr := mem.alloc(180, 0, allocator)
        small_ptrs[i] = ptr
        if ptr == nil {
            fmt.println("me_malloc_alloc failed")
            return
        }
    }

    fmt.printf("Now freeing %d small blocks\n", len(small_ptrs))
    for i in 0..<70 {
        mem.free(small_ptrs[i], allocator)
    }

    fmt.printf("Now allocating %d small blocks\n", 3)

    mem.alloc(180, 0, allocator)
    mem.alloc(180, 0, allocator)
    mem.alloc(180, 0, allocator)

    fmt.printf("Now allocating several massssive blocks\n")
    bigMemPtr := mem.alloc(100000, 0, allocator)

    mem.free(bigMemPtr)
}

}