import { hasFlag, isNil, isNotNil, makeArray } from "../utils/data";
import { IResetOptions } from "./comps/CompBuilder";
import { compPortDefId, ICompPortConfig, ICompPortData } from "./comps/CompPort";
import { PortType, IEditSnapshot, IExeComp, IExeNet, IExePortRef, IExeSystem, IExeStep, IElRef, IoDir, ISchematic, IComp, IExeBlock, IDecrBlockTarget } from "./CpuModel";
import { ISharedContext } from "./library/SharedContext";
import { getCompSubSchematicForSnapshot } from "./SubSchematics";

/*

Options for handling sub-components.

Constraints:
  1) Have to make an IExeComp for every instance of sub-comps
  2)

Options:
  - Create sub-trees of IExeSystem's, or
  - just have a flat list of IExeComp's

For a flat list, we need to be able to look up the IExeComp for a given IElRef.
Currently, nested IElRef's aren't supported (we just view the top-level schematic), however, we'll
want to support this in the future, when we support zooming into sub-schematics.

If we had subtrees, would need to break the sub-models into multiple passes, which seems tricky, also
would need to store the IExeSystem somewhere.

Let's stick with the flat-list for now.



Having real trouble passing data between external & internal ports.

----

Need to add dynamic sequencing to handle tri-state ports & wires properly. This will mean that
things like transmission gates work correctly in both directions, and we don't have to manually set
the direction a-priori.

So, things to consider:

1) Splitting the combinatorial execution into multiple blocks: have blocks that are staticly
   ordered, and the order in which we execute the blocks is dynamic.
2) Each such block has required & optional inputs that need to be resolved.
3) Optional inputs are things like: either [a] or [b] need to be resolved. (e.g. a transmission gate
   needs one side to be resolved so that it can pass through the other side)
   - So can't have a strict counter for the number of inputs that need to be resolved.
4) Kinda want to bake in ordering for some components even if they're not obvious upfront. e.g. a
   bit-mapper can comfortably go both ways, but the inputs/outputs on either side can decide this.
   Actually, it's a bit of a pain, so we'll leave that case as-is, and enforce setting the direction
   manually. Or at least, it's part of the comp args, and the UI could potentially examine
   the net graph and set the direction that way.
5) Since we're breaking execution into mulitple blocks, can do the same for internal schematics of
   code-backed components, and can safely disable execution of those blocks as a whole.

Some of the blocks will be quite small, e.g. a single transmission gate. Additionally, each comp phase
will need to describe the resolution requirements (ctrl port required; 1 of 2 data ports required),
and this will need to be replicated in the block model.

Is there an upper bound on how many optional requirements a block can have? Ideally want to make these
things all O(1) without having to add Set's etc.

Actually, does a port ever have more than one block that it's connected to? If not, then we can just
have a couple of integers per per port: 1) the block index, and 2) the counter index to decrement.
And then the block has a set of n counters. Once all the counters are 0, the block is ready to execute.
And some indexes might have an initial count of 1, but multiple ports can decrement that counter.

Not really sure how nets fit into this. Are they the things that do this counter checking & decrementing?
They're definitely a part of blocks, but sometimes they are sort of the glue between blocks.

Need some examples!!

Have some ideas about how we construct the blocks & execution order.

1) We iterate over the comps & nets as before, with the same sort of counters on each comp & net.
   This includes having optional inputs.
2) We do our decrementing, and when they go to zero, we push onto the stack. Some wires, for example,
   are always non-floating, so those will decrement our multi-input counter at this static point.
3) Once this has done, we somehow decide to restart the process, to construct a new block.
4) The stop-points are tri-state nets with multiple optional inputs, whose input is dynamically
   defined.
5) So a tristate net has potentially multiple inputs. And we need to see if they're from different
   blocks. Different blocks are un-ordered with respect to each other, so if the inputs are from
   different such blocks, then we need to form a new block.
6) If a component (or net?) has all its inputs resolved by various blocks, then we can put it into
   our list of new-blocks-to-create, and restart the process.

Hmm, actually need to come up with a design that genuinely requires more than 1 block!!

stop point is a "maybe-write" to tri-state?

How do we choose our restart points though!?!? In particular, if we don't know the ordering now, we can't
order them in creating the blocks.

Let's look at tri-state wires as our start-points. Ones that have been "seen", but unable to resolve due to
the maybe-write boundary issue.

We pick one, and start resolving it.


*/

export function createExecutionModel(sharedContext: ISharedContext, displayModel: IEditSnapshot, existingSystem: IExeSystem | null): IExeSystem {

    let exeSystem: IExeSystem = {
        compLibrary: sharedContext.compLibrary,
        comps: [],
        nets: [],
        executionSteps: [],
        latchSteps: [],
        executionBlocks: [],
        lookup: { compIdToIdx: new Map(), wireIdToNetIdx: new Map() },
        runArgs: { halt: false },
    };

    populateExecutionModel(sharedContext, displayModel, exeSystem, displayModel.mainSchematic, '', existingSystem);

    let executionOrder = calcCompExecutionOrder(exeSystem.comps, exeSystem.nets);

    exeSystem.executionBlocks = executionOrder.exeBlocks;
    exeSystem.latchSteps = executionOrder.latchSteps;

    // console.log('new exeSystem:', exeSystem);
    // console.log('old exeSystem:', createExecutionModel(compLibrary, displayModel, existingSystem));

    return exeSystem;
}

