import { getOrAddToMap, hasFlag, isNotNil } from "../utils/data";
import { CompLibrary } from "./comps/CompBuilder";
import { PortDir, ICpuLayout, IExeComp, IExeNet, IExePortRef, IExeSystem, RefType } from "./CpuModel";

export function createExecutionModel(compLibrary: CompLibrary, displayModel: ICpuLayout): IExeSystem {

    let connectedCompIds = new Set<string>();
    let connectedNetIds = new Set<string>();

    for (let wire of displayModel.wires) {
        let hasRef = false;
        for (let node of wire.nodes) {
            if (node.ref?.type === RefType.CompNode) {
                connectedCompIds.add(node.ref.id);
                hasRef = true;
            }
        }
        if (hasRef) {
            connectedNetIds.add(wire.id);
        }
    }
    let connectedComps = displayModel.comps.filter(c => connectedCompIds.has(c.id));
    let connectedWires = displayModel.wires.filter(w => connectedNetIds.has(w.id));

    let compIdToIdx = new Map<string, number>();
    for (let i = 0; i < connectedComps.length; i++) {
        compIdToIdx.set(connectedComps[i].id, i);
    }

    let comps: IExeComp[] = [];

    let nets: IExeNet[] = [];

    for (let wire of connectedWires) {
        let refs = wire.nodes.map(n => n.ref).filter(isNotNil);

        let inputs: IExePortRef[] = [];
        let outputs: IExePortRef[] = [];
        for (let ref of refs) {
            const comp = connectedComps[compIdToIdx.get(ref.id)!];
            if (!comp) {
                continue;
            }
            for (let nodeIdx = 0; nodeIdx < comp.ports.length; nodeIdx++) {
                const node = comp.ports[nodeIdx];
                if (node.id === ref.compNodeId) {
                    if (node.type === PortDir.In) {
                        inputs.push({ compIdx: compIdToIdx.get(comp.id)!, portIdx: nodeIdx });
                    } else {
                        outputs.push({ compIdx: compIdToIdx.get(comp.id)!, portIdx: nodeIdx });
                    }
                    break;
                }
            }
        }

        let net: IExeNet = {
            width: 1,
            wire,
            tristate: false,
            inputs: inputs,
            outputs: outputs,
            value: 0,
            enabledCount: 0,
        };

        nets.push(net);
    }

    for (let comp of connectedComps) {
        comps.push(compLibrary.build(comp));
    }

    for (let netIdx = 0; netIdx < nets.length; netIdx++) {
        let net = nets[netIdx];
        for (let portRef of [...net.inputs, ...net.outputs]) {
            let comp = comps[portRef.compIdx];
            let port = comp.ports[portRef.portIdx];
            port.netIdx = netIdx;
            if (hasFlag(port.type, PortDir.Tristate)) {
                net.tristate = true;
            }
        }
    }

    let compExecutionOrder = calcCompExecutionOrder(comps, nets);

    return { comps, nets, compExecutionOrder, lookup: createLookupTable(comps, nets) };
}

export function createLookupTable(comps: IExeComp[], nets: IExeNet[]) {
    let compIdToIdx = new Map<string, number>();
    for (let i = 0; i < comps.length; i++) {
        compIdToIdx.set(comps[i].comp.id, i);
    }

    let netIdToIdx = new Map<string, number>();
    for (let i = 0; i < nets.length; i++) {
        netIdToIdx.set(nets[i].wire.id, i);
    }

    return { compIdToIdx, netIdToIdx };
}

