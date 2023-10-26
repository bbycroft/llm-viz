import React from 'react';
import { CPUDirectory, makeCpuMetadata } from '@/src/cpu/guide/GuideIndex';
import { CpuEnabledGuide, GuideSection, Ins, Para } from '@/src/cpu/guide/CpuEnabledGuide';
import { SchematicView } from '@/src/cpu/guide/SchematicView';
import { InstructionDetail, InstructionTable } from '@/src/cpu/guide/InstructionDetail';
import { CpuPortal } from '@/src/cpu/CpuPortal';
import { AutoLoadCode } from '@/src/cpu/guide/AutoLoadCode';

const dir = CPUDirectory.RiscvBasic;

export const metadata = makeCpuMetadata(dir);

export default function Page() {
    return <CpuEnabledGuide dir={dir}>

        <GuideSection title={"Introduction"}>
        <Para>
            In this guide we'll build a minimal RISC-V computer, building on a few pre-made components.

        This will give you a basic understanding of how machine code (just an array of bytes) gets turned
        into a working computer.
        The RISC-V instruction set is a good first choice, as the design choices make it very simple to
        implement.
        </Para>
        </GuideSection>

        <GuideSection title={"Instruction Set"}>
        <Para>
            The instruction set is the set of instructions the CPU can execute. Conveniently, each instruction
            in basic RISC-V is 4 bytes (32 bits) long.
        </Para>

        <Para>
            Here's a table of a selection of some of the instructions we'll be using:
        </Para>

        <div className='flex flex-col self-center w-[80%] py-4'>
            <div className='flex'>
                <div className='w-[9rem]'>add c a b</div>
                <div>Add reg A to reg B; write result to reg C</div>
            </div>
            <div className='flex'>
                <div className='w-[9rem]'>addi c a imm</div>
                <div>Add 20bit signed imm to reg A; write result to reg C</div>
            </div>
            <div className='flex'>
                <div className='w-[9rem]'>blt a b offset</div>
                <div>If reg A &lt; regB, jump by offset, otherwise continue</div>
            </div>
        </div>

        <Para>
            When a CPU executes instructions, it does so one at a time, in order. To keep track
            of which instruction we're executing, we use value called the <em>program counter</em> (PC).
            This is stored in a <em>register</em> as a 32 bit number.
        </Para>
        <Para>
            Because the PC is an address, it points to a byte (8 bits) in memory. And then since each instruction
            is 4 bytes long, we'll need to increment the PC by 4 each time we execute an instruction. Let's see this in action:
        </Para>

        <CpuPortal schematicId={"c-a7yetcbo"} caption={"Fig 1: PC register with a loop-back that gets 4 added to it on each cycle"} height={16} width={50} />

        <Para>
            We can see that the output of the PC register is connected to the input of the <em>add</em> component. Combined with
            the input of the constant value 4, this add component outputs PC + 4. Then, on the next <em>cycle</em>, the PC register
            will take on this value PC + 4 (shown in yellow).
        </Para>

        <Para>
            This cycle is driven by a hidden <em>clock signal</em>, and occurs each time we click the <em>step</em> button.
            We'll see more about the clock later. In our simple add-4 loop, the clock signal is only used by the register
            itself to update its value.
        </Para>

        <Para>
            OK, great, we've got our program counter incrementing each cycle. Now we need to use it to fetch an <em>instruction</em>.
            We add a ROM component, which contains our program, i.e. our list of instructions. Whenever we supply an address value,
            we'll return the 32-bit (4 byte) value stored at that address. The blue highlight indicates that address.
        </Para>

        <CpuPortal schematicId={"c-s1m3zs3x"} caption={"Fig 2: PC register looking up ROM contents"} height={30} width={70}>
            <AutoLoadCode fileName={'blinky2.elf'} />
        </CpuPortal>

        <Para>
            So as the PC advances, 4 bytes at a time, we get the next instruction from the ROM to execute. Currently,
            this will advance non-stop, but that's fine for now.
        </Para>

        <Para>
            Now what do our instructions actually do? One of their basic tasks is to manipulate values stored in a set
            of <em>registers</em>. These are just 32-bit values that can be read from and written to. In the RISC-V 32bit
            ISA, there are 32 such registers (numbered 0 to 31). We call this set of registers the <em>register file</em>.
        </Para>

        <CpuPortal schematicId={"reg-file-demo"} caption={"Register File with input & 2 outputs"} height={60} width={70} />

        <Para>
            This particular register file has 1 input, and 2 outputs. That is, in a given cycle, we can read any two
            values simultaneously (including from the same register). We can also write to any single register, whose
            value will be updated at the start of the next cycle. The one exception is the first register, <code>zero</code>: it always
            outputs zero, and any writes to it are ignored. Give it a go!
        </Para>

        <Para>
            Now with our register file in hand, and a way to fetch instructions, we can now take a look at the various instructions
            in our <em>instruction set</em>. Each 32 bit instruction we fetch from the ROM has a specific meaning, which we need
            to interpret, and act upon. The following sections will take us through the various instruction types, and what we need
            to add to our computer to support them.
        </Para>

        </GuideSection>

        <GuideSection title={"R-Type (register-type) instructions"}>

        <Para>
            Let's assume we've already populated our register file with some values. And then we want to take two values,
            from registers 3 & 4, add them, and then store the result in register 6.

            To do this, we'll use the RISC-V <Ins>add</Ins> instruction. The instruction contains several bits of
            information:
        </Para>

        <ol className='ml-8 my-4'>
            <li>1. The fact that we're doing an add instruction (as opposed to a subtract, or a jump, or a load from memory, etc)</li>
            <li>2. The register number of the destination register (6)</li>
            <li>3. The register number of the first source register (3)</li>
            <li>4. The register number of the second source register (4)</li>
        </ol>

        <Para>
            That first bit of info, about it being an <code>add</code>, is actually split into two portions. The first of them indicates
            that it's a register-register instruction (read from 2, write to 1, i.e. an R-Type instruction), and then the second portion
            indicates it's an add, as opposed to a subtract, shift, and, xor etc. Here's the complete breakdown of the instruction. The other thing to note is that each of the register
            values is 5 bits long, which allows us to choose between 2^5 = 32 values, i.e. the 32 registers.
        </Para>

        <InstructionTable>
            <InstructionDetail name={'add'} />
        </InstructionTable>

        <Para>
            The work to take an instruction, and figure out what it means, is called <em>instruction decode</em>. We'll
            use a fully-formed component for this, which can handle all the different instuction types, but for now it will
            only be able to perform an add operation. We attach our instruction decoder to the output of the ROM, whose
            address we've selected.
        </Para>

        <SchematicView schematicId={"ins-decode-add"} caption={"Instruction Decoder hooked up to ROM (but not to registers or ALU)"} />

        <Para>
            The instruction decode component outputs a whole suite of <em>control signals</em>, which are routed to the
            various other components, telling them what to do. This component is also considered "combinatorial", meaning
            its outputs are wholy determined by its inputs, and don't depend on any internal state. In contrast,
            the register file is considered "sequential", because it has internal state (the values of the registers), and
            also integrates with the clock signal.
        </Para>

        <Para>
            For example, the instruction decoder outputs control signals to the register file, telling it which registers
            to read & write from. It also indicates that we want to do an add operation, which is routed to what we call
            an `ALU` (arithmetic logic unit).
        </Para>

        <Para>
            For now, we'll use an add component instead of a full ALU, and it will be always-on.
        </Para>

        <SchematicView schematicId={"ins-decode-add"} caption={"Instruction Decoder hooked up register file, with simple add instruction"} />

        <Para>
            Now we have a working add instruction! When we step the clock, the instruction decoder tells the register file
            to read from the two source registers, and then write the result to the destination register. The add component does
            the actual computation, and the register file updates its internal state. When we encounter a dud instruction like
            <code>0x0000_0000</code>, we don't do anything, and when we come to the add instruction, we do the appropriate action.
        </Para>

        <Para>
            Our 2-register input & 1-register output style of instructions forms a family of R-type (register-type) instructions.
            They're all quite similar in operation, except for the actual calculation that takes place. Instead of our add component,
            we'll use a proper ALU component. This does all the other operations we need, like subtract, shift, and, or, etc.
            From the instruction decoder's perspective, it just passes a few bits directly from the original instruction to the ALU, and
            then the ALU can use those bits to decide what operation to perform. Below is a table of the R-type instructions we'll be using.
        </Para>

        <InstructionTable>
            <InstructionDetail name={'add'} />
            <InstructionDetail name={'sub'} />
            <InstructionDetail name={'sll'} />
            <InstructionDetail name={'slt'} />
            <InstructionDetail name={'sltu'} />
            <InstructionDetail name={'xor'} />
            <InstructionDetail name={'srl'} />
            <InstructionDetail name={'sra'} />
            <InstructionDetail name={'or'} />
            <InstructionDetail name={'and'} />
        </InstructionTable>

        <Para>
            These 10 instructions can be defined with 4 bits (2^3 = 8: too small; 2^4 = 16: sufficient), so those 4 bits are passed to the ALU. The
            4 bits are taken from the 3 "funct3" bits (in black), as well as the second bit in the instruction (also in black). The latter bit
            differentiates between a couple of closely related operations: add vs subtract, and shift-right-logical vs shift-right-arithmetic.
            We also pass a few extra bits to the ALU, which tell it whether to do anything at all, as well as whether
            it should produce a <em>branch</em> bit. Let's hook up the ALU, and see it in action:
        </Para>

        <SchematicView schematicId={"ins-decode-alu"} caption={"Instruction Decoder hooked up to ALU, with several R-type instructions"} />

        </GuideSection>

        <GuideSection title={"I-Type (immediate-type) instructions"}>

        <Para>
            So far, we've assumed the register file is already populated with values. But normally, such a register
            file gets reset to all zeros, and with all of the R-Type instructions, there'd be no way to change any
            of them to anything other than zero. So to help with that, we introduce a new type of instruction, called
            an I-Type (immediate-type) instruction. These instructions are similar to R-Type instructions, except
            instead of taking two register values as inputs, they take one register value, and one immediate value.
        </Para>

        <Para>
            The word <em>immediate</em> just means that the value is stored directly in the instruction itself, rather
            than taken from a register. Ideally we'd like to set a register to any 32-bit value, but since the instruction
            itself is 32 bits long, we can only use a few of those bits. Let's account for what the other bits are used for:
        </Para>

        <ol className='ml-8 my-4'>
            <li>7 bits: the instruction type (I-type)</li>
            <li>3 bits: the ALU operation (add, shift, and, or, ...)</li>
            <li>5 bits: the source register for the LHS</li>
            <li>5 bits: the destination register</li>
        </ol>

        <Para>
            Those take up a total of 20 bits, leaving 12 bits for the immediate value, and our addi instruction (for example)
            looks like this:
        </Para>

        <InstructionTable>
            <InstructionDetail name={'addi'} />
            <InstructionDetail name={'slti'} />
            <InstructionDetail name={'sltiu'} />
            <InstructionDetail name={'xori'} />
            <InstructionDetail name={'ori'} />
            <InstructionDetail name={'andi'} />
            <InstructionDetail name={'slli'} />
            <InstructionDetail name={'srli'} />
            <InstructionDetail name={'srai'} />
        </InstructionTable>

        <Para>
            Instead of using two values from the register file, we use one value from the register file, and one from the
            instruction-decode, which the instruction-decoder expands from the 12-bit immediate value into a full 32-bit value.
            That value is then passed into the ALU. Like the R-type instruction, the ALU result then feeds back into the register
            file.
        </Para>

        <Para>
            Before we had 10 instructions, and now we only have 9. Compared to the R-type instructions, the I-type instructions lack
            a <code>subtract</code> operation. This turns out to be fine, since we can just use the <code>addi</code> instruction with a negative immediate
            value. However, we still need the 4th bit to differentiate between shift-right-logical and shift-right-arithmetic.
            This turns out to be doable, since all the shift instructions only need a 5-bit immediate value (we're only operating on
            32 bit values, so the maximum shift is 2^5 = 32), and we can use the instruction's bit-2 as before.
        </Para>

        <Para>
            So for R-type, the RHS comes from the register file, and for I-type, the RHS comes from the immediate value. Therefore
            we need to select between these two. To do that, we use a <em>mux</em> (multiplexer) component. This particular version
            is a 2-input, 32-bit mux, meaning it can select between two inputs, and output one of them, operating on the 32 values
            in concert. To select between 2 inputs, we only need a single bit.
        </Para>

        <SchematicView schematicId={"2-input-mux"} caption={"Mux (multiplexer) with 2 inputs, driven by a selector bit"} />

        <Para>
            Now we can use this mux to select between the two inputs to the ALU. The instruction decoder will tell the mux whether
            to select the immediate value, or the register value.
        </Para>

        <SchematicView schematicId={"r-type-i-type"} caption={"Ins-decode selecting between I-type & R-type instructions"} />

        <Para>
            This program can now load several values into registers using the addi instruction, and then use the R-type instructions
            to operate on them to produce a new value. Great, we're making progress.
        </Para>

        </GuideSection>

        <GuideSection title={"B-type (branching) instructions"}>

        <Para>
            The next instruction type we'll support is the B-type (branching) instruction. This is the first time we'll be making
            the PC register change to something other than PC + 4. This instruction forms the basis of things like if/else statements
            and for-loops. The instruction is a bit like the I-type instruction: it contains two register values and an immediate.
            However, the 2 registers represent two values to compare (i.e. reads), and the immediate is used as an address offset.
            Here's the breakdown:
        </Para>

        <InstructionTable>
            <InstructionDetail name={'beq'} />
            <InstructionDetail name={'bne'} />
            <InstructionDetail name={'blt'} />
            <InstructionDetail name={'bge'} />
            <InstructionDetail name={'bltu'} />
            <InstructionDetail name={'bgeu'} />
        </InstructionTable>

        <Para>
            We pass the two register values to the ALU, and perform a comparison on them. There are a few different comparison
            types, and each of them produces a 1-bit value: "Is the condition met?". We then use this 1-bit value to choose
            whether we want to jump or not.
        </Para>

        <Para>
            The instruction decoder is already sending the ALU a <em>branch</em> bit, which tells it to output a 1-bit value, and
            now we need to wire that output value to a mux. That mux can then select between the <code>PC + 4</code> value, and the <code>PC + offset</code> value.
            Since they're both offsets, we can select between <code>4</code> & <code>offset</code>, where the offset comes from the instruction decoder.
        </Para>

        <SchematicView schematicId={"b-type"} caption={"Ins-decode with branching"} />

        <Para>
            Now we can hop around our program, and the path we take depends on the values in the registers. Step through a few of
            the programs to see them in action.
        </Para>

        </GuideSection>

        <GuideSection title={"J-type (jump) instructions"}>

        <Para>
            The next important instruction type is the J-type (jump) instruction. These are called "unconditional" jumps, because
            they always jump, rather than only jumping if a condition is met. There are a couple of different types of jump instructions:
        </Para>

        <InstructionTable>
            <InstructionDetail name={'jal'} />
            <InstructionDetail name={'jalr'} />
        </InstructionTable>

        <Para>
            These two, <Ins>jal</Ins> (jump & link) and <Ins>jalr</Ins> (jump & link register), are fairly similar. They both jump to
            a new address (the jump part), and they both store the value <code>PC + 4</code> in a register (the link part). The difference is that
            <Ins>jal</Ins> calculates the new address as <code>PC + 20-bit-imm</code>, and <Ins>jalr</Ins> calculates it as <code>reg[rs1] + 12-bit-imm</code>.
        </Para>

        <Para>
            In order to implement these instructions, we'll use the ALU to calculate the new address. For the jal instruction, we'll need
            to include a mux to change between taking the LHS value from either the PC or the register file (The inputs are already available
            for jalr). We'll add a control signal to this new mux as well.
        </Para>

        <SchematicView schematicId={"b-type"} caption={"Add PC mux wires"} />

        <Para>
            To handle the ALU results, we need to add a couple more mux's. Normally, <code>PC + [offset]</code> goes back to PC, and ALU output
            goes to the register file. But for our jump instructions, we do the opposite: <code>PC + [offset]</code> goes to the register file, and
            ALU output goes to PC. To do this, we can use a couple of mux's to select the correct source. This can be controlled
            by a single signal from the instruction decoder.
        </Para>

        <SchematicView schematicId={"b-type"} caption={"Add result switching"} />

        <Para>
            These instructions can seem a bit odd at first, but they're rather powerful. Their basic use is to call into and return from functions.
            How we do this is: executa a <code>jal</code> instruction with it's imm value set to an offset that is the start of the function, and set the dest
            register of <code>PC + 4</code> to be the <code>ra</code>, or "return address" register (index = 1). The PC then starts executing the instructions.
            When we want to
            return to the calling code, we simply execute <code>jalr 0, ra, 0</code>, which jumps to the address stored in <code>ra</code>. Since <code>ra</code>
            contained <code>PC + 4</code> when we first jumped, the return address is the instruction immediately after the initial <code>jal</code> instruction.
        </Para>

        </GuideSection>
        <GuideSection title={"Upper-immediate instructions"}>
        <Para>
            So far, we've only been able to load 12-bit values immediate values into registers. Typically this is done with <code>addi rd, 0, imm</code>,
            i.e. adding 0 to the immediate value. But what if we want to load a 32-bit value? We could do several
            addi's & shifts, but RISCV provides instructions to set the remaining upper 20 bits:
        </Para>

        <InstructionTable>
            <InstructionDetail name={'lui'} />
            <InstructionDetail name={'auipc'} />
        </InstructionTable>

        <Para>
            The first one, <Ins>lui</Ins> (load upper immediate), sets the upper 20 bits of a register to the immediate
            value provided. We can do this simply by setting the LHS to 0, and the RHS to the immediate value. Since these wires
            are 32-bits in width, the mapping to the upper bits happens entirely in INS-decode.
        </Para>

        <Para>
            The second one, <Ins>auipc</Ins> (add upper immediate to PC), is essentially the same, except the LHS is set to
            the PC. Luckily, we don't need any changes, as we already have the mux used to select between PC & register file
            for the LHS.
        </Para>

        </GuideSection>

        <GuideSection title={"Load/Store instructions"}>
        <Para>
            Right now, our CPU can't do much. It can load values into registers, operate on them, and jump around the code.
            The next major thing is to be able to read & write to memory. This is actually quite powerful, as addresses don't
            necessarily need to map to physical memory, but can instead control external devices.
        </Para>
        <Para>
            To access memory, RISCV provides a couple of types of instruction: load & store.
        </Para>

        <ul className='self-center my-4'>
            <li><b>Load:</b> memory@address --&gt; register</li>
            <li><b>Store:</b> register --&gt; memory@address</li>
        </ul>

        <Para>
            So to do any computations on data, we first need to load it into a register from memory, then operate on it, before
            storing the result back into memory. The RISVC instructions for this are as follows:
        </Para>

        <InstructionTable>
            <InstructionDetail name={'lb'} />
            <InstructionDetail name={'lh'} />
            <InstructionDetail name={'lw'} />
            <InstructionDetail name={'lbu'} />
            <InstructionDetail name={'lhu'} />

            <InstructionDetail name={'sb'} />
            <InstructionDetail name={'sh'} />
            <InstructionDetail name={'sw'} />
        </InstructionTable>

        <Para>
            There are a few different types of load & store instructions. The main breakdown is that there are 3 different
            sizes of data that can be loaded/stored: 8-bit (b; "byte"), 16-bit (h; "half-word"), and 32-bit (w; "word").
            The byte & half-word sizes also have unsigned versions, as for the other ones, we sign-extend the value to 32-bits.
        </Para>

        <Para>
            In all cases, the memory address is calculated as (reg[rs1] + imm). For our CPU, we won't use the ALU for this
            addition, but instead include an adder in the load/store component. We'll feed in the LHS value (reg[rs1]), into
            the load/store. We also feed reg[rs2] into the load/store for stores. Finally, for loads, we send the result to the
            registers in the same manner as the ALU results.
        </Para>

        <Para>
            Let's take a look at the RAM (memory) component that we'll be interfacing with. It's a simple component that takes
            an address, some control lines, and a bi-directional data line. The data line is used for both reads & writes, so
            that in any given cycle, it can either read or write the provided address. The choice of reading or writing (or neither)
            is controlled by the control lines. Finally, writing can be done in either 8-bit, 16-bit, or 32-bit chunks, also controlled
            by the control lines.
        </Para>

        <SchematicView schematicId={"b-type"} caption={"RAM control"} />

        <Para>
            To hook this RAM to our CPU, we add our load/store component and wire it up to the address/data/ctrl bus, as well as
            the CPU internals. We can now execute our load & store instructions to read & write to the memory.
        </Para>

        <SchematicView schematicId={"b-type"} caption={"RAM & load/store connected"} />

        <Para>
            This enables us to write programs that can access memory, and therefore do useful things. In our setup here, the address
            0x0 refers to the first 32-bit value in RAM and 0x4 refers to the second 32-bit value in RAM. This isn't that great,
            since our ROM <em>also</em> has its first 32-bit value at address 0x0 (where the PC is initialized to). Generally
            when setting up a system like this, we want non-overlapping address spaces for our different regions of memory, and
            compilers will typically complain if this is not the case.
        </Para>

        </GuideSection>

    </CpuEnabledGuide>;
}
