import React from 'react';

/*

Let's think about what we want in our guide.

- Need a nice table of contents, showing the different sections
- Probably break into modules, and then each module has several sections

- Section 1: RISC-V Minimal Computer

  - Set up some ROM
  - add input number (address), and get out a value (the 32 bit number at that address)
  - add a register to hold our address (the program counter, or PC)
  - increment our register by 4, with an adder and a constant 4

  - add register file, add input + outputs + control to demonstrate how it works
  - add ALU, add inputs + outputs + control to demonstrate how it works

  - add instruction decoder and show some control signals monitored
    - show a few instructions, and how a 32bit number maps onto an instruction, and some very basic
      examples of instructions (just add for now)

  - start with ALU instructions that include 2 regs in, one out
    - link up ins-decode to ALU ctrl, and custom inputs, to show add,sub,shift,lt

  - now link ALU to registers, and ins-decode to registers
    - redo instructions that operate on registers (we'll start with non-zero numbers)
    - demonstrate writing to one we're reading from

  - how to get values into registers in the first place? immediate values!
    - add li instruction, and show RHS_imm output, removed 2nd reg, and now have 12 bits for rhs
    - addi zero, 0x34 => 0x34
    - now can also do sub r1, 25 => r2 etc
  - only 12 bits? what about the remaining 20? RISC-V has lui instruction. 20 bits + rd + 7
  - so to fill out a full 32 bit value, can do lui rd, 0x7ffff000 followed by addi rd, rd, 0xfff

  - branching

  - finally want to control where the PC goes, like in an if {} statement or a loop

  - idea is that we have 2 options: 1) inc by 4, 2) offset PC by whatever's in the instruction
    - branch, e.g. bne r1, r2, -16
    - output of ALU is a branch value
    - output of ins-decode is a branch offset
    - so decide between +4 & +x => a mux! selects between 2 options, 0 for the first, 1 for the other
    - now can create a loop (do a multiply, say)


  - jumping

  - RISC-V has 2 jump instructions:
    - jal   store PC + 4 into rd, add 20 bit imm to PC  (instead of 4)
    - jalr  store PC + 4 into rd, add 12 bit imm to reg (instead of 4)

  - and another instruction:
    - auipc, a bit like lui, in that it has a 20 bit imm, but it first adds it to the PC, and then
      puts it into a reg
    - then, an auipc r0, 0x7fff000 followed by a jalr ra, r0 0xfff allows us to jump anywhere in 32bit space

  - OK, how to string these up? Normally, PC + x => PC, and ALU out => reg, but instead have
    PC + x => reg, and ALU out => PC, so wire that up with a pair of muxes, Can use the ALU for both of these,
    but for jal, have to add imm to PC (rather than a reg), so also have mux to select between PC & reg (LHS)

  - Now have enough to operate these instructions! We can also jump by arbitrary amounts, based on what's
    in a given register.


  - What's the deal with storing PC + 4 in a reg? This is so we know where we should pick up where we left off
    after having just done a jump.

      li x2 13
      li x2 14
      jal rd, +24
      li x2 15
      li x2 16
      ecall
      ---
      ---
      li x3 1
      li x3 2
      li x3 3
      jalr zero, 0(ra)


  - Memory

  - Can't do all that much with only 31 32bit values! We need some memory we can write to & read from
  - Here's a memory module, with ctrl lines, we select whether to read or write, and also whether to
    do words, halfs, or bytes
  - 1) write 0x45 to 0x04, write 0x1234 to 0x06
  - 2) read byte from 0x04, read byte from 0x06
  - 3) read word from 0x04
  - Very clumsy with misaligned reads & writes: it just rounds down

  - Now dealing with data lines where ports can both read & write. Must ensure that only one is
    writing at any given time, or we'll get a short circuit!

  - We use a load-store module

  - It doesn't do too much, just adds 2 numbers to create an address, and expands 8/16 bit values
    into 32 bit values (& in particular, sign-extends them)
  - When writing, takes the first 8/16 bits
  - Wire this up to the instruction decode, with special wires for the offset, and also take
    an address base from LHS (rs1)
  - Data in (for store) comes from the RHS (rs2) line
  - Data out (for load) goes to the same output as the ALU

  - Great it works! Now can edit values in ram, and potentially do things like add a stack (later)
  - (need a nice example where we need to use the memory, like sorting some numbers with a simple
    sorter)

  - Breaking a standard rule here: RAM & ROM have overlapping address ranges: 0x2c references both a
    ROM address and a RAM address. For the moment, ROM only readable, and not in address space, but
    we can give the RAM it's own address space.

  - Add address mapper, which only responds if the upper bits map, and the lower bits are passed
    through to the memory for the actual access.
  - Now, all RAM addresses have a prefix, and RAM & ROM have non-overlapping address spaces

  - I/O

  - A CPU & program isn't very useful if it can't react to the world! So next thing is I/O: Input / Output
  - We use the same load/store operations to interact with the outside world, and modern microprocessors might
    have 20 or more different modules, each mapped to a particular chunk of address space, accessible
    via load/store

  - Set up a new address mapper, and add a simple module (output LED's, which are wired to pins on our chip)
  - Such a peripheral acts a bit like memory, and for some addresses, you can write then read
    - But a) they're wired up to something else, like external pins, and
          b) some addresses can have unique behaviours, like where 1-bits switch on, or switch off or toggle
             - enables updating a single bit without messing with other bits, or having to do a read/modify/write

  - 4096 in hex:
  - Here's our little API:
    - Base addr 0x40001000
    - 0x00: led values, first 8 bits, read & writeable
    - 0x04: toggle on: writeable only, reads back 0
    - 0x08: toggle off: writeable only, reads back 0
    - 0x0a: toggle: writeable only, reads back 0

  - liu s0, 0x40001        -- li 0x40001000 (our IO base address)
  - addi s0, s0, 0x000

  - li a0 0b10011001       -- our initial bit pattern of leds...
  - sw a0, 0(s0)           -- written directly to reg 0x00
  - lw a2, 0(s0)           -- (read it back)

  - li a1 0b11110000       -- our bit mask for toggling of leds (the first 4)...
  - sw a1, 0x0a(s0)        -- written to reg 0x0a
  - lw a2, 0x0a(s0)        -- (read it back)


  - This way, we keep our instruction set small, and can do plenty of additional things just by writing to
    and reading from memory locations



Next steps (I haven't created any logic for these!)

    - Interrupts
    - Pipelining
    - Branch prediction
    - Some way to write to ROM (Maybe an IO module?)

*/
