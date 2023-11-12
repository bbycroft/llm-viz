import { getOrAddToMap, hasFlag, isNotNil } from "../utils/data";
import { CompLibrary, IResetOptions } from "./comps/CompBuilder";
import { compPortDefId, ICompPortConfig, ICompPortData } from "./comps/CompPort";
import { PortType, IEditSnapshot, IExeComp, IExeNet, IExePortRef, IExeSystem, RefType, IExeStep, IExeSystemLookup, IElRef, IoDir, IExePort, ISchematic, IComp, IEditorState } from "./CpuModel";
import { ISharedContext } from "./library/SharedContext";
import { getCompSubSchematic, getCompSubSchematicForSnapshot } from "./SubSchematics";

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

*/

export function createExecutionModel(sharedContext: ISharedContext, displayModel: IEditSnapshot, existingSystem: IExeSystem | null): IExeSystem {

    let exeSystem: IExeSystem = {
        compLibrary: sharedContext.compLibrary,
        comps: [],
        nets: [],
        executionSteps: [],
        latchSteps: [],
        lookup: { compIdToIdx: new Map(), wireIdToNetIdx: new Map() },
        runArgs: { halt: false },
    };

    populateExecutionModel(sharedContext, displayModel, exeSystem, displayModel.mainSchematic, '', existingSystem);

    let executionOrder = calcCompExecutionOrder(exeSystem.comps, exeSystem.nets);

    exeSystem.executionSteps = executionOrder.executionSteps;
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
                let nestedExeComp = nestedPortComps[portIdx];
                if (nestedExeComp) {
                    nestedExeComp.data.externalPortBound = true;

                    let nestedPort = nestedExeComp.ports[1];
                    nestedPort.netIdx = netIdx;
                    let portRef: IExePortRef = {
                        comp: nestedExeComp.comp,
                        portIdx: 1,
                        exeComp: nestedExeComp,
                        exePort: nestedPort,
                        valid: true,
                    }
                    if (hasFlag(exePort.type, PortType.In)) {
                        dests.push(portRef);
                    }
                    if (hasFlag(exePort.type, PortType.Out)) {
                        srcs.push(portRef);
                        bindOutPort = false;
                    }
                }
            }

            if (hasFlag(exePort.type, PortType.In)) {
                dests.push({ comp, portIdx, exeComp, exePort, valid: true });
            }
            if (hasFlag(exePort.type, PortType.Out) && bindOutPort) {
                srcs.push({ comp, portIdx, exeComp, exePort, valid: true });
            }

            if (hasFlag(exePort.type, PortType.Tristate)) {
                tristate = true;
            }
            width = exePort.width;
            type |= exePort.type;
        }

        let wireFullId = subTreePrefix + wire.id;

        let net: IExeNet = {
            idx: netIdx,
            width: width,
            wireFullId,
            wire,
            tristate,
            inputs: dests,
            outputs: srcs,
            value: 0,
            enabledCount: 0,
            type: type,
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

export function calcCompExecutionOrder(comps: IExeComp[], nets: IExeNet[]): { executionSteps: IExeStep[], latchSteps: IExeStep[] } {

    // tristate nets can only propagate once all comps have completed, so consider them as nodes
    // in the graph as well (do this with all nets for simplicity)
    let numComps = comps.length + nets.length;

    let inDegree = new Map<number, number>();

    let compPhaseToNodeId = (compIdx: number, phaseIdx: number) => {
        return compIdx + phaseIdx * numComps;
    };

    let netToNodeId = (netIdx: number, phaseIdx: number) => {
        return comps.length + netIdx + phaseIdx * numComps;
    };

    let nodeIdToCompPhaseIdx = (nodeId: number) => {
        let compIdx = nodeId % numComps;
        if (compIdx >= comps.length) {
            return null; // net
        }

        return {
            compIdx: compIdx,
            phaseIdx: Math.floor(nodeId / numComps),
        };
    };

    let nodeIdToNetIdx = (nodeId: number) => {
        let compIdx = nodeId % numComps;
        if (compIdx < comps.length) {
            return null; // comp
        }
        return {
            netIdx: compIdx - comps.length,
            phaseIdx: Math.floor(nodeId / numComps),
        };
    }

    // usually have 1 phase per net, but can have more if a net is bidirectional (a port has both in and out)
    let netNumPhases = new Map<number, number>();

    // calc num phases for each net
    for (let netIdx = 0; netIdx < nets.length; netIdx++) {
        let net = nets[netIdx];
        let numPhases = 1;
        for (let input of net.inputs) {
            if ((input.exePort.type & PortType.InOutTri) === PortType.InOutTri) {
                numPhases = 2;
            }
        }
        netNumPhases.set(netIdx, numPhases);
    }

    let topoNodeOrder: number[] = [];
    let edges = new Map<number, number[]>();
    let numExeNodes = 0;

    for (let cId = 0; cId < comps.length; cId++) {
        let comp = comps[cId];
        for (let pIdx = 0; pIdx < comp.phases.length; pIdx++) {
            let phase = comp.phases[pIdx];
            let nodeId = compPhaseToNodeId(cId, pIdx);
            // let afterPrevPhase = pIdx > 0;
            let hasNextPhase = pIdx < comp.phases.length - 1;

            // let linkedReadPortCount = phase.readPortIdxs.filter(i => comp.ports[i].netIdx >= 0).length;

            inDegree.set(nodeId, 0);
            let nodeEdges = getOrAddToMap(edges, nodeId, () => []);
            if (hasNextPhase) {
                let nextNodeId = compPhaseToNodeId(cId, pIdx + 1);
                nodeEdges.push(nextNodeId);
            }
            numExeNodes += 1;
            for (let portIdx of phase.writePortIdxs) { // write means the component is writing to the port (i.e. an output) [read0, read1] => [write0, write1]
                let port = comp.ports[portIdx];
                let net = nets[port.netIdx];
                if (!net) {
                    // console.log('comp', comp, 'port', port, 'has no net');
                    continue;
                }
                let netPhaseCount = netNumPhases.get(port.netIdx)!;
                let netPhaseId = 0;
                if (netPhaseCount > 1 && hasFlag(port.type, PortType.InOutTri)) {
                    netPhaseId = calculatePhaseId(port, comp, pIdx);
                }
                let netNodeId = netToNodeId(port.netIdx, netPhaseId);
                nodeEdges.push(netNodeId);
            }
        }
    }

    function calculatePhaseId(port: IExePort, comp: IExeComp, phaseIdx: number): number {
        for (let prevPhaseIdx = 0; prevPhaseIdx <= phaseIdx; prevPhaseIdx++) {
            let prevPhase = comp.phases[prevPhaseIdx];
            if (prevPhase.readPortIdxs.includes(port.portIdx)) {
                return 1;
            }
        }
        return 0;
    }

    let portOrderings = new Map<string, { srcNetIds: number[], destNetIds: number[] }>();

    for (let nId = 0; nId < nets.length; nId++) {
        let net = nets[nId];
        let numPhases = netNumPhases.get(nId)!;

        for (let nPId = 0; nPId < numPhases; nPId++) {

            let netNodeId = netToNodeId(nId, nPId);
            inDegree.set(netNodeId, 0);
            let nodeEdges = getOrAddToMap(edges, netNodeId, () => []);

            for (let input of net.inputs) {

                let destComp = input.exeComp;
                let readPhaseIdx = destComp.phases.findIndex(p => p.readPortIdxs.includes(input.portIdx));
                let writePortIdx = destComp.phases.findIndex(p => p.writePortIdxs.includes(input.portIdx));
                if (readPhaseIdx < 0) {
                    continue;
                }

                if (numPhases > 0 && writePortIdx >= 0) {
                    let includeInPhase = (nPId > 0) !== (writePortIdx >= readPhaseIdx);
                    if (!includeInPhase) {
                        continue;
                    }
                }

                let outputNodeId = compPhaseToNodeId(input.exeComp.idx, readPhaseIdx);
                nodeEdges.push(outputNodeId);
            }
        }
    }

    for (let [, destIds] of edges) {
        for (let destId of destIds) {
            let deg = inDegree.get(destId) ?? 0;
            inDegree.set(destId, deg + 1);
        }
    }

    // console.log('inDegreeOriginal:', new Map(inDegree));

    let queue: number[] = [];
    for (let [nodeId, degree] of inDegree) {
        if (degree === 0) {
            queue.push(nodeId);
        }
    }

    while (queue.length > 0) {
        let nodeId = queue.splice(0, 1)[0];
        topoNodeOrder.push(nodeId);
        let nodeEdges = edges.get(nodeId);
        if (nodeEdges) {
            for (let destNodeId of nodeEdges) {
                let degree = inDegree.get(destNodeId)!;
                degree--;
                inDegree.set(destNodeId, degree);
                if (degree === 0) {
                    queue.push(destNodeId);
                }
            }
        }
    }

    let numPhasesRun: number[] = comps.map(_ => 0);

    let executionSteps: IExeStep[] = [];
    let latchSteps: IExeStep[] = [];
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
            let { netIdx, phaseIdx } = netPhase;
            let net = nets[netIdx];
            return `N:${net.wire.id}/${phaseIdx}`;
        }
    }

    // console.log('----- edges:');
    // for (let [srcNodeId, destNodeIds] of edges) {
    //     let srcStr = nodeIdToStr(srcNodeId);
    //     let destStrs = destNodeIds.map(nodeIdToStr);
    //     console.log(`${srcStr}: ${destStrs.join(', ')}`);
    // }
    // console.log('-----');
    // console.log('------ execution order ------');

    for (let nodeId of topoNodeOrder) {
        let compPhase = nodeIdToCompPhaseIdx(nodeId);
        if (compPhase) {
            let { compIdx, phaseIdx } = compPhase;
            // if (phaseIdx !== numPhasesRun[compIdx]) {
            //     console.log('detected an incorrectly ordered phase; execution order may be incorrect');
            // }
            numPhasesRun[compIdx] = phaseIdx + 1;

            let comp = comps[compIdx];
            let phase = comp.phases[phaseIdx];

            // if (!phase.isLatch) {
            //     console.log('found comp', comp.compFullId, 'compPhase', compPhase, `(nId=${nodeId})`, 'comp', comp.comp.name, `(${compPhase.phaseIdx+1}/${comp.phases.length})`);
            // }

            let step: IExeStep = {
                compIdx,
                phaseIdx,
                netIdx: -1,
            };
            if (phase.isLatch) {
                latchSteps.push(step);
            } else {
                executionSteps.push(step);
            }
        } else {
            let { netIdx, phaseIdx } = nodeIdToNetIdx(nodeId)!;
            // let net = nets[netIdx];
            // console.log('found net', net.wireFullId, 'with phase', phaseIdx,  `(nId=${nodeId})`, netToString(nets[netIdx], comps));

            let step: IExeStep = {
                compIdx: -1,
                phaseIdx,
                netIdx,
            };
            executionSteps.push(step);
        }

    }

    let phaseStepCount = [...executionSteps, ...latchSteps].filter(a => a.compIdx >= 0).length;

    if (phaseStepCount !== numExeNodes) {
        console.log('detected a cycle; execution order may be incorrect: expected exe nodes', numExeNodes, 'got', phaseStepCount);
        console.log(comps, nets);
    } else {
        // console.log('execution order:');
    }

    // let compsToExecute = compExecutionOrder.map(i => comps[i].comp.name);
    // console.log('compsToExecute', compsToExecute);

    return { executionSteps, latchSteps };
}

