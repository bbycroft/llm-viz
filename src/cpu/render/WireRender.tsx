import { clamp, getOrAddToMap, isNil } from "../../utils/data";
import { Vec3 } from "../../utils/vector";
import { FontType, makeCanvasFont } from "./CanvasRenderHelpers";
import { ICanvasState, IEditorState, IWireGraph, IExeNet, IExeSystem, RefType, IWireGraphNode, IParentCompInfo } from "../CpuModel";
import { iterWireGraphSegments } from "../Wire";

export function renderWire(cvs: ICanvasState, editorState: IEditorState, wire: IWireGraph, exeNet_: IExeNet, exeSystem: IExeSystem, idPrefix: string, parentCompInfo?: IParentCompInfo) {
    let ctx = cvs.ctx;

    let {
        width,
        bitWidth,
        wireValue,
        flowNodes,
        flowSegs,
        isHover,
        isNonZero,
        isSelected,
        selectedNodes,
        selectedSegs,
        activeSrcNodeCount,
        srcNodeCount,
        destNodeCount,
        enabledCount,
        exeNet,
    } = editorState.wireRenderCache.lookupWire(editorState, idPrefix, wire);

    let fullWireId = idPrefix + wire.id;

    let segKey = (id0: number, id1: number) => `${id0}:${id1}`;

    // check if the wire is actually connected to any comp inputs
    let anySrcNodes = srcNodeCount > 0;
    let anyDestNodes = destNodeCount > 0;

    let hoverRef = editorState.hovered?.ref;

    // let oldScale = cvs.scale;
    // cvs.scale = Math.min(0.2, cvs.scale);
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

    if (activeSrcNodeCount > 1) {
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

    let noFlowColor = '#d3d3d3';
    let zeroFlowColor = '#fec44f';
    let nonZeroFlowColor = '#d95f0e';
    let flowColor = isNonZero ? nonZeroFlowColor : zeroFlowColor;

    function genWireBitCanvas(cvs: ICanvasState, drawWidth: number, bitWidth: number, wireValue: number) {
        let bitCvs = document.createElement('canvas');
        let ctx = bitCvs.getContext('2d')!;

        let nSegs = Math.ceil(bitWidth / drawWidth);
        let segWidth = drawWidth * 2 + 3; // 2px per bit, 6px padding
        let chunkWidth = segWidth * nSegs + 12; // 12px padding

        // we're drawing a horizontal section of the wire
        bitCvs.width = chunkWidth;
        bitCvs.height = drawWidth + 2; // 1px padding top and bottom

        ctx.lineCap = "square";
        ctx.fillStyle = noFlowColor; // background color
        ctx.fillRect(0, 0, bitCvs.width, bitCvs.height);
        ctx.resetTransform();
        ctx.translate(0.5, 1.5);

        // we'll split bits into zeros and ones, and can draw them separately

        ctx.lineWidth = 1;

        // first iter zeros
        ctx.beginPath();
        for (let i = 0; i < bitWidth; i++) {
            let bitVal = (wireValue >> i) & 1;
            if (bitVal === 1) {
                continue;
            }

            let segIdx = nSegs - 1 - Math.floor(i / drawWidth);
            let segOffset = drawWidth - 1 - (i % drawWidth);

            let x = segIdx * segWidth + segOffset * 2;
            ctx.moveTo(x + 0.0, segOffset);
            ctx.lineTo(x + 4.0, segOffset);
        }
        ctx.strokeStyle = zeroFlowColor;
        ctx.stroke();

        // then iter ones
        ctx.beginPath();
        for (let i = 0; i < bitWidth; i++) {
            let bitVal = (wireValue >> i) & 1;
            if (bitVal === 0) {
                continue;
            }

            let segIdx = nSegs - 1 - Math.floor(i / drawWidth);
            let segOffset = drawWidth - 1 - (i % drawWidth);

            let x = segIdx * segWidth + segOffset * 2;
            ctx.moveTo(x, segOffset);
            ctx.lineTo(x + 4.0, segOffset);
        }
        ctx.strokeStyle = nonZeroFlowColor;
        ctx.stroke();
        return bitCvs;
    }

    // let wireBitCanvas = getOrAddToMap(cvs.tileCanvases, `w_${width}_${bitWidth}_${wireValue}`, () => genWireBitCanvas(cvs, width, bitWidth, wireValue));
    // let wireBitPattern = ctx.createPattern(wireBitCanvas, 'repeat')!;

    // need to transform such that we're working in px coords again
    // i.e. the lineWidth is width wide.
    // also transform such that the wire starts at t,0 (for animation)
    // ctx.save();
    // ctx.scale(cvs.scale, cvs.scale);

    let isFloating = enabledCount === 0 && exeNet?.tristate === true && anyDestNodes;
    ctx.save();

    iterWireGraphSegments(wire, (node0, node1) => {
        // ctx.save();
        ctx.beginPath();
        // let offX = node0.pos.x / cvs.scale - width / 2 + cvs.t;
        // let offY = node0.pos.y / cvs.scale - width / 2 - 1.0;
        // ctx.translate(offX, offY);

        let isForwardFlow = flowSegs.has(segKey(node0.id, node1.id));
        let isBackwardFlow = flowSegs.has(segKey(node1.id, node0.id));
        let isFlow = isForwardFlow || isBackwardFlow || !anyDestNodes;


        // somehow will need to indicate flow direction (not yet)

        // if (isFlow) {
        //     // ctx.strokeStyle = wireBitPattern;
        // } else {
        //     ctx.strokeStyle = noFlowColor;
        // }

        // ctx.lineWidth = width; // * cvs.scale;
        // ctx.moveTo(node0.pos.x / cvs.scale - offX, node0.pos.y / cvs.scale - offY);
        // ctx.lineTo(node1.pos.x / cvs.scale - offX, node1.pos.y / cvs.scale - offY);
        ctx.moveTo(node0.pos.x, node0.pos.y);
        ctx.lineTo(node1.pos.x, node1.pos.y);

        ctx.filter = isFloating ? 'blur(2px)' : '';
        ctx.strokeStyle = isFloating ? '#f00' : isFlow ? flowColor : noFlowColor;
        ctx.lineWidth = width * cvs.scale;

        ctx.stroke();
        // ctx.restore();
    });

    ctx.restore();

    // ctx.restore();

    if (parentCompInfo) {
        ctx.save();
        ctx.lineWidth = width * cvs.scale;
        // ctx.setLineDash([2 * cvs.scale, 2 * cvs.scale]);

        for (let node of wire.nodes) {
            if (node.ref?.type !== RefType.CompNode) {
                continue;
            }
            let info = parentCompInfo.linkedCompPorts.get(node.ref.id);
            if (!info) {
                continue;
            }

            if (flowNodes.has(node.id)) {
                ctx.strokeStyle = flowColor;
            } else {
                ctx.strokeStyle = noFlowColor;
            }

            ctx.beginPath();
            ctx.moveTo(node.pos.x, node.pos.y);
            ctx.lineTo(info.innerPos.x, info.innerPos.y);
            ctx.stroke();
        }

        ctx.restore();
    }

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
            let r = clamp(width, 2, 3) * 1.6 * cvs.scale;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            let isFlow = flowNodes.has(node.id);
            ctx.fillStyle = isFlow ? flowColor : noFlowColor;
            ctx.fill();
        }

        if (isSelected && false) {
            ctx.fillStyle = '#666';
            ctx.font = makeCanvasFont(18 * cvs.scale, FontType.Mono);
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            for (let node of wire.nodes) {
                ctx.fillText(node.id.toString(), node.pos.x - 0.1, node.pos.y + 0.1);
            }

        }
    }

    for (let node of wire.nodes) {
        drawEndCircle(node.pos, isHover && isNil(hoverRef?.wireNode1Id) && hoverRef?.wireNode0Id === node.id);
    }

    if (editorState.showExeOrder) {
        let exeNetIdx = exeSystem.lookup.wireIdToNetIdx.get(fullWireId);

        let orders = exeSystem.executionSteps
            .map((x, i) => ({ order: i, netIdx: x.netIdx }))
            .filter(x => x.netIdx === exeNetIdx)
            .map(x => x.order);

        if (orders.length) {

            for (let node of wire.nodes) {
                ctx.fillStyle = '#666';
                ctx.font = makeCanvasFont(18 * cvs.scale, FontType.Mono);
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'left';
                ctx.fillText(orders.join(', '), node.pos.x + 0.1, node.pos.y - 0.1);
            }

        }
    }

    // cvs.scale = oldScale;
}
