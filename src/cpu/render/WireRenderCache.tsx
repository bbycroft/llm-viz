import { hasFlag } from "../../utils/data";
import { IComp, ICompPort, IEditorState, IElRef, IExeNet, IExePort, IExeSystem, IHitTest, IWireGraph, IWirePortBinding, IWireRenderCache, IWireRenderInfo, IoDir, PortType, RefType  } from "../CpuModel";
import { compPortDefId, compPortExternalPortId, ICompPortConfig } from "../comps/CompPort";

export class WireRenderCache implements IWireRenderCache {
    selected: IElRef[] = [];
    exeSystem: IExeSystem | null = null;
    exeSystemCntr = -1;
    prevHoveredWireId: string | null = null;

    wireCache = new Map<string, IWireRenderCacheItem>();

    // This might not be a good idea, since caching is likely to not work properly
    compPortCache = new Map<string, { wire: IWireRenderInfo, nodeId: string }>();

    lookupCompPort(editorState: IEditorState, idPrefix: string, comp: IComp<any>, portId: number): [wire: IWireRenderInfo, nodeId: number] | null {
        // need to think about how we do this. Maybe not part of WireRenderCache? Still want a way of looking up the IWireRenderInfo + nodeId for a given comp port.
        // actually just need to find the right wire, and then can query the portBindings map with the compId/portId
        return null;
    }

    lookupWire(editorState: IEditorState, idPrefix: string, wire: IWireGraph): IWireRenderInfo {
        // Do full-clear if some of the global things have changed.
        // Could potentially be more fine-grained (moving to cache-items), but this is fine for now.
        if (editorState.snapshot.selected !== this.selected || this.exeSystemCntr !== editorState.exeModelUpdateCntr || this.exeSystem !== editorState.exeModel) {
            this.wireCache.clear();

            this.selected = editorState.snapshot.selected;
            this.exeSystemCntr = editorState.exeModelUpdateCntr;
            this.exeSystem = editorState.exeModel;
        }

        let hoveredRef = editorState.hovered?.ref;
        let hoveredWireId = hoveredRef?.type === RefType.WireSeg || hoveredRef?.type === RefType.WireNode ? hoveredRef.id : null;
        if (hoveredWireId !== this.prevHoveredWireId) {
            this.wireCache.delete(this.prevHoveredWireId || '');
            this.wireCache.delete(hoveredWireId || '');
            this.prevHoveredWireId = hoveredWireId;
        }

        let fullWireId = idPrefix + wire.id;
        let existing = this.wireCache.get(fullWireId);

        if (!existing || existing.wire !== wire) {
            let renderInfo = createWireRenderInfo(editorState, wire, fullWireId);
            existing = { wire, renderInfo };
            this.wireCache.set(fullWireId, existing);
        }

        return existing.renderInfo;
    }
}

interface IWireRenderCacheItem {
    wire: IWireGraph;
    renderInfo: IWireRenderInfo;
}