export function populateExecutionModel(sharedContext: ISharedContext, editSnapshot: IEditSnapshot, exeSystem: IExeSystem, schematic: ISchematic, subTreePrefix: string, existingSystem: IExeSystem | null) {
    let compLibrary = sharedContext.compLibrary;
    // we build the subtree prefix as "id|subId|"
    let connectedWires = schematic.wires;
    let connectedComps = schematic.comps;

    let compIdToLocalIdx = new Map<string, number>();
    for (let i = 0; i < connectedComps.length; i++) {
        compIdToLocalIdx.set(connectedComps[i].id, i);
    }

    let localCompToExeCompIdx = new Map<IComp, number>();
    let nestedCompPortLookup = new Map<IComp, (IExeComp<ICompPortData> | null)[]>();

    for (let comp of schematic.comps) {
        let def = compLibrary.getCompDef(comp.defId)!;
        let subSchematic = getCompSubSchematicForSnapshot(sharedContext, editSnapshot, comp);
        if (subSchematic) {
            let prefix = subTreePrefix + comp.id + '|';
            populateExecutionModel(sharedContext, editSnapshot, exeSystem, subSchematic, prefix, existingSystem);
        }

        let fullCompId = subTreePrefix + comp.id;

        let exeComp = compLibrary.build(comp);
        exeComp.compFullId = fullCompId;

        if (existingSystem) {
            let existingIdx = existingSystem.lookup.compIdToIdx.get(fullCompId);
            let existingExeComp = existingSystem.comps[existingIdx!];
            if (existingExeComp) {
                def.copyStatefulData?.(existingExeComp.data, exeComp.data);
            }
        }

        let newCompIdx = exeSystem.comps.length;

        exeComp.idx = newCompIdx;
        localCompToExeCompIdx.set(comp, newCompIdx);
        exeSystem.lookup.compIdToIdx.set(fullCompId, newCompIdx);
        exeSystem.comps.push(exeComp);

        if (subSchematic) {
            let prefix = subTreePrefix + comp.id + '|';

            let innerSchematicPorts = subSchematic.comps.filter(a => a.defId === compPortDefId) as IComp<ICompPortConfig>[];

            let nestedComps = exeComp.ports.map(exePort => {
                let port = exeComp.comp.ports[exePort.portIdx];
                let schemPort = innerSchematicPorts.find(a => a.args.portId === port.id);
                if (!schemPort) {
                    return null;
                }
                let schemExeComp = exeSystem.comps[exeSystem.lookup.compIdToIdx.get(prefix + schemPort.id)!] as IExeComp<ICompPortData> | null;

                return schemExeComp;
            });

            nestedCompPortLookup.set(exeComp.comp, nestedComps);
        }
    }

    for (let wire of connectedWires) {
        let refs = wire.nodes.map(n => n.ref).filter(isNotNil);

        let netIdx = exeSystem.nets.length;
        let type = PortType.None;
        let tristate = false;
        let width = 1;

        let dests: IExePortRef[] = [];
        let srcs: IExePortRef[] = [];
        for (let ref of refs) {
            let comp = connectedComps[compIdToLocalIdx.get(ref.id)!];
            if (!comp) {
                continue;
            }
            let portIdx = comp.ports.findIndex(p => p.id === ref.compNodeId);
            if (portIdx < 0) {
                continue;
            }

            let exeComp = exeSystem.comps[localCompToExeCompIdx.get(comp)!];
            let exePort = exeComp.ports[portIdx];

            exePort.netIdx = netIdx;

            let nestedPortComps = nestedCompPortLookup.get(exeComp.comp);

            let bindOutPort = true;

            if (nestedPortComps) {
                /*
                    When going into a sub-schematic, we find the CompPort comp in the sub-schematic,
                    and bind our wire to that CompPort's hidden 'externalPort'.

                    This means there are two potential ports to bind to: the parent comp port, and
                    the inner CompPort externalPort.

                    For input ports (data flowing into the parent component), we bind to both.
                    For output ports (data flowing out of the parent component), we bind to one or
                    the other.

                    The choice for output ports depends on whether we want to take from the sub-schematic
                    (required if there's only a sub-schematic).
                    If the parent component has both a sub-schematic and code, we can choose. Generally
                    we prefer to take from code, as that's faster.
                */
                let nestedExeComp = nestedPortComps[portIdx];
                if (nestedExeComp) {
                    nestedExeComp.data.externalPortBound = true;

                    var compDef = exeSystem.compLibrary.getCompDef(exeComp.comp.defId)!;
                    let bindSubSchematicOutPort = !!compDef.subLayout;

                    let nestedExternalPort = nestedExeComp.ports[1];
                    nestedExternalPort.netIdx = netIdx;
                    let portRef: IExePortRef = {
                        comp: nestedExeComp.comp,
                        portIdx: 1,
                        exeComp: nestedExeComp,
                        exePort: nestedExternalPort,
                        valid: true,
                        nestedPort: true,
                    }
                    if (hasFlag(exePort.type, PortType.In)) {
                        dests.push(portRef);
                    }
                    if (bindSubSchematicOutPort && hasFlag(exePort.type, PortType.Out)) {
                        srcs.push(portRef);
                        bindOutPort = false;
                    }
                    exePort.nestedPort = portRef;
                }
            }

            if (hasFlag(exePort.type, PortType.In)) {
                dests.push({ comp, portIdx, exeComp, exePort, valid: true, nestedPort: false });
            }
            if (hasFlag(exePort.type, PortType.Out) && bindOutPort) {
                srcs.push({ comp, portIdx, exeComp, exePort, valid: true, nestedPort: false });
            }

            if (hasFlag(exePort.type, PortType.Tristate)) {
                tristate = true;
            }
            width = exePort.width;
            type |= exePort.type;
        }

        let wireFullId = subTreePrefix + wire.id;

        if (srcs.length > 1 && tristate) {
            let nonTristateSrcIdx = srcs.findIndex(a => !hasFlag(a.exePort.type, PortType.Tristate));
            if (nonTristateSrcIdx >= 0) {
                // an input sans-tristate means it's always-on, so we can remove other inputs
                // TODO: might be a bad idea, idk!
                // e.g. want to notice if there's an enabled tri-state input, which would result in a runtime error
                // but for transmission-gates, this behaviour is desired
                // srcs = [srcs[nonTristateSrcIdx]];
            }
        }

        let net: IExeNet = {
            idx: netIdx,
            width,
            wireFullId,
            wire,
            tristate,
            dests,
            srcs,
            value: 0,
            enabledCount: 0,
            exeBlockIdx: -1,
            type,
        };

        exeSystem.lookup.wireIdToNetIdx.set(wireFullId, netIdx);
        exeSystem.nets.push(net);
    }
}