export function stepExecutionCombinatorial(exeModel: IExeSystem, disableBackProp = false) {
    let exeSteps = exeModel.executionSteps;
    exeModel.runArgs.halt = false;

    for (let comp of exeModel.comps) {
        for (let port of comp.ports) {
            if (hasFlag(port.type, PortType.Tristate)) {
                port.ioEnabled = false;
            }
        }
    }

    for (let i = 0; i < exeSteps.length; i++) {
        let step = exeSteps[i];
        if (step.compIdx >= 0) {
            let comp = exeModel.comps[step.compIdx];
            // console.log(`running comp ${comp.comp.name} phase ${step.phaseIdx}`);
            comp.phases[step.phaseIdx].func(comp, exeModel.runArgs);
        } else {
            let net = exeModel.nets[step.netIdx];
            runNet(exeModel.comps, net);
        }
    }

    if (!disableBackProp) {
        backpropagateUnusedSignals(exeModel);
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
        return `${exeComp.compFullId}.${portId}${tristateStr}`;
    };

    return `(${net.outputs.map(a => portStr(a)).join(', ')}) --> (${net.inputs.map(a => portStr(a)).join(', ')})`;
}

export function runNet(comps: IExeComp[], net: IExeNet) {

    // let isPortLinkedNet = [...net.inputs, ...net.outputs].some(a => !a.comp.ports[a.exePort.portIdx]);

    // let isIoNet = net.inputs.some(a => net.outputs.some(b => a.exePort === b.exePort));

    if (net.tristate) {
        // need to ensure exactly 1 output is enabled
        let enabledCount = 0;
        let enabledPortValue = 0;
        for (let portRef of net.outputs) {
            let port = portRef.exePort;
            if (portRef.valid && port.ioEnabled && (!hasFlag(port.type, PortType.InOutTri) || port.ioDir === IoDir.Out)) {
                enabledCount++;
                enabledPortValue = port.value;
            }
        }
        net.enabledCount = enabledCount;
        net.value = enabledCount === 1 ? enabledPortValue : 0;
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
    } else {
        // has exactly 1 input
        if (net.outputs.length !== 1) {
            net.value = 0;
        } else {
            let port = net.outputs[0].exePort;
            net.value = port.value;
        }
    }

    // if (isIoNet) {
    //     console.log('reading from io net', netToString(net, comps), 'with value', net.value.toString(16), net.value);
    // }

    for (let portRef of net.inputs) {
        portRef.exePort.value = net.value;
    }

    // if (isPortLinkedNet) {
    //     console.log('running net', netToString(net, comps), 'with value', net.value.toString(16), net.value);
    // }
}

