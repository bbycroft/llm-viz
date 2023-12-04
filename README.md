
# Brendan Bycroft's Home Page & Projects

This repository contains my (Brendan's) homepage, as well as a number of non-trivial projects.

They are kept in a single repository for ease of deployment, as well as sharing a bunch of js utils
which are otherwise a pain to share around.

## Projects

The main projects are:
* LLM Visualization: 3D interactive model of a GPT-style LLM network running inference.
* [WIP] CPU Simulation: A 2D digital schematic editor with full a execution model, showcasing a simple
  RISC-V based CPU

### LLM Visualization

This project displays a 3D model of a working implementation of a GPT-style network. That
is, the network topology that's used in OpenAI's GPT-2, GPT-3, (and maybe GPT-4).

The first network displayed with working weights is a tiny such network, which sorts a small list
of the letters A, B, and C. This is the demo example model from Andrej Karpathy's
[minGPT](https://github.com/karpathy/minGPT) implementation.

The renderer also supports visualizing arbitrary sized networks, and works with the smaller gpt2
size, although the weights aren't downloaded (it's 100's of MBs).

### CPU Simulation (WIP; not exposed yet!)

This project runs 2D schematic digital circuits, with a fully fledged editor. The intent is to
add a number of walkthroughs, showing things such as:
  * how a simple RISC-V CPU is constructed
  * the constituent parts down to gate level: instruction decode, ALU, add, etc
  * higher level CPU ideas, like various levels of pipelining, caching, etc

## Running Locally

1. Install dependencies: `yarn`
1. Start the dev server: `yarn dev`