export function lookupPortInfo(system: IExeSystem, ref: IElRef) {
    let compIdx = system.lookup.compIdToIdx.get(ref.id) ?? -1;
    let compExe = system.comps[compIdx];
    if (!compExe) {
        return null;
    }
    let portIdx = compExe.comp.ports.findIndex(p => p.id === ref.compNodeId);
    if (portIdx < 0) {
        return null;
    }
    let portExe = compExe.ports[portIdx];
    let comp = compExe.comp;
    let port = comp.ports[portIdx];
    return { compIdx, portIdx, compExe, portExe, comp, port };
}

export function calcCompExecutionOrder(comps: IExeComp[], nets: IExeNet[]): { exeBlocks: IExeBlock[], latchSteps: IExeStep[] } {

    // nodes are [...nets, ...compsPhase0, ...compsPhase1, ...compPhase2], where the phase groups are of equal length
    let compStride = comps.length;
    let compOffset = nets.length;
    let netOffset = 0;
    let maxCompPhases = Math.max(...comps.map(a => a.phases.length), 0);

    let realNodeCount = nets.length + comps.reduce((a, b) => a + b.phases.length, 0);
    let nodeArrayLength = nets.length + comps.length * maxCompPhases;

    let compPhaseToNodeId = (compIdx: number, phaseIdx: number) => {
        return compOffset + compIdx + phaseIdx * compStride;
    };

    let netToNodeId = (netIdx: number) => {
        return netOffset + netIdx;
    };

    let nodeIdToCompPhaseIdx = (nodeId: number) => {
        if (nodeId < compOffset) {
            return null; // net
        }
        let compIdx = (nodeId - compOffset) % compStride;
        return {
            compIdx: compIdx,
            phaseIdx: Math.floor((nodeId - compOffset) / compStride),
        };
    };

    let nodeIdToNetIdx = (nodeId: number) => {
        if (nodeId >= compOffset) {
            return null; // comp
        }
        return nodeId - netOffset;
    }

    let isNetNode = (nodeId: number) => nodeId < compOffset;

    // if we have reversed edges with maybe-enabled, then we know we can't resolve order staticly
    // for a tri-state wire, & has multiple srcs, all of its srcs should have maybeEnabled.
    // however, for all of its dests, maybeEnabled should be false (they may or may not have hasReverseEdge).
    interface IEdge {
        destNodeId: number;
        hasReverseEdge: boolean;
        maybeEnabled: boolean;
        decrTarget?: IDecrBlockTarget;
        portIdx?: number;
    }

    interface INode {
        nodeId: number;

        inDegree: number; // will be decremented as we resolve nodes/edges

        requiresOneOf?: number[];

        edges: IEdge[]; // outgoing edges
        blockIdx: number;

        /**  */
        blockResolveIdx?: number;

        upstreamBlockIdxs?: number[]; // incoming block edges

        upstreamOneOfDecrs?: IOneOfDecrs[];
    }

    interface IOneOfDecrs {
        srcNode: INode;
        srcEdge: IEdge;
        isEdgeDecrSrc: boolean; // otherwise block decr

        initialResolveCount: number; // always 1!
    }

    // console.log('nodeArrayLength', nodeArrayLength);
    let nodes: INode[] = makeArray(nodeArrayLength, 0).map(() => null!);
    let numExeNodes = 0;

    function makeNode(nodeId: number): INode {
        return { nodeId, edges: [], inDegree: 0, blockIdx: -1 };
    }

    // 1) Look at each component phase:
    //    - phases have a list of ports they write to
    for (let cId = 0; cId < comps.length; cId++) {
        let comp = comps[cId];
        for (let pIdx = 0; pIdx < comp.phases.length; pIdx++) {
            let phase = comp.phases[pIdx];
            let nodeId = compPhaseToNodeId(cId, pIdx);
            let node = nodes[nodeId] = makeNode(nodeId);
            // let afterPrevPhase = pIdx > 0;
            let hasNextPhase = pIdx < comp.phases.length - 1;

            // let linkedReadPortCount = phase.readPortIdxs.filter(i => comp.ports[i].netIdx >= 0).length;

            if (hasNextPhase) {
                let nextNodeId = compPhaseToNodeId(cId, pIdx + 1);
                node.edges.push({ destNodeId: nextNodeId, hasReverseEdge: false, maybeEnabled: false });
            }
            numExeNodes += 1;
            for (let portIdx of phase.writePortIdxs) { // write means the component is writing to the port (i.e. an output) [read0, read1] => [write0, write1]
                let port = comp.ports[portIdx];
                let net = nets[port.netIdx];
                if (!net) {
                    // console.log('comp', comp, 'port', port, 'has no net');
                    continue;
                }
                let netNodeId = netToNodeId(port.netIdx);
                node.edges.push({
                    destNodeId: netNodeId,
                    hasReverseEdge: phase.readPortIdxs.includes(portIdx),
                    maybeEnabled: false, // comps can always read from nets
                    portIdx,
                });
            }

            if (phase.requiresOnePortIdxs) {
                node.requiresOneOf = phase.requiresOnePortIdxs.map(a => netToNodeId(comp.ports[a].netIdx));
            }
        }
    }

    // 2) Look at each net:
    //    - nets have a list of component ports they write to, and a given port is part of a given component's phase
    for (let nId = 0; nId < nets.length; nId++) {
        let net = nets[nId];

        let netPhaseNodeId = netToNodeId(nId);
        let node = nodes[netPhaseNodeId] = makeNode(netPhaseNodeId);

        // iterate through all the destination components ports, and we'll add an edge from the net to the component's appropriate phase
        for (let input of net.dests) {

            let destComp = input.exeComp;
            let compReadPhaseIdx = destComp.phases.findIndex(p => p.readPortIdxs.includes(input.portIdx));
            if (compReadPhaseIdx >= 0) {
                let hasWrite = destComp.phases[compReadPhaseIdx].writePortIdxs.includes(input.portIdx);
                let outputNodeId = compPhaseToNodeId(input.exeComp.idx, compReadPhaseIdx);
                node.edges.push({
                    destNodeId: outputNodeId,
                    hasReverseEdge: hasWrite,
                    maybeEnabled: hasWrite,
                 });
            }
        }

        if (net.srcs.length > 1) {
            node.requiresOneOf = net.srcs.map(a => {
                let phaseIdx = a.exeComp.phases.findIndex(p => p.writePortIdxs.includes(a.portIdx));
                return compPhaseToNodeId(a.exeComp.idx, phaseIdx);
            });
        }
    }

    for (let node of nodes) {
        if (!node) {
            continue;
        }
        for (let edge of node.edges) {
            let destNode = nodes[edge.destNodeId];
            destNode.inDegree += 1;
        }
    }

    /*
        We have an issue! How do we figure out what each block depends on, so that we can run
        topo sort on them at runtime?

        So we're walking through nodes that have their in-degree down to 0. We encounter a node
        that has some inputs that have already been resolved, and look up their block index.

        Edges are always ports! (maybe)

        Since that edge needs to be resolved before we can execute the current block, we say that
        the current block depends on that block, and we can simply have a list of block indexes to
        decr when we have completed the current block (at runtime).

        What about if it's an optional-input? Say it's a bidirectional point. At runtime, it needs
        to resolve in one direction or the other.

        For our runtime topo model, we have:
          - tristate nets requiring 1 of n inputs to be resolved & output-enabled, or all n inputs
            to be resolved (will be a floating-wire error).
          - transmission gates requiring 1 of 2 inputs to be resolved & output-enabled.

        These are all at the node level, while simple edge deps can be done at the block level.

    */

    let crossGroupNodes = new Set<number>();
    let notVisited = new Set<number>();
    let queue: number[] = [];
    for (let node of nodes) {
        if (!node) {
            continue;
        }
        notVisited.add(node.nodeId);
        if (node.inDegree === 0) {
            queue.push(node.nodeId);
        }
    }

    interface IBlock {
        nodeOrder: number[];
        downstreamBlocks: Set<number>; // blocks that will always be executed after this block
        decrBlockTargets: IDecrBlockTarget[];
        initialResolves: number[];
    }

    let blocks: IBlock[] = [];

    let currBlock: IBlock = {
        nodeOrder: [],
        downstreamBlocks: new Set(),
        decrBlockTargets: [],
        initialResolves: [0],
    };
    let currBlockIdx = 0;


    // console.log('---- creating blocks!! ----');

    while (notVisited.size > 0) {

        if (queue.length === 0) {
            if (crossGroupNodes.size > 0) {
                let firstValue = crossGroupNodes.values().next().value;
                // console.log(`[adding first cross-group node] ${blocks.length}`, nodeIdToStr(firstValue));
                queue.push(firstValue);
            } else {
                let firstValue = notVisited.values().next().value;
                // console.log(`[adding first non-visited node] ${blocks.length}`, nodeIdToStr(firstValue));
                queue.push(firstValue);
            }

            // could in theory use any node, but that's not great. Want to maximize the size of blocks,
            // and minimize the number of blocks.

            // first, choose a node that's been seen over an edge
            // second, choose a node with a minimum of static unresolved inputs
            // e.g. a distributed AND gate, where one of the inputs is a tristate, and the other isn't
            //  - that will have a static unresolved in-degree of 1, so will be chosen after a tristate
            //    wire (which always has 0)
        }

        while (queue.length > 0) {
            let nodeId = queue.splice(0, 1)[0];
            let wasRemoved = notVisited.delete(nodeId);
            if (!wasRemoved) {
                // console.warn('node', nodeIdToStr(nodeId), 'was already visited');
                continue;
            }
            let node = nodes[nodeId];
            crossGroupNodes.delete(nodeId);
            currBlock.nodeOrder.push(nodeId);
            node.blockIdx = currBlockIdx;

            if (node.upstreamBlockIdxs) {
                // console.log('node', nodeIdToStr(nodeId), 'has upstream block ids:', node.upstreamBlockIdxs.map(a => a.toString()).join(', '));
                for (let upstreamBlockIdx of node.upstreamBlockIdxs) {
                    if (upstreamBlockIdx !== currBlockIdx) {
                        blocks[upstreamBlockIdx].downstreamBlocks.add(currBlockIdx);
                    }
                }
                node.upstreamBlockIdxs = undefined;
            }

            if (node.upstreamOneOfDecrs) {
                for (let oneOfDecrs of node.upstreamOneOfDecrs) {
                    let srcNode = oneOfDecrs.srcNode;
                    if (srcNode.blockIdx !== currBlockIdx) {
                        if (isNil(node.blockResolveIdx)) {
                            node.blockResolveIdx = currBlock.initialResolves.length;
                            currBlock.initialResolves.push(oneOfDecrs.initialResolveCount);
                        }
                        let decrTarget: IDecrBlockTarget = { blockIdx: currBlockIdx, counterIdx: node.blockResolveIdx };
                        if (oneOfDecrs.isEdgeDecrSrc) {
                            oneOfDecrs.srcEdge.decrTarget = decrTarget;
                        } else {
                            blocks[srcNode.blockIdx].decrBlockTargets.push(decrTarget);
                        }
                        // console.log('at node', nodeIdToStr(nodeId), ' _late_ adding decr target', decrTarget, 'from', srcNode.nodeId, nodeIdToStr(srcNode.nodeId), 'type=', oneOfDecrs.isEdgeDecrSrc ? 'edge' : 'block');
                    }
                }
            }

            // console.log('visiting node', nodeIdToStr(nodeId), 'with edges', node.edges.map(a => nodeIdToStr(a.destNodeId) + (a.hasReverseEdge ? '_REV' : '')).join(', '));

            for (let edge of node.edges) {
                let destNode = nodes[edge.destNodeId];
                let degree = destNode.inDegree -= 1;

                let destVisited = !notVisited.has(edge.destNodeId);
                if (!destVisited) {
                    if (edge.hasReverseEdge) {
                        // console.log('at', nodeIdToStr(nodeId), '& found node with reverse edge', nodeIdToStr(edge.destNodeId), 'adding to cross-group nodes');
                        crossGroupNodes.add(edge.destNodeId);
                    } else if (degree === 0) {
                        queue.push(edge.destNodeId);
                    }
                }

                let isRequiresOneOf = !!destNode.requiresOneOf?.includes(nodeId);

                if (!edge.hasReverseEdge && !isRequiresOneOf) {
                    if (degree > 0) {
                        // we're marking a potential block boundary, so deferring
                        // the block dep until we've gotten to that next node
                        let upstreamBlockIds = destNode.upstreamBlockIdxs ??= [];
                        if (!upstreamBlockIds.includes(currBlockIdx)) {
                            upstreamBlockIds.push(currBlockIdx);
                        }
                    } else if (destVisited) {
                        // if we're crossing a block boundary, to an already existing block
                        // and it's a simple edge, mark that block as downstream from this one
                        if (destNode.blockIdx !== currBlockIdx) {
                            currBlock.downstreamBlocks.add(destNode.blockIdx);
                        }
                    }

                }

                // [this] <?----> [other]
                // Note that the existence of a reverse edge is immaterial!
                // Potential 1:
                // [net] <?--PORT--> [compPhase]
                //   - here, if the compPhase lists this port as being "1 of n resolve required", then
                //   - thisBlock will decr the otherBlock at index x, where the index is maybe-appended to otherBlock
                //     and initially-stored on otherNode
                //   - i.e. this is a block-to-block dep, but the otherBlock index initial value is 1

                // Potential 2:
                // [compPhase] <?--PORT--> [net]
                //   - here, if the target net has multiple sources, i.e. "1 of n resolve required", then
                //   - thisEdge will decr the otherBlock at index x, where the index is maybe-appended to otherBlock
                //     and initially-stored on otherNode
                //   - i.e. this is an edge-to-block dep, but the otherBlock index initial value is 1

                if (isRequiresOneOf) {
                    let isEdgeDecrSrc = !isNetNode(nodeId);

                    if (!destVisited) {
                        let oneOfDecrs: IOneOfDecrs = {
                            srcNode: node,
                            srcEdge: edge,
                            isEdgeDecrSrc,
                            initialResolveCount: 1,
                        };
                        destNode.upstreamOneOfDecrs = destNode.upstreamOneOfDecrs ?? [];
                        destNode.upstreamOneOfDecrs.push(oneOfDecrs);
                    } else if (destNode.blockIdx !== currBlockIdx) {
                        let otherBlock = blocks[destNode.blockIdx];
                        if (isNil(destNode.blockResolveIdx)) {
                            destNode.blockResolveIdx = otherBlock.initialResolves.length;
                            otherBlock.initialResolves.push(1);
                        }
                        let decrTarget = { blockIdx: destNode.blockIdx, counterIdx: destNode.blockResolveIdx }
                        if (isEdgeDecrSrc) {
                            edge.decrTarget = decrTarget;
                        } else {
                            currBlock.decrBlockTargets.push(decrTarget);
                        }
                        // console.log('at node', nodeIdToStr(nodeId), 'adding decr target', decrTarget, 'to', nodeIdToStr(destNode.nodeId), 'type=', isEdgeDecrSrc ? 'edge' : 'block');
                    }
                }
            }
        }

        currBlock.downstreamBlocks.delete(currBlockIdx);
        blocks.push(currBlock);
        currBlockIdx += 1;

        if (notVisited.size > 0) {
            currBlock = {
                nodeOrder: [],
                downstreamBlocks: new Set(),
                decrBlockTargets: [],
                initialResolves: [0],
            };
        }
    }

    for (let block of blocks) {
        for (let targetBlockIdx of block.downstreamBlocks) {
            blocks[targetBlockIdx].initialResolves[0] += 1;
        }
    }

    let numPhasesRun: number[] = comps.map(_ => 0);

    // console.log('--- topoNodeOrder ---');
    // console.log('comps:', comps.map((c, i) => `${compPhaseToNodeId(i, 0)}: ${c.comp.name}`).join(', '));
    // console.log('nets:', nets.map((n, i) => `${netToNodeId(i)}: ${netToString(n, comps)}`).join(', '));
    // console.log('inDegree:', new Map(inDegree));
    // console.log('edges:', edges);

    function nodeIdToStr(nodeId: number) {
        let compPhase = nodeIdToCompPhaseIdx(nodeId);
        if (compPhase) {
            let { compIdx, phaseIdx } = compPhase;
            let comp = comps[compIdx];
            let name = comp.comp.id;
            let defId = comp.comp.defId;
            return `C:${name}(${defId})/${phaseIdx}`;
        }

        let netPhase = nodeIdToNetIdx(nodeId);
        if (netPhase) {
            let netIdx = netPhase;
            let net = nets[netIdx];
            return `N:${net.wire.id}`;
        }
    }

    // let relevantNetIdx = nets.find(a => a.wire.id === '0')?.idx ?? -1;

    // function isRelevantNode(nodeId: number) {
    //     let netPhase = nodeIdToNetIdx(nodeId);
    //     return netPhase && netPhase.netIdx === relevantNetIdx;
    // }

    // console.log('----- edges:');
    // for (let [srcNodeId, destNodeIds] of edges) {
    //     if (isRelevantNode(srcNodeId) || destNodeIds.some(a => isRelevantNode(a))) {
    //         let srcStr = nodeIdToStr(srcNodeId);
    //         let destStrs = destNodeIds.map(nodeIdToStr);
    //         console.log(`${srcStr}: ${destStrs.join(', ')}`);
    //     }
    // }
    // console.log('-----');
    // console.log('------ execution order ------');
    let exeBlocks: IExeBlock[] = [];
    let allLatchSteps: IExeStep[] = [];

    for (let block of blocks) {
        let executionSteps: IExeStep[] = [];
        let latchSteps: IExeStep[] = [];
        let exeBlockIdx = exeBlocks.length;

        for (let nodeId of block.nodeOrder) {
            let node = nodes[nodeId];
            let compPhase = nodeIdToCompPhaseIdx(nodeId);
            if (compPhase) {
                let { compIdx, phaseIdx } = compPhase;
                let comp = comps[compIdx];
                let phase = comp.phases[phaseIdx];
                let step: IExeStep = { compIdx, phaseIdx, netIdx: -1 };
                if (phase.isLatch) {
                    latchSteps.push(step);
                } else {
                    executionSteps.push(step);
                }
                phase.exeBlockIdx = exeBlockIdx;
                let hasDecrTargets = node.edges.some(a => a.decrTarget);
                phase.portsHaveDecrBlockTargets = hasDecrTargets;
                if (hasDecrTargets) {
                    for (let edge of node.edges) {
                        if (edge.decrTarget) {
                            let port = comp.ports[edge.portIdx!];
                            port.waitingBlockIdx = edge.decrTarget.blockIdx;
                            port.waitingCounterIdx = edge.decrTarget.counterIdx;
                            // console.log('port of block', exeBlockIdx, 'will decr', edge.decrTarget.blockIdx + ':' + edge.decrTarget.counterIdx);
                        }
                    }
                }
            } else {
                let netIdx = nodeIdToNetIdx(nodeId)!;
                let net = nets[netIdx];
                let step: IExeStep = { compIdx: -1, phaseIdx: 0, netIdx };
                executionSteps.push(step);
                net.exeBlockIdx = exeBlockIdx;
            }
        }

        allLatchSteps.push(...latchSteps);
        let blockIdx = exeBlocks.length;
        exeBlocks.push({
            enabled: true,
            executionSteps,
            resolvedInitial: block.initialResolves.slice(),
            resolvedRemaining: block.initialResolves.slice(),
            decrBlockTargets: [
                ...[...block.downstreamBlocks].map(a => ({ blockIdx: a, counterIdx: 0 })),
                ...block.decrBlockTargets,
            ],
            executed: false,
        });
        let exeBlock = exeBlocks[blockIdx];
        // console.log('exeBlock', blockIdx, 'has', exeBlock.resolvedInitial, 'initial counts, and will decr', exeBlock.decrBlockTargets.map(a => `${a.blockIdx}:${a.counterIdx}`));
    }

    // if (phaseStepCount !== numExeNodes) {
    //     console.log('detected a cycle; execution order may be incorrect: expected exe nodes', numExeNodes, 'got', phaseStepCount);
    //     console.log(comps, nets);
    // } else {
    //     // console.log('execution order:');
    // }

    // let compsToExecute = compExecutionOrder.map(i => comps[i].comp.name);
    // console.log('compsToExecute', compsToExecute);

    return { exeBlocks, latchSteps: allLatchSteps };
}