export function backpropagateUnusedSignals(exeSystem: IExeSystem) {
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

    for (let i = exeSystem.executionSteps.length - 1; i >= 0; i--) {
        let step = exeSystem.executionSteps[i];
        if (step.compIdx !== -1) {
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
                // let writePorts = phase.writePortIdxs.map(i => comp.comp.ports[i].id);
                // let readPorts = phase.readPortIdxs.map(i => comp.comp.ports[i].id);
                // console.log('marking ports as unused', comp.comp.defId, step.phaseIdx, writePorts, ' => ', readPorts);
                for (let portIdx of phase.readPortIdxs) {
                    let port = comp.ports[portIdx];
                    if (!hasFlag(port.type, PortType.Ctrl)) {
                        port.dataUsed = false;
                    }
                }
            }


        } else if (step.netIdx !== -1) {
            let net = exeSystem.nets[step.netIdx];
            if (hasFlag(net.type, PortType.Ctrl)) {
                continue;
            }
            let allOutputsUnused = true;
            for (let portRef of net.inputs) {
                if (portRef.exePort.dataUsed) {
                    allOutputsUnused = false;
                    break;
                }
            }

            if (allOutputsUnused) {
                // console.log('marking net as unused', netToString(net, exeSystem.comps));
                for (let portRef of net.outputs) {
                    portRef.exePort.dataUsed = false;
                }
            }
        }
    }

}