function createWireRenderInfo(editorState: IEditorState, wire: IWireGraph, fullWireId: string): IWireRenderInfo {
    let exeNet: IExeNet | null = null;

    if (editorState.exeModel) {
        let netIdx = editorState.exeModel.lookup.wireIdToNetIdx.get(fullWireId) ?? -1;
        exeNet = editorState.exeModel.nets[netIdx] || null;
    }

    let isCtrl = false;
    let isData = false;
    let isAddr = false;

    interface IPortBinding {
        comp: IComp;
        port: ICompPort;
        exePort: IExePort;
        nodeId: number;
    }

    let isNonZero = false;
    let portBindings = new Map<string, IWirePortBinding>();
    let flowSegs = new Set<string>(); // the direction of flow is given by id0 -> id1 in "id0:id1"
    let flowNodes = new Set<number>();
    let segKey = (id0: number, id1: number) => `${id0}:${id1}`;
    let compPortKey = (compId: string, portId: string) => `${compId}:${portId}`; // the schematic-local comp id (i.e. comp.id)
    // data coming into the wire
    let activeSrcNodeCount = 0;

    // data going out of the wire
    let activeDestNodeCount = 0;

    // check if the wire is actually connected to any comp inputs
    let srcNodeCount = 0;
    let destNodeCount = 0;

    if (exeNet) {
        isNonZero = exeNet.value !== 0;

        for (let exePortRef of [...exeNet.dests, ...exeNet.srcs]) {
            let exeComp = exePortRef.exeComp;
            let exePort = exePortRef.exePort;
            let comp = exeComp.comp;
            let port = comp.ports[exePort.portIdx];

            if (!port) {
                continue;
            }

            let compId = exeComp.comp.id;
            let portId = port.id;

            // need to get the external port from the comp
            if (comp.defId === compPortDefId && port.id === compPortExternalPortId) {
                portId = (comp.args as ICompPortConfig).portId;
                let compFullId = exeComp.compFullId;
                let lastIdx = compFullId.lastIndexOf('|');
                let firstIdx = compFullId.lastIndexOf('|', lastIdx - 1);
                compId = compFullId.substring(firstIdx + 1, lastIdx);
            }

            // Note that the key here is what the wire reports as connecting to, not necessarily the actual port/comp objects.
            // In the case of going to internal ports, the comp/port objects are the internal CompPort, but the wire ref is the external port.
            portBindings.set(compPortKey(compId, portId), {
                comp: comp,
                port: comp.ports[exePort.portIdx],
                exePort: exePort,
                nodeId: -1,
            });
        }

        let nodeIdToPortBinding = new Map<number, IPortBinding>();

        for (let node of wire.nodes) {
            if (node.ref?.type === RefType.CompNode) {
                let portBinding = portBindings.get(compPortKey(node.ref.id, node.ref.compNodeId!));
                if (portBinding) {
                    let port = portBinding.port;
                    if (hasFlag(port.type, PortType.Ctrl)) {
                        isCtrl = true;
                    }
                    if (hasFlag(port.type, PortType.Data)) {
                        isData = true;
                    }
                    if (hasFlag(port.type, PortType.Addr)) {
                        isAddr = true;
                    }
                    nodeIdToPortBinding.set(node.id, portBinding);
                    portBinding.nodeId = node.id;
                }
            }
        }

        // should only be one active src node! multiple imply some failure, and should probably be rendered specially in some way
        // - what about no active src nodes? That's not helpful since this is about dataUsed rather than ioEnabled.
        let srcNodeIds: number[] = [];
        let destNodeIds: number[] = [];

        for (let binding of nodeIdToPortBinding.values()) {
            if (hasFlag(binding.port.type, PortType.In) && binding.exePort.ioDir !== IoDir.Out && binding.exePort.dataUsed) {
                destNodeIds.push(binding.nodeId);
            }
            if (hasFlag(binding.port.type, PortType.Out) && binding.exePort.ioDir !== IoDir.In && binding.exePort.dataUsed) {
                srcNodeIds.push(binding.nodeId);
            }

            if (hasFlag(binding.port.type, PortType.Out)) {
                srcNodeCount++;
            }

            if (hasFlag(binding.port.type, PortType.In)) {
                destNodeCount++;
            }
        }

        // now walk the wire graph from the destNodeIds to all the srcNodeIds (shortest paths)
        // and mark those segments as flow segments

        for (let destNodeId of destNodeIds) {
            let visited = new Set<number>();
            let prevNodeId = new Map<number, number>();
            let queue = [destNodeId];

            while (queue.length > 0) {
                let nodeId = queue.shift()!;
                if (visited.has(nodeId)) {
                    continue;
                }
                visited.add(nodeId);

                let node = wire.nodes[nodeId];
                for (let nextNodeId of node.edges) {
                    let node1 = wire.nodes[nextNodeId];
                    if (visited.has(node1.id)) {
                        continue;
                    }
                    prevNodeId.set(node1.id, nodeId);
                    queue.push(node1.id);
                }
            }

            for (let srcNodeId of srcNodeIds) {
                let nodeId = srcNodeId;
                flowNodes.add(nodeId);
                while (nodeId !== destNodeId) {
                    let prevId = prevNodeId.get(nodeId);
                    if (prevId === undefined) {
                        break;
                    }
                    flowSegs.add(segKey(prevId, nodeId));
                    flowNodes.add(prevId);
                    nodeId = prevId;
                }
            }
        }
        activeSrcNodeCount = srcNodeIds.length;
        activeDestNodeCount = destNodeIds.length;
    }

    let bitWidth = exeNet?.width || 1;
    let wireValue = exeNet?.value || 0;
    let width = (isCtrl || exeNet?.width === 1) ? 1 : (exeNet && exeNet?.width < 32 ? 2 : 4);

    let hoverRef = editorState.hovered?.ref;
    let isHover = (hoverRef?.type === RefType.WireSeg || hoverRef?.type === RefType.WireNode) && hoverRef.id === fullWireId;

    let isSelected = false;
    let selectedNodes = new Set<number>();
    let selectedSegs = new Set<string>();
    let enabledCount = exeNet?.enabledCount ?? 1;

    for (let sel of editorState.snapshot.selected) {
        if (!(sel.type === RefType.WireNode || sel.type === RefType.WireSeg) || sel.id !== fullWireId) {
            continue;
        }
        isSelected = true;

        if (sel.type === RefType.WireNode) {
            selectedNodes.add(sel.wireNode0Id!);
        }
        if (sel.type === RefType.WireSeg) {
            selectedSegs.add(segKey(sel.wireNode0Id!, sel.wireNode1Id!));
        }
    }

    return {
        portBindings: portBindings,
        flowNodes,
        flowSegs,
        width,
        bitWidth,
        wireValue,
        isAddr,
        isCtrl,
        isData,
        isNonZero,
        isHover,
        isSelected,
        selectedNodes,
        selectedSegs,
        activeSrcNodeCount,
        activeDestNodeCount,
        srcNodeCount,
        destNodeCount,
        enabledCount,
        exeNet,
    };
}