export function stepExecutionCombinatorial(exeModel: IExeSystem, disableBackProp = false) {
    // console.log('--- stepExecutionCombinatorial ---');
    exeModel.runArgs.halt = false;

    for (let comp of exeModel.comps) {
        for (let port of comp.ports) {
            if (hasFlag(port.type, PortType.Tristate)) {
                port.ioEnabled = false;
            }
        }
    }

    // We now have a new strategy for running the model:
    //  - we run each block in a stack order, like we would with a topo sort
    //  - after each comp phase, we check if any tristate outputs are enabled, and if so, we
    //    decr any target blocks, and if decr'd to 0, we add that block to the stack
    //  - given a tristate port, we need to know which block it's bound to so we can decr an index of it

    // After each tristate net is run, we need to decr all target blocks

    // OK, so nets can have the decr target on the exeNet, and comps can have the decr target on
    // the *exePort* (not the exeComp). exeNets might have multiple targets to decr, while exePorts
    // only have one (always going outward from the comp).

    let blocks = exeModel.executionBlocks;
    let blockStack: number[] = [];

    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i];
        for (let j = 0; j < block.resolvedInitial.length; j++) {
            block.resolvedRemaining[j] = block.resolvedInitial[j];
        }
        block.executed = false;

        addBlockIfReady(i);
    }

    // console.log('found blocks to execute:', blockStack);

    function addBlockIfReady(blockIdx: number) {
        let block = blocks[blockIdx];
        if (block.resolvedRemaining.length === 0 || block.resolvedRemaining.every(a => a === 0)) {
            // console.log('adding block to stack', blockIdx);
            blockStack.push(blockIdx);
        }
    }

    let blockOrder: number[] = [];

    while (blockStack.length > 0) {
        let blockIdx = blockStack.splice(0, 1)[0];
        let block = blocks[blockIdx];
        if (block.executed) {
            continue;
        }
        if (!disableBackProp) {
            blockOrder.push(blockIdx);
        }
        let exeSteps = block.executionSteps;
        // console.log(`[${blockIdx}] -- executing block -- `)

        for (let i = 0; i < exeSteps.length; i++) {
            let step = exeSteps[i];
            if (step.compIdx >= 0) {
                let exeComp = exeModel.comps[step.compIdx];
                let phase = exeComp.phases[step.phaseIdx];
                // console.log(`running comp ${comp.comp.name} phase ${step.phaseIdx}`);
                phase.func(exeComp, exeModel.runArgs);

                if (phase.portsHaveDecrBlockTargets) {
                    for (let portIdx of phase.writePortIdxs) {
                        let exePort = exeComp.ports[portIdx];
                        if ((!hasFlag(exePort.type, PortType.Tristate) || exePort.ioDir === IoDir.Out) && exePort.ioEnabled && exePort.waitingBlockIdx >= 0) {
                            let targetBlock = blocks[exePort.waitingBlockIdx];
                            let remAtIndex = targetBlock.resolvedRemaining[exePort.waitingCounterIdx] -= 1;
                            // console.log(`[${blockIdx}]`, '(from port) decrring block', exePort.waitingBlockIdx, 'counter', exePort.waitingCounterIdx, 'to', remAtIndex);
                            if (remAtIndex <= 0) { // quick check; addBlockIfReady will check all counters
                                addBlockIfReady(exePort.waitingBlockIdx);
                            }
                        }
                    }
                }

            } else {
                let net = exeModel.nets[step.netIdx];
                runNet(exeModel.comps, net);
            }
        }

        for (let target of block.decrBlockTargets) {
            let targetBlock = blocks[target.blockIdx];
            if (targetBlock.executed) {
                continue;
            }
            let remAtIndex = targetBlock.resolvedRemaining[target.counterIdx] -= 1;
            // console.log(`[${blockIdx}]`, '(from block) decrring block', target.blockIdx, 'counter', target.counterIdx, 'to', remAtIndex);
            if (remAtIndex <= 0) {
                addBlockIfReady(target.blockIdx);
            }
        }
    }

    // console.log('block order:', blockOrder);

    if (!disableBackProp) {
        backpropagateUnusedSignals(exeModel, blockOrder);
    }
}

