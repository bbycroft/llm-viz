import React from "react";
import { hasFlag, isNotNil } from "../utils/data";
import { Popup, PopupPos } from "../utils/Portal";
import { Vec3 } from "../utils/vector";
import { ensureSigned32Bit, ensureUnsigned32Bit, signExtend32Bit } from "./comps/RiscvInsDecode";
import { lookupPortInfo, netToString } from "./CpuExecution";
import { ISchematic as IEditSchematic, IoDir, PortType, RefType } from "./CpuModel";
import { useEditorContext } from "./Editor";
import s from "./HoverDisplay.module.scss";
import { computeSubLayoutMatrix, getCompSubSchematic } from "./SubSchematics";

export const HoverDisplay: React.FC<{
    canvasEl: HTMLCanvasElement | null,
}> = ({ canvasEl }) => {
    let { editorState, exeModel, setEditorState } = useEditorContext();

    let hovered = editorState.hovered;

    let x: React.ReactNode = null;
    if (hovered) {
        let content: React.ReactNode = null;

        if (hovered.ref.type === RefType.WireSeg || hovered.ref.type === RefType.WireNode) {
            let netIdx = exeModel.lookup.wireIdToNetIdx.get(hovered.ref.id);
            let net = exeModel.nets[netIdx ?? -1];
            if (net) {
                let bitWidth = net.width;
                let bitVals = [];
                if (net.width === 32) {
                    bitWidth = 8;
                    for (let i = 3; i >= 0; i--) {
                        bitVals.push(net.value >>> (i * bitWidth) & 0xff);
                    }
                } else {
                    bitVals.push(net.value);
                }

                let topLine: React.ReactNode;
                if (hasFlag(net.type, PortType.Ctrl)) {
                    topLine = <div>
                        <span className={s.numVal}>0x{net.value.toString(16).padStart(net.width >>> 2, '0')}</span>
                        <span className={s.bitWidth}>{' '} {net.width} bits</span>
                    </div>;
                } else {
                    topLine = <div>
                        <span className={s.numVal}>{ensureSigned32Bit(net.value).toString().padStart(2, '0')}</span>
                        &nbsp;
                        <span className={s.hexVal}>0x{ensureUnsigned32Bit(net.value).toString(16).padStart(net.width >>> 2, '0')}</span>
                    </div>;
                }

                content = <div>
                    {topLine}
                    {bitVals.map((val, i) => {
                        return <div key={i} className={s.bitVal}>{val.toString(2).padStart(bitWidth, '0')}</div>;
                    })}
                    <div className={s.compId}>{netToString(net, exeModel.comps)}</div>
                    <div className={s.compId}>{net.wire.id}</div>
                </div>;
            } else {
                content = <div>net {hovered.ref.id} {"=>"} {netIdx} not found</div>;
            }

        } else {
            let compIdx = exeModel.lookup.compIdToIdx.get(hovered.ref.id);
            let idxFound = isNotNil(compIdx);
            let exeComp = exeModel.comps[compIdx ?? -1];

            let portElNode: React.ReactNode = null;
            let portIdStr: React.ReactNode = null;
            if (hovered.ref.type === RefType.CompNode) {
                let portInfo = lookupPortInfo(exeModel, hovered.ref);
                if (portInfo) {
                    let { portExe, port } = portInfo;
                    let type = portExe.type;
                    let typeStr = '';
                    if (hasFlag(type, PortType.In)) {
                        typeStr += 'in';
                    }
                    if (hasFlag(type, PortType.Out)) {
                        typeStr += 'out';
                    }
                    if (hasFlag(type, PortType.Ctrl)) {
                        typeStr += ' ctrl';
                    }
                    if (hasFlag(type, PortType.Data)) {
                        typeStr += ' data';
                    }
                    if (hasFlag(type, PortType.Tristate)) {
                        typeStr += ' tristate';
                    }
                    if (hasFlag(type, PortType.Addr)) {
                        typeStr += ' addr';
                    }

                    let isInOut = hasFlag(type, PortType.In) && hasFlag(type, PortType.Out);
                    let dirStr = '';
                    if (isInOut) {
                        dirStr = ', dir=' + IoDir[portExe.ioDir];
                    }

                    portElNode = <>
                        <span>&nbsp; Port {port.name} ({typeStr}) io:{portExe.ioEnabled ? '1' : '0'}, du:{portExe.dataUsed ? '1' : '0'}{dirStr} V:0x{portExe.value.toString(16)}</span>
                    </>;
                    portIdStr = <span className={s.portId}>/{port.id}</span>;
                }
            }

            if (exeComp) {
                content = <div>
                    <div>{portElNode ?? exeComp.comp.name}</div>
                    <div className={s.compId}>{exeComp.comp.id}/{exeComp.comp.defId}{portIdStr}</div>
                </div>;

            } else {
                content = <div>comp {hovered.ref.id} not found {idxFound ? `but has idx ${idxFound}` : 'and exeComp idx not found'}</div>;
            }
        }

        let mtx = editorState.mtx;
        let schematic: IEditSchematic = editorState.snapshot.mainSchematic;

        let subParts = hovered.ref.id.split('|');
        for (let i = 0; i < subParts.length - 1; i++) {
            let comp = schematic.comps.find(c => c.id === subParts[i]);
            let def = editorState.compLibrary.getCompDef(comp?.defId ?? '');
            if (!comp || !def) {
                break;
            }
            let subSchematic = getCompSubSchematic(editorState, comp);
            if (!subSchematic) {
                break;
            }
            let subMtx = computeSubLayoutMatrix(comp, subSchematic);
            mtx = mtx.mul(subMtx);
            schematic = subSchematic;
        }

        let offset = new Vec3(20, 20);
        let pos = mtx.mulVec3(hovered.modelPt).add(offset);
        x = <Popup placement={PopupPos.TopLeft} targetEl={canvasEl} className={s.hoverDisplay} offsetX={pos.x} offsetY={pos.y}>
            <div>{content}</div>
        </Popup>
    }

    return <>
        {x}
    </>;
};
