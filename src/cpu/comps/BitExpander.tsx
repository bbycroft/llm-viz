import React, { SetStateAction } from "react";
import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { createBitWidthMask, rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";
import { editCompConfig, useEditorContext } from "../Editor";
import { applySetter, assignImm, isNil, makeArrayRange } from "@/src/utils/data";
import { HexValueEditor, HexValueInputType } from "../displayTools/HexValueEditor";
import { CheckboxMenuTitle } from "./RenderHelpers";
import { ButtonStandard } from "../sidebars/EditorControls";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { palleteColors } from "../palette";
import clsx from "clsx";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { EditKvp } from "../sidebars/CompDetails";
import { ensureUnsigned32Bit } from "./RiscvInsDecode";

interface IBitExpanderMultiConfig extends IBaseCompConfig {
    collapse: boolean; // (or expand)
    bitWidth: number; // input bit width
    bitRange: IBitRange[];
    reverse: boolean;
}

interface IBitRange {
    id: number; // stable
    start: number;
    end: number; // inclusive numbers
    showBits: boolean; // render bits in this range
    individual: boolean; // if true, each bit in this range is a separate output
    stepsPerBit?: number; // if individual, how many steps per bit
}

interface IBitExpanderMultiData {
    singlePort: IExePort;
    multiPorts: IExePort[];
}

export function createBitExpanderComps(_args: ICompBuilderArgs): ICompDef<any>[] {
    let initialW = 3;
    let initialH = 4;

    function computeHeight(args: IBitExpanderMultiConfig) {
        let width = 1;
        for (let range of args.bitRange) {
            width += rangeHeight(range);
        }

        return Math.max(2, width);
    }

    function rangeHeight(range: IBitRange) {
        let nBits = range.end - range.start + 1;

        if (range.individual || range.showBits) {
            if (range.individual && range.stepsPerBit) {
                return nBits * range.stepsPerBit;
            }
            return nBits;
        }

        let nBitsRendered = Math.ceil(nBits / 4);
        return Math.min(Math.ceil(2 + (nBitsRendered / 2)), nBits);
    }

    let bitExpanderMulti: ICompDef<IBitExpanderMultiData, IBitExpanderMultiConfig> = {
        defId: 'bits/expand-multi',
        name: "Bit Expand Multi",
        size: new Vec3(initialW, initialH),
        flags: CompDefFlags.HasBitWidth | CompDefFlags.CanRotate | CompDefFlags.IsAtomic,
        ports: (args) => {
            let fullHeight = computeHeight(args);

            let ports = [
                { id: args.collapse ? 'o' : 'i', name: '', pos: new Vec3(0, (fullHeight - 1) / 2).round(), type: args.collapse ? PortType.Out : PortType.In, width: args.bitWidth },
            ];

            let reverse = args.reverse;

            let multiPortType = args.collapse ? PortType.In : PortType.Out;
            let multiPortPrefix = args.collapse ? 'i' : 'o';
            let multiPortX = 3;

            let offset = reverse ? fullHeight - 1 : 1;
            for (let range of args.bitRange) {
                let nBits = range.end - range.start + 1;
                let rHeight = rangeHeight(range);
                let center = offset + (rHeight / 2) * (reverse ? -1 : 1) + (reverse ? 0.5 : -1);

                if (range.individual) {
                    let j = 0;
                    let stepsPerBit = (range.stepsPerBit ?? 1) * (reverse ? -1 : 1);
                    for (let i = range.start; i <= range.end; i++) {
                        let yPos = offset + i * stepsPerBit - range.start * (reverse ? -1 : 1);
                        ports.push({ id: `${multiPortPrefix}_${range.id}_${j++}`, name: '', pos: new Vec3(multiPortX, yPos), type: multiPortType, width: 1 });
                    }
                } else {
                    ports.push({ id: `${multiPortPrefix}_${range.id}_0`, name: '', pos: new Vec3(multiPortX, center).round(), type: multiPortType, width: nBits });
                }

                offset += rHeight * (reverse ? -1 : 1);
            }

            return ports;
        },
        initConfig: () => ({
            bitWidth: 32,
            bitRange: [{ start: 0, end: 31, individual: false, showBits: true, id: 0 }],
            collapse: false,
            reverse: false,
            rotate: 0,
        }),
        applyConfig(comp, args) {
            let maxId = Math.max(...args.bitRange.map(r => r.id ?? 0), 0) + 1;
            for (let range of args.bitRange) {
                if (isNil(range.id)) {
                    range.id = maxId++;
                }
            }
            comp.size = new Vec3(initialW, computeHeight(args));
        },
        build: (builder) => {
            let args = builder.comp.args;

            let data = builder.addData({
                singlePort: builder.getPort(args.collapse ? 'o' : 'i'),
                multiPorts: builder.ports.filter(p => p.type === (args.collapse ? PortType.In : PortType.Out)),
            });

            let ports = builder.comp.args.bitRange.map(r => {
                return {
                    start: r.start,
                    end: r.end,
                    individual: r.individual,
                    mask: createBitWidthMask(r.end - r.start + 1),
                };
            });

            if (args.collapse) {
                builder.addPhase(({ data: { singlePort, multiPorts } }) => {
                    let outPortVal = 0;
                    let inPortIdx = 0;
                    for (let port of ports) {
                        if (port.individual) {
                            for (let i = port.end; i >= port.start; i--) {
                                let mPort = multiPorts[inPortIdx++];
                                mPort.ioEnabled = true;
                                outPortVal |= (mPort.value & 1) << i;
                            }
                        } else {
                            let mPort = multiPorts[inPortIdx++];
                            mPort.ioEnabled = true;
                            outPortVal |= (mPort.value & port.mask) << port.start;
                        }
                    }
                    singlePort.value = ensureUnsigned32Bit(outPortVal);
                    singlePort.ioEnabled = true;
                }, data.multiPorts, [data.singlePort]);
            } else {

                builder.addPhase(({ data: { singlePort, multiPorts } }) => {
                    let inPortVal = singlePort.value;
                    let outPortIdx = 0;
                    for (let port of ports) {
                        if (port.individual) {
                            for (let i = port.end; i >= port.start; i--) {
                                multiPorts[outPortIdx++].value = (inPortVal >>> i) & 1;
                            }
                        } else {
                            multiPorts[outPortIdx++].value = ensureUnsigned32Bit((inPortVal >>> port.start) & port.mask);
                        }
                    }
                }, [data.singlePort], data.multiPorts);

            }

            return builder.build();
        },
        renderCanvasPath({ comp, ctx }) {
            ctx.save();
            ctx.translate(comp.pos.x, comp.pos.y);
            let baseSize = comp.size;
            let mtx = rotateAboutAffineInt(comp.rotation, comp.size);
            ctx.transform(...mtx.toTransformParams());

            let slope = 0.3;
            let x = 0.5;
            let y = 0.5;
            let w = baseSize.x - 1.0;
            let h = baseSize.y - 1.0;

            ctx.moveTo(x + slope, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x + slope, y + h);
            ctx.lineTo(x, y + h - 1);
            ctx.lineTo(x, y + 1);
            ctx.closePath();

            ctx.restore();
        },
        renderOptions({ editCtx, comp }) {
            return <BitExpandMultiOptions editCtx={editCtx} comp={comp} />;
        },
        render({ ctx, comp, exeComp, cvs, styles }) {

            ctx.font = makeCanvasFont(1, FontType.Mono);
            let singleW = ctx.measureText('0 ').width;
            let numCanvasFont = makeCanvasFont(1 / singleW, FontType.Mono);


            let rangeDrawOffset = 0;
            let rangeId = 0;
            let prevEnd = -1;

            let isVert = comp.rotation === 0 || comp.rotation === 2;
            let isReversed = comp.args.reverse !== (comp.rotation === 1 || comp.rotation === 2);
            let tl = comp.bb.min.sub(new Vec3(0.5, 0.5));

            let fullValue = exeComp?.data.singlePort.value ?? 0x00;
            let allBits = [...fullValue.toString(2).padStart(comp.args.bitWidth, '0')];

            let ranges = [...comp.args.bitRange];

            for (let rangeIdx = 0; rangeIdx < ranges.length; rangeIdx++) {

                let rIdx = isReversed ? ranges.length - rangeIdx - 1 : rangeIdx;
                let range = ranges[rIdx];

                // binary string is 01101001 say, i.e. MSB first, so need to reverse these numbers
                let rangeStart = comp.args.bitWidth - range.end - 1;
                let rangeEnd = comp.args.bitWidth - range.start - 1;

                let nBits = rangeEnd - rangeStart + 1;
                let rangeH = rangeHeight(range);

                ctx.font = numCanvasFont;
                ctx.fillStyle = rangeColors[rIdx % 4];
                ctx.textAlign = isVert ? 'right' : 'center';
                ctx.textBaseline = isVert ? 'middle' : 'bottom';

                if (rangeH === nBits) {
                    // split into groups of 4, so the amount of drift is minimized (text sizing is intended to put a digit
                    // above each line, but it's not perfect, so this approach helps)
                    let groupSize = isVert ? 1 : 4;
                    let nGroups = Math.ceil(rangeH / groupSize);
                    for (let groupIdx = 0; groupIdx < nGroups; groupIdx++) {
                        let gIdx = isReversed ? nGroups - groupIdx - 1 : groupIdx;
                        let startIdx = rangeStart + gIdx * groupSize;
                        let endIdx = Math.min(startIdx + groupSize, rangeEnd + 1);
                        let groupBits = allBits.slice(startIdx, endIdx);
                        let centerOffset = gIdx * groupSize + (endIdx - startIdx) / 2 + 0.5;
                        if (isReversed) {
                            groupBits.reverse();
                            centerOffset = rangeH + 1 - centerOffset;
                        }
                        let textBin = groupBits.join(' ');
                        if (isVert) {
                            ctx.fillText(textBin, tl.x + comp.size.x - 1.0, tl.y + 0.0 + rangeDrawOffset + centerOffset);
                        } else {
                            ctx.fillText(textBin, tl.x + rangeDrawOffset + centerOffset, tl.y - 0.5 + comp.size.x - 0.1);
                            // ctx.fillRect(tl.x + rangeDrawOffset + centerOffset, tl.y - 0.5 + comp.size.x - 0.15, 0.1, 0.1);
                        }
                    }
                } else {
                    let textBin = allBits.slice(rangeStart, rangeEnd + 1).join('');
                    let text = '0x' + parseInt(textBin, 2).toString(16).padStart(Math.ceil(nBits / 4), '0');
                    ctx.fillText(text, tl.x + rangeDrawOffset + rangeH / 2 + 0.5, comp.pos.y - 0.5 + comp.size.y - 0.1);
                }

                if (isVert) {
                    let lineYStart = tl.y + rangeDrawOffset + 0.5;

                    if (prevEnd >= 0) {
                        ctx.strokeStyle = '#777';
                        ctx.lineWidth = styles.lineWidth;
                        ctx.beginPath();
                        ctx.moveTo(tl.x + 0.9, lineYStart);
                        ctx.lineTo(tl.x + comp.size.x - 0.6, lineYStart);
                        ctx.stroke();
                    }

                    ctx.font = makeCanvasFont(0.6, FontType.Mono);
                    ctx.fillStyle = '#777';
                    ctx.textAlign = 'right';

                    let topText = range.end.toString();
                    let botText = range.start.toString();

                    if (isReversed) {
                        [topText, botText] = [botText, topText];
                    }

                    ctx.fillText(topText, tl.x + 1.4, Math.round(lineYStart + 0.5));

                    // ctx.textAlign = '';
                    ctx.fillText(botText, tl.x + 1.4, Math.round(lineYStart + rangeH - 0.5));
                } else {

                    let lineXStart = tl.x + rangeDrawOffset + 0.5;

                    if (prevEnd >= 0) {
                        ctx.strokeStyle = '#777';
                        ctx.lineWidth = styles.lineWidth;
                        ctx.beginPath();
                        ctx.moveTo(lineXStart, tl.y + 0.7);
                        ctx.lineTo(lineXStart, tl.y + comp.size.x - 0.6);
                        ctx.stroke();
                    }

                    ctx.font = makeCanvasFont(0.6, FontType.Mono);
                    ctx.fillStyle = '#777';
                    ctx.textAlign = 'center';

                    let leftText = range.end.toString();
                    let rightText = range.start.toString();

                    if (isReversed) {
                        [leftText, rightText] = [rightText, leftText];
                    }
                    ctx.fillText(leftText, Math.round(lineXStart + 0.5), tl.y + 1.5);

                    // ctx.textAlign = '';
                    ctx.fillText(rightText, Math.round(lineXStart + rangeH - 0.5), tl.y + 1.5);
                }

                rangeId += 1;
                rangeDrawOffset += rangeH;
                prevEnd = rangeEnd;
            }
        },
    };

    return [bitExpanderMulti];
}

function getNextRangeId(ranges: IBitRange[]) {
    let maxId = Math.max(...ranges.map(r => r.id ?? 0), 0) + 1;
    let potentialIds = new Set(makeArrayRange(maxId + 1, 0, maxId));
    ranges.forEach(r => potentialIds.delete(r.id));
    return potentialIds.values().next().value;
}

const BitExpandMultiOptions: React.FC<{
    editCtx: IEditContext;
    comp: IComp<IBitExpanderMultiConfig>;
}> = ({ editCtx, comp }) => {
    let [, setEditorState] = useEditorContext();

    let insertBitRange = (index: number, range: IBitRange) => setEditorState(editCompConfig(editCtx, true, comp, a => {
        let bitRange = [...a.bitRange];
        bitRange.splice(index, 0, range);
        return assignImm(a, { bitRange });
    }));

    let removeBitRange = (index: number) => setEditorState(editCompConfig(editCtx, true, comp, a => {
        let bitRange = [...a.bitRange];
        bitRange.splice(index, 1);
        return assignImm(a, { bitRange });
    }));

    let editBitRange = (end: boolean, index: number, range: SetStateAction<IBitRange>) => setEditorState(editCompConfig(editCtx, end, comp, a => {
        let bitRange = [...a.bitRange];
        bitRange[index] = applySetter(range, bitRange[index]);
        return assignImm(a, { bitRange });
    }));

    return <>

        <EditKvp label="Collapse">
            <CheckboxMenuTitle title="" value={comp.args.collapse} update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { collapse: v })))} />
        </EditKvp>

        <EditKvp label="Reverse">
            <CheckboxMenuTitle title="" value={comp.args.reverse} update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { reverse: v })))} />
        </EditKvp>

        <div className="flex flex-col">
            <div className="mb-1">Bit Ranges</div>
            <div className="flelx flex-col items-center">
                {comp.args.bitRange.map((range, i) => {
                    return <div key={i} className="flex bg-slate-100 py-2 px-2 items-center flex-auto">
                        <div className={clsx("rounded-full w-2 h-2")} style={{ backgroundColor: rangeColors[i % 4] }} />

                        <HexValueEditor
                            className="w-[2rem] bg-slate-200 mx-2 rounded"
                            inputClassName="text-center active:bg-slate-300"
                            value={range.end}
                            update={(end, v) => editBitRange(end, i, r => assignImm(r, { end: v }))}
                            inputType={HexValueInputType.Dec}
                            hidePrefix
                            fixedInputType
                            minimalBackground
                        />
                        {":"}
                        <HexValueEditor
                            className="w-[2rem] bg-slate-200 mx-2 rounded"
                            inputClassName="text-center active:bg-slate-300"
                            value={range.start}
                            update={(end, v) => editBitRange(end, i, r => assignImm(r, { start: v }))}
                            inputType={HexValueInputType.Dec}
                            hidePrefix
                            fixedInputType
                            minimalBackground
                        />

                        <CheckboxMenuTitle title="Show Bits" className="mx-2 text-base" value={range.showBits} update={(end, v) => editBitRange(end, i, r => assignImm(r, { showBits: v }))} />
                        <CheckboxMenuTitle title="Individual" className="text-base" value={range.individual} update={(end, v) => editBitRange(end, i, r => assignImm(r, { individual: v }))} />

                        {range.individual && <HexValueEditor
                            className="w-[2rem] bg-slate-200 mx-2 rounded flex-shrink flex-grow-0"
                            inputClassName="text-center active:bg-slate-300"
                            value={range.stepsPerBit ?? 1}
                            update={(end, v) => editBitRange(end, i, r => assignImm(r, { stepsPerBit: v }))}
                            inputType={HexValueInputType.Dec}
                            hidePrefix
                            fixedInputType
                            minimalBackground
                        />}

                        <ButtonStandard className="ml-auto" onClick={() => removeBitRange(i)}>
                            <FontAwesomeIcon icon={faTrash} className="text-gray-600" />
                        </ButtonStandard>
                        <ButtonStandard className="ml-2" onClick={() => insertBitRange(i, { start: range.end, end: range.end, individual: false, showBits: true, id: getNextRangeId(comp.args.bitRange) })}>
                            <FontAwesomeIcon icon={faPlus} className="text-gray-600" />
                        </ButtonStandard>

                        {range.id}
                    </div>;
                })}
                <div className="flex justify-center">
                    <ButtonStandard onClick={() => {
                        let lastRange = comp.args.bitRange[comp.args.bitRange.length - 1];
                        let start = Math.min((lastRange?.end ?? -1) + 1, comp.args.bitWidth - 1);
                        let end = Math.min(start + 3, comp.args.bitWidth - 1);
                        insertBitRange(comp.args.bitRange.length, { start, end, showBits: true, individual: false, id: getNextRangeId(comp.args.bitRange) });
                    }}>Add Range</ButtonStandard>
                </div>
            </div>
        </div>
    </>;
};

let rangeColors = [
    palleteColors.amber[700],
    palleteColors.green[700],
    palleteColors.blue[700],
    palleteColors.orange[700],
];