export function stepExecutionLatch(exeModel: IExeSystem) {
    let latchSteps = exeModel.latchSteps;
    for (let i = 0; i < latchSteps.length; i++) {
        let step = latchSteps[i];
        let comp = exeModel.comps[step.compIdx];
        comp.phases[step.phaseIdx].func(comp, exeModel.runArgs);
    }
}

export function resetExeModel(exeModel: IExeSystem, opts: IResetOptions) {
    for (let comp of exeModel.comps) {
        let def = exeModel.compLibrary.getCompDef(comp.comp.defId)!;
        def.reset?.(comp, opts);
    }
}

export function netToString(net: IExeNet, exeComps: IExeComp[]) {
    let portStr = (portRef: IExePortRef) => {
        let exeComp = portRef.exeComp;
        let comp = portRef.comp;
        let exePort = portRef.exePort;
        let tristateStr = hasFlag(exePort.type, PortType.Tristate) ? '(ts)' : '';
        let portId = comp.ports[portRef.portIdx]?.id ?? '??';
        return `${exeComp.compFullId}:${portId}${tristateStr}`;
    };

    return `(${net.srcs.map(a => portStr(a)).join(', ')}) --> (${net.dests.map(a => portStr(a)).join(', ')})`;
}

export function runNet(comps: IExeComp[], net: IExeNet) {

    // let isPortLinkedNet = [...net.inputs, ...net.outputs].some(a => !a.comp.ports[a.exePort.portIdx]);

    // let isIoNet = net.inputs.some(a => net.outputs.some(b => a.exePort === b.exePort));

    if (net.tristate) {
        // need to ensure exactly 1 output is enabled
        let enabledCount = 0;
        let enabledPortValue = 0;
        let floatingPortValue = 0;
        let hasFloatingValue = false;
        for (let portRef of net.srcs) {
            let port = portRef.exePort;
            if (portRef.valid && port.ioEnabled && (!hasFlag(port.type, PortType.InOutTri) || port.ioDir === IoDir.Out)) {
                if (port.hasFloatingValue) {
                    hasFloatingValue = true;
                    floatingPortValue = port.value;
                } else {
                    enabledCount++;
                    enabledPortValue = port.value;
                }
            }
        }

        if (enabledCount === 0 && hasFloatingValue) {
            enabledCount = 1;
            enabledPortValue = floatingPortValue;
        }

        net.enabledCount = enabledCount;
        net.value = enabledCount === 1 ? enabledPortValue : net.value;
        /*
        if (enabledCount > 1) {
            // console.log('tristate', netToString(net, comps), 'has', enabledCount, 'enabled outputs:');
            for (let portRef of net.outputs) {
                let port = portRef.exePort;
                // let comp = comps[portRef.compIdx];
                // if (portRef.valid && port.ioEnabled && port.ioDir === IoDir.Out) {
                    // let portA = comp.comp.ports[portRef.portIdx];
                    // console.log(`  - port: ${portA.id}/${portA.name} on comp ${comp.comp.id}/${comp.comp.defId}`);
                // }
            }
        }
        */
       let isFloating = enabledCount === 0;
        for (let portRef of net.dests) {
            portRef.exePort.floating = isFloating;
            portRef.exePort.resolved = enabledCount === 1;
        }

        // if (net.wire.id === '0') {
        //     console.log("net value is", net.value.toString(16), net.value, 'and enabledCount is', enabledCount);
        // }

    } else {
        // has exactly 1 input
        if (net.srcs.length !== 1) {
            net.value = 0;
        } else {
            let port = net.srcs[0].exePort;
            net.value = port.value;
        }
    }

    // if (isIoNet) {
    //     console.log('reading from io net', netToString(net, comps), 'with value', net.value.toString(16), net.value);
    // }

    for (let portRef of net.dests) {
        portRef.exePort.value = net.value;
    }
    // if (isPortLinkedNet) {
    //     console.log('running net', netToString(net, comps), 'with value', net.value.toString(16), net.value);
    // }
}

