# CPU

An investigation of how a CPU functions, from microcontrollers to desktop computers. (<-- a bit ambitious)


## Roadmap/Next Steps/TODO list

### Interaction
- selection of wires, ports, comps
- [x] mode for making comps transparent (selection of wires)
- join colinear wires, fix subtraction bug

### UI
- pinning of info to wires & ports
- [x] add ALU info
- [x] switch to divs for register info
- [x] highlight wire-to-wire nodes & comps; dim others
- movement-along-wire animation
	- figure out segments (known), and offsets (need to add)
	- some renderSeg(a, b, offset, t)
	- then add t value for animation
		- probably do a fade out, unless hover
- dim particular wires, like ctrl wires
- think about how to do wire colors given state. not sure if it's worth showing 0's for addresses/data, say.
- add custom rendering for wires, e.g. multi-bit ctrl lines/ports

### System Features
* sub-modules
* more test cases
	* probably just build this out myself
	* but figure out some way to validate that my tests work as expected!
		* test-running + test-evaluation
		* need a way to define this such that we work both on some working emulator as well as on my system
		* i.e. our tests should pass on both
		* probably do some magic with macros
			* bne a0 a1 -> fail
