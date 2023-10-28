import { hasFlag, isNil } from "../utils/data";
import { Vec3 } from "../utils/vector";
import { FontType, makeCanvasFont } from "./CanvasRenderHelpers";
import { ICanvasState, IEditorState, IWireGraph, IExeNet, IExeSystem, IComp, ICompPort, IExePort, RefType, PortType, IWireGraphNode, IoDir } from "./CpuModel";
import { iterWireGraphSegments } from "./Wire";

export function renderWire(cvs: ICanvasState, editorState: IEditorState, wire: IWireGraph, exeNet: IExeNet, exeSystem: IExeSystem, idPrefix: string) {
    let ctx = cvs.ctx;

    let isCtrl = false;
    let isData = false;
    let isAddr = false;
    let fullWireId = idPrefix + wire.id;

    interface IPortBinding {
        comp: IComp;
        port: ICompPort;
        exePort: IExePort;
        nodeId: number;
    }

    let isNonZero = false;
    let portBindings = new Map<string, IPortBinding>();
    let flowSegs = new Set<string>(); // the direction of flow is given by id0 -> id1 in "id0:id1"
    let flowNodes = new Set<number>();
    let segKey = (id0: number, id1: number) => `${id0}:${id1}`;
    let inputNodeCount = 0;

    if (exeNet) {
        isNonZero = exeNet.value !== 0;

        let key = (compId: string, portId: string) => `${compId}:${portId}`;

        for (let exePortRef of [...exeNet.inputs, ...exeNet.outputs]) {
            let exeComp = exePortRef.exeComp;
            let exePort = exePortRef.exePort;
            let comp = exeComp.comp;
            let port = comp.ports[exePort.portIdx];

            if (!port) {
                continue;
            }

            portBindings.set(key(comp.id, port.id), {
                comp: comp,
                port: comp.ports[exePort.portIdx],
                exePort: exePort,
                nodeId: -1,
            });
        }

        let nodeIdToPortBinding = new Map<number, IPortBinding>();

        for (let node of wire.nodes) {
            if (node.ref?.type === RefType.CompNode) {
                let portBinding = portBindings.get(key(node.ref.id, node.ref.compNodeId!));
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

        let inputNodeIds: number[] = []; // should only be one active input! multiple imply some failure, and should probably be rendered specially in some way
        let outputNodeIds: number[] = [];

        for (let binding of nodeIdToPortBinding.values()) {
            if (hasFlag(binding.port.type, PortType.In) && binding.exePort.ioDir !== IoDir.Out && binding.exePort.dataUsed) {
                inputNodeIds.push(binding.nodeId);
            }
            if (hasFlag(binding.port.type, PortType.Out) && binding.exePort.ioDir !== IoDir.In && binding.exePort.dataUsed) {
                outputNodeIds.push(binding.nodeId);
            }
        }

        // now walk the wire graph from the inputNodeIds to all the outputNodeIds (shortest paths)
        // and mark those segments as flow segments

        for (let inputNodeId of inputNodeIds) {
            let visited = new Set<number>();
            let prevNodeId = new Map<number, number>();
            let queue = [inputNodeId];

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

            for (let outputNodeId of outputNodeIds) {
                let nodeId = outputNodeId;
                while (nodeId !== inputNodeId) {
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
        inputNodeCount = outputNodeIds.length;
    }

    let width = isCtrl || exeNet?.width < 32 ? 1 : 3;

    let hoverRef = editorState.hovered?.ref;
    let isHover = (hoverRef?.type === RefType.WireSeg || hoverRef?.type === RefType.WireNode) && hoverRef.id === fullWireId;

    let isSelected = false;
    let selectedNodes = new Set<number>();
    let selectedSegs = new Set<string>();

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

    ctx.lineCap = "square";
    ctx.lineJoin = "round";

    function isSegHover(node0: IWireGraphNode, node1: IWireGraphNode) {
        return isHover && hoverRef!.type === RefType.WireSeg && hoverRef!.wireNode0Id === node0.id && hoverRef!.wireNode1Id === node1.id;
    }

    function isNodeHover(node: IWireGraphNode) {
        return isHover && hoverRef!.type === RefType.WireNode && hoverRef!.wireNode0Id === node.id;
    }

    function isNodeSelected(node: IWireGraphNode) {
        return isSelected && selectedNodes.has(node.id);
    }

    function isSegSelected(node0: IWireGraphNode, node1: IWireGraphNode) {
        return isSelected && selectedSegs.has(segKey(node0.id, node1.id));
    }

    if (inputNodeCount > 1) {
        ctx.save();
        iterWireGraphSegments(wire, (node0, node1) => {
            ctx.beginPath();
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = (width + 5) * cvs.scale;
            // ctx.filter = 'blur(4px)';
            ctx.moveTo(node0.pos.x, node0.pos.y);
            ctx.lineTo(node1.pos.x, node1.pos.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    if (isSelected) {
        ctx.save();

        ctx.beginPath();
        iterWireGraphSegments(wire, (node0, node1) => {
            if (isSegSelected(node0, node1)) {
                ctx.moveTo(node0.pos.x, node0.pos.y);
                ctx.lineTo(node1.pos.x, node1.pos.y);
            }
        });
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = (width + 3) * cvs.scale;
        ctx.stroke();

        ctx.beginPath();
        for (let node of wire.nodes) {
            if (isNodeSelected(node)) {
                ctx.moveTo(node.pos.x, node.pos.y);
                ctx.arc(node.pos.x, node.pos.y, 3 * cvs.scale, 0, 2 * Math.PI);
            }
        }
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = (width) * cvs.scale;
        ctx.stroke();
        ctx.restore();
    }

    if (isHover) {
        ctx.save();
        iterWireGraphSegments(wire, (node0, node1) => {
            ctx.beginPath();
            if (isSegHover(node0, node1)) {
                ctx.strokeStyle = '#55f';
            } else {
                ctx.strokeStyle = '#000';
            }
            ctx.lineWidth = width * cvs.scale;
            ctx.filter = 'blur(3px)';
            ctx.moveTo(node0.pos.x, node0.pos.y);
            ctx.lineTo(node1.pos.x, node1.pos.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    let noFlowColor = '#D3D3D3';
    let zeroFlowColor = '#fec44f';
    let nonZeroFlowColor = '#d95f0e';
    let flowColor = isNonZero ? nonZeroFlowColor : zeroFlowColor;

    iterWireGraphSegments(wire, (node0, node1) => {
        ctx.beginPath();

        let isForwardFlow = flowSegs.has(segKey(node0.id, node1.id));
        let isBackwardFlow = flowSegs.has(segKey(node1.id, node0.id));
        let isFlow = isForwardFlow || isBackwardFlow;

        // somehow will need to indicate flow direction (not yet)

        ctx.strokeStyle = noFlowColor; //'#333';

        if (isFlow) {
            ctx.strokeStyle = flowColor;
        }

        ctx.lineWidth = width * cvs.scale;
        ctx.moveTo(node0.pos.x, node0.pos.y);
        ctx.lineTo(node1.pos.x, node1.pos.y);
        ctx.stroke();
    });

    function drawEndCircle(p: Vec3, isHover: boolean) {
        if (!isHover) {
            return;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * cvs.scale, 0, 2 * Math.PI);
        // ctx.fillStyle = isHover ? '#f00' : '#000';
        ctx.strokeStyle = isHover ? '#f00' : '#000';
        ctx.lineWidth = 2 * cvs.scale;
        ctx.stroke();
    }

    for (let node of wire.nodes) {
        // find nodes at a T junction or a X junction
        // and draw a circle at the junction
        let dirsUsed = new Set<string>();

        for (let edgeId of node.edges) {
            let node2 = wire.nodes[edgeId];
            let edgeDir = node2.pos.sub(node.pos).normalize();
            let dir = `${edgeDir.x.toFixed(2)},${edgeDir.y.toFixed(2)}`;
            dirsUsed.add(dir);
        }

        let isJunction = dirsUsed.size > 2;
        if (isJunction) {
            let x = node.pos.x;
            let y = node.pos.y;
            let r = Math.max(width, 2) * 1.7 * cvs.scale;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            let isFlow = flowNodes.has(node.id);
            ctx.fillStyle = isFlow ? flowColor : noFlowColor;
            ctx.fill();
        }

        if (isSelected) {
            ctx.fillStyle = '#666';
            ctx.font = makeCanvasFont(18 * cvs.scale, FontType.Mono);
            ctx.textBaseline = 'bottom';
            ctx.textAlign = 'left';
            for (let node of wire.nodes) {
                ctx.fillText(node.id.toString(), node.pos.x + 0.1, node.pos.y - 0.1);
            }

        }
    }

    for (let node of wire.nodes) {
        drawEndCircle(node.pos, isHover && isNil(hoverRef?.wireNode1Id) && hoverRef?.wireNode0Id === node.id);
    }

    if (editorState.showExeOrder) {
        let exeNetIdx = exeSystem.lookup.wireIdToNetIdx.get(fullWireId);
        let order = exeSystem.executionSteps.findIndex(x => x.netIdx === exeNetIdx);

        if (order >= 0) {

            for (let node of wire.nodes) {
                ctx.fillStyle = '#666';
                ctx.font = makeCanvasFont(18 * cvs.scale, FontType.Mono);
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'left';
                ctx.fillText(order.toString(), node.pos.x + 0.1, node.pos.y - 0.1);
            }

        }
    }
}