export function calcCompExecutionOrder(comps: IExeComp[], nets: IExeNet[]): number[] {

    // tristate nets can only propagate once all comps have completed, so consider them as nodes
    // in the graph as well (do this with all nets for simplicity)
    let numComps = comps.length + nets.length;

    let inDegree = new Map<number, number>();

    let compPhaseToNodeId = (compIdx: number, phaseIdx: number) => {
        return compIdx + phaseIdx * numComps;
    };

    let netToNodeId = (netIdx: number) => {
        return comps.length + netIdx;
    };

    let nodeIdToCompPhaseIdx = (nodeId: number) => {
        if (nodeId >= comps.length && nodeId < numComps) {
            return null; // net
        }

        return {
            compIdx: nodeId % numComps,
            phaseIdx: Math.floor(nodeId / numComps),
        };
    };

    let nodeIdToNetIdx = (nodeId: number) => {
        if (nodeId < comps.length || nodeId >= numComps) {
            return null; // comp
        }
        return nodeId - comps.length;
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
            for (let portIdx of phase.writePortIdxs) {
                let port = comp.ports[portIdx];
                let net = nets[port.netIdx];
                if (!net) {
                    continue;
                }
                let netNodeId = netToNodeId(port.netIdx);
                nodeEdges.push(netNodeId);
            }
        }
    }

    for (let nId = 0; nId < nets.length; nId++) {
        let net = nets[nId];
        let netNodeId = netToNodeId(nId);
        inDegree.set(netNodeId, 0);
        let nodeEdges = getOrAddToMap(edges, netNodeId, () => []);

        for (let input of net.inputs) {
            let destComp = comps[input.compIdx];
            let destPhaseIdx = destComp.phases.findIndex(p => p.readPortIdxs.includes(input.portIdx));
            if (destPhaseIdx >= 0) {
                let outputNodeId = compPhaseToNodeId(input.compIdx, destPhaseIdx);
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

    let compExecutionOrder: number[] = [];
    // console.log('--- topoNodeOrder ---');
    // console.log('comps:', comps.map((c, i) => `${compPhaseToNodeId(i, 0)}: ${c.comp.name}`).join(', '));
    // console.log('nets:', nets.map((n, i) => `${netToNodeId(i)}: ${netToString(n, comps)}`).join(', '));
    // console.log('inDegree:', new Map(inDegree));
    // console.log('edges:', edges);

    for (let nodeId of topoNodeOrder) {
        let compPhase = nodeIdToCompPhaseIdx(nodeId);
        if (!compPhase) {
            let netIdx = nodeIdToNetIdx(nodeId)!;
            // console.log('found net', nodeId, netToString(nets[netIdx], comps));
            continue;
        }
        // console.log('found comp', nodeId, 'compPhase', compPhase, 'comp', comps[compPhase.compIdx].comp.name, `(${compPhase.phaseIdx+1}/${comps[compPhase.compIdx].phases.length})`);
        let { compIdx, phaseIdx } = compPhase;
        if (phaseIdx !== numPhasesRun[compIdx]) {
            console.log('detected an incorrectly ordered phase; execution order may be incorrect');
        }
        numPhasesRun[compIdx] = phaseIdx + 1;
        compExecutionOrder.push(compIdx);
    }

    if (compExecutionOrder.length !== numExeNodes) {
        console.log('detected a cycle; execution order may be incorrect: expected exe nodes', numExeNodes, 'got', compExecutionOrder.length);
        console.log(comps, nets);
    } else {
        // console.log('execution order:');
    }

    // let compsToExecute = compExecutionOrder.map(i => comps[i].comp.name);
    // console.log('compsToExecute', compsToExecute);

    return compExecutionOrder;
}

function netToString(net: IExeNet, comps: IExeComp[]) {
    let portStr = (portRef: IExePortRef) => {
        let comp = comps[portRef.compIdx];
        let port = comp.ports[portRef.portIdx];
        let tristateStr = hasFlag(port.type, PortDir.Tristate) ? '(ts)' : '';
        let portId = comp.comp.ports[portRef.portIdx].id;
        return `${comp.comp.id}.${portId}${tristateStr}`;
    };

    return `(${net.outputs.map(a => portStr(a)).join(', ')}) -> (${net.inputs.map(a => portStr(a)).join(', ')})`;
}
