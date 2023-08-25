import React from "react";
import { hasFlag } from "../utils/data";
import { Popup, PopupPos } from "../utils/Portal";
import { Vec3 } from "../utils/vector";
import { ensureSigned32Bit, ensureUnsigned32Bit, signExtend32Bit } from "./comps/RiscvInsDecode";
import { lookupPortInfo } from "./CpuExecution";
import { PortDir, RefType } from "./CpuModel";
import { useEditorContext } from "./Editor";
import s from "./HoverDisplay.module.scss";

export const HoverDisplay: React.FC<{
    canvasEl: HTMLCanvasElement | null,
}> = ({ canvasEl }) => {
    let { editorState, exeModel, setEditorState } = useEditorContext();

    let hovered = editorState.hovered;

    let x: React.ReactNode = null;
    if (hovered) {
        let content: React.ReactNode = null;

        if (hovered.ref.type === RefType.Wire) {
            let netIdx = exeModel.lookup.wireIdToNetIdx.get(hovered.ref.id);
            let net = exeModel.nets[netIdx ?? -1];
            if (net) {
                if (net.width === 1) {
                    content = <div>
                        <div className={s.hexVal}>{net.value.toString()}</div>
                    </div>;
                } else {
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
                    if (hasFlag(net.type, PortDir.Ctrl)) {
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
                        <div className={s.compId}>{net.wire.id}</div>
                    </div>;
                }
            } else {
                content = <div>net {hovered.ref.id} {"=>"} {netIdx} not found</div>;
            }

        } else {
            let compIdx = exeModel.lookup.compIdToIdx.get(hovered.ref.id);
            let comp = exeModel.comps[compIdx ?? -1];

            let portElNode: React.ReactNode = null;
            let portIdStr: React.ReactNode = null;
            if (hovered.ref.type === RefType.CompNode) {
                let portInfo = lookupPortInfo(exeModel, hovered.ref);
                if (portInfo) {
                    let { portExe, port } = portInfo;
                    let type = portExe.type;
                    let typeStr = '';
                    if (hasFlag(type, PortDir.In)) {
                        typeStr = 'in';
                    }
                    if (hasFlag(type, PortDir.Out)) {
                        typeStr = 'out';
                    }
                    if (hasFlag(type, PortDir.Ctrl)) {
                        typeStr += ' ctrl';
                    }
                    if (hasFlag(type, PortDir.Data)) {
                        typeStr += ' data';
                    }
                    if (hasFlag(type, PortDir.Tristate)) {
                        typeStr += ' tristate';
                    }
                    if (hasFlag(type, PortDir.Addr)) {
                        typeStr += ' addr';
                    }
                    portElNode = <>
                        <span>&nbsp; Port {port.name} ({typeStr}) io:{portExe.ioEnabled ? '1' : '0'}, du:{portExe.dataUsed ? '1' : '0'}</span>
                    </>;
                    portIdStr = <span className={s.portId}>/{port.id}</span>;
                }
            }

            if (comp) {
                content = <div>
                    <div>{portElNode ?? comp.comp.name}</div>
                    <div className={s.compId}>{comp.comp.id}/{comp.comp.defId}{portIdStr}</div>
                </div>;

            } else {
                content = <div>comp {hovered.ref.id} not found</div>;
            }
        }

        let offset = new Vec3(20, 20);
        let pos = editorState.mtx.mulVec3(hovered.modelPt).add(offset);
        x = <Popup placement={PopupPos.TopLeft} targetEl={canvasEl} className={s.hoverDisplay} offsetX={pos.x} offsetY={pos.y}>
            <div>{content}</div>
        </Popup>
    }

    return <>
        {x}
    </>;
};