export function backpropagateUnusedSignals(exeSystem: IExeSystem, blockOrder: number[]) {
    // this if for determining if we should render a wire as being active or not in the UI
    // e.g. if the output of a mux is not used, we want to mark its input wires as not active
    // either

    // essentially, if all output ports of a component are unused, then all input ports are also marked as unused
    // can do this for each phase to some degree.

    // not sure if we want to mess with the port.ioEnabled flags, or just have a separate flag for this
    // primarily because those flags are used in latching, say (actually, that doesn't matter)

    // OK, let's use ioEnabled, and set all inputs of a phase to false if all outputs are false
    for (let comp of exeSystem.comps) {
        for (let phase of comp.phases) {
            for (let portIdx of [...phase.readPortIdxs, ...phase.writePortIdxs]) {
                let port = comp.ports[portIdx];
                port.dataUsed = hasFlag(port.type, PortType.Ctrl) || port.ioEnabled;
            }
        }
    }

    // return;

    for (let i = blockOrder.length - 1; i >= 0; i--) {
        let block = exeSystem.executionBlocks[blockOrder[i]];

        for (let j = block.executionSteps.length - 1; j >= 0; j--) {
            let step = block.executionSteps[j];
            if (step.compIdx !== -1) {
                // examining a comp's execution step:
                //   - if all outputs are unused, mark all inputs as unused

                let comp = exeSystem.comps[step.compIdx];
                let phase = comp.phases[step.phaseIdx];

                let allOutputsUnused = phase.writePortIdxs.length > 0;
                for (let portIdx of phase.writePortIdxs) {
                    let port = comp.ports[portIdx];
                    if (port.dataUsed) {
                        allOutputsUnused = false;
                        break;
                    }
                }
                for (let portIdx of [...phase.readPortIdxs, ...phase.writePortIdxs]) { // special case for multi-directional ports
                    let port = comp.ports[portIdx];
                    if (hasFlag(port.type, PortType.InOutTri) && port.ioDir !== IoDir.None) {
                        allOutputsUnused = false;
                        break;
                    }
                }

                if (allOutputsUnused) {
                    for (let portIdx of phase.readPortIdxs) {
                        let port = comp.ports[portIdx];
                        port.dataUsed = false;
                    }
                }

            } else if (step.netIdx !== -1) {
                let net = exeSystem.nets[step.netIdx];
                let allOutputsUnused = true;
                for (let portRef of net.dests) {
                    if (portRef.exePort.dataUsed && !portRef.nestedPort) {
                        allOutputsUnused = false;
                        break;
                    }
                }

                if (allOutputsUnused) {
                    // console.log('marking net as unused', netToString(net, exeSystem.comps));
                    for (let portRef of net.srcs) {
                        let exePort = portRef.exePort;
                        exePort.dataUsed = false;
                        let nestedPort = exePort.nestedPort;
                        if (nestedPort) {
                            nestedPort.exePort.dataUsed = false;
                        }
                    }
                }
            }
        }
    }

    for (let step of exeSystem.latchSteps) {
        if (step.compIdx !== -1) {
            let comp = exeSystem.comps[step.compIdx];
            let phase = comp.phases[step.phaseIdx];

            /* Latch steps have inputs that control whether the any data is used.
                This is a bit hacky, probably should use another field name for latchSteps?

                Anyway, since latches always depend on these as inputs, they'll always be marked as used
            */

            for (let portIdx of phase.readPortIdxs) {
                let port = comp.ports[portIdx];
                port.dataUsed = true;

                let net = exeSystem.nets[port.netIdx];
                if (net) {
                    for (let portRef of net.srcs) {
                        portRef.exePort.dataUsed = true;
                    }
                }
            }
        }
    }

}
