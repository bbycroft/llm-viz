import React, { memo } from "react";
import { StateSetter, assignImm, hasFlag } from "@/src/utils/data";
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditContext, IEditorState, IExeComp, IExePort, PortType } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CheckboxMenuTitle, CompRectBase, ConfigMenu, MenuRow } from "./RenderHelpers";
import { editComp, editCompConfig, useEditorContext, useViewLayout } from "../Editor";
import { HexValueEditor, HexValueInputType, clampToSignedWidth } from "../displayTools/HexValueEditor";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "@/src/utils/keyboard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import clsx from "clsx";
import { IPointerEvent, useCombinedMouseTouchDrag } from "@/src/utils/pointer";
import { StringEditor } from "../displayTools/StringEditor";
import { palette } from "../palette";
import { CursorDragOverlay } from "@/src/utils/CursorDragOverlay";
import { makeCanvasFont } from "../CanvasRenderHelpers";

export enum PortPlacement {
    Right,
    Bottom,
    Left,
    Top,
}


export interface ICompPortConfig {
    portId: string;
    name: string;
    w: number;
    h: number;
    portPos: PortPlacement;
    type: PortType;
    bitWidth: number;
    signed: boolean;
    inputOverride: boolean;
    inputValueOverride: number;
    valueMode: HexValueInputType;
}

export interface ICompPortData {
    port: IExePort;
    externalPort: IExePort;
    externalPortBound: boolean;
    value: number;
}

export function portPlacementToPos(portPos: PortPlacement, w: number, h: number) {
    let midXSnapped = Math.floor(w / 2);
    let midYSnapped = Math.floor(h / 2);

    switch (portPos) {
        case PortPlacement.Right: return new Vec3(w, midYSnapped);
        case PortPlacement.Bottom: return new Vec3(midXSnapped, h);
        case PortPlacement.Left: return new Vec3(0, midYSnapped);
        case PortPlacement.Top: return new Vec3(midXSnapped, 0);
        default: return new Vec3(w, midYSnapped);
    }
}

export const compPortDefId = 'core/comp/port';

export function createCompIoComps(args: ICompBuilderArgs) {

    let w = 6;
    let h = 6;
    let compPort: ICompDef<ICompPortData, ICompPortConfig> = {
        defId: 'comp/port',
        name: "Port",
        size: new Vec3(w, h),
        ports: (args, compDef) => {

            let internalPortDir = switchPortDir(args.type);
            let pos = portPlacementToPos(args.portPos, args.w, args.h);

            return [
                { id: 'a', name: '', pos, type: internalPortDir, width: args.bitWidth },
            ];
        },
        initConfig: () => ({
            portId: '',
            name: '',
            w: 6,
            h: 6,
            type: PortType.Out,
            portPos: PortPlacement.Right,
            bitWidth: 1,
            signed: false,
            valueMode: HexValueInputType.Dec,
            inputOverride: false,
            inputValueOverride: 0,
        }),
        applyConfig(comp, args) {
            comp.size = new Vec3(args.w, args.h);
        },
        build: (builder) => {
            let args = builder.comp.args;
            let isInput = hasFlag(args.type, PortType.In);

            let data = builder.addData({
                port: builder.getPort('a'),
                externalPort: builder.createExternalPort('_b', args.type, args.bitWidth),
                externalPortBound: false,
                value: isInput && args.inputOverride ? args.inputValueOverride : 0,
            });

            if (isInput) {
                builder.addPhase(({ data }) => {
                    if (data.externalPortBound) {
                        data.value = data.externalPort.value;
                    }
                    data.port.value = data.value;
                    data.port.ioEnabled = true;
                }, [data.externalPort], [data.port]);

            } else {
                builder.addPhase(({ data }) => {
                    data.value = data.port.value;
                    if (data.externalPortBound) {
                        data.externalPort.value = data.value;
                    }
                    data.port.ioEnabled = true;
                }, [data.port], [data.externalPort]);
            }

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            let isInput = hasFlag(comp.args.type, PortType.In);
            ctx.fillStyle = isInput ? palette.portInputBg : palette.portOutputBg;
            ctx.beginPath();
            let p = comp.pos;
            let s = comp.size;
            ctx.roundRect(p.x, p.y, s.x, s.y, s.y / 2);

            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            let scale = Math.min(cvs.scale, 1/15);

            ctx.fillStyle = 'black';
            ctx.font = makeCanvasFont(scale * 14);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(comp.args.name, p.x + s.x / 2, p.y + s.y + 0.3);

            ctx.restore();
        },
        renderDom: ({ comp, exeComp, ctx, styles, isActive, editCtx }) => {
            return <PortEditor editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />;
        },
    };

    return [compPort];
}

export function switchPortDir(dir: PortType) {
    let newDir = dir & ~(PortType.In | PortType.Out);

    if (hasFlag(dir, PortType.In)) {
        newDir |= PortType.Out;
    }
    if (hasFlag(dir, PortType.Out)) {
        newDir |= PortType.In;
    }

    return newDir;
}

function makeEditFunction<T, A>(setEditorState: StateSetter<IEditorState>, editCtx: IEditContext, comp: IComp<T>, updateFn: (value: A, prev: T) => Partial<T>) {
    return (end: boolean, value: A) => {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, updateFn(value, a))));
    };
}

const PortEditor: React.FC<{
    editCtx: IEditContext,
    comp: IComp<ICompPortConfig>,
    exeComp: IExeComp<ICompPortData>,
    isActive: boolean,
}> = memo(function PortEditor({ editCtx, comp, exeComp, isActive }) {
    let { setEditorState } = useEditorContext();

    let editIsOverriden = makeEditFunction(setEditorState, editCtx, comp, (value: boolean) => ({ inputOverride: value }));
    let editBitWidth = makeEditFunction(setEditorState, editCtx, comp, (value: number) => ({ bitWidth: value, inputValueOverride: clampToSignedWidth(comp.args.inputValueOverride ?? 0, value, comp.args.signed) }));
    let editSigned = makeEditFunction(setEditorState, editCtx, comp, (value: boolean) => ({ signed: value, inputValueOverride: clampToSignedWidth(comp.args.inputValueOverride ?? 0, comp.args.bitWidth, value) }));
    let editPortType = makeEditFunction(setEditorState, editCtx, comp, (isInputPort: boolean, prev) => {
            let type = prev.type;
            if (isInputPort) {
                type |= PortType.In;
                type &= ~PortType.Out;
            } else {
                type |= PortType.Out;
                type &= ~PortType.In;
            }
            return { type };
    });

    function editValueOverride(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { inputValueOverride: clampToSignedWidth(value, a.bitWidth, a.signed), valueMode })));
    }

    let isInput = hasFlag(comp.args.type, PortType.In);
    let isInputOverride = comp.args.inputOverride;
    let isBound = exeComp?.data.externalPortBound ?? false;

    return <>
        <CompRectBase comp={comp} className={""} hideHover={true}>
            {isInput && <HexValueEditor
                className="absolute inset-0 px-2"
                inputType={comp.args.valueMode}
                value={isBound ? exeComp.data.value : comp.args.inputValueOverride}
                update={editValueOverride}
                minimalBackground
                readonly={isBound}
                inputClassName="text-center"
                maxBits={comp.args.bitWidth}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
                hidePrefix
            />}
            {!isInput && <HexValueEditor
                className="absolute inset-0 px-2"
                value={exeComp?.data.value ?? 0}
                minimalBackground
                inputClassName="text-center"
                update={(end, _val, inputType) => editValueOverride(end, comp.args.inputValueOverride, inputType)}
                inputType={comp.args.valueMode}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
                readonly
                hidePrefix
            />}
            <ConfigMenu className={"absolute top-[12px] right-[12px]"}>
                <MenuRow title={"Label"}>
                    <StringEditor
                        value={comp.args.name}
                        update={makeEditFunction(setEditorState, editCtx, comp, (value: string) => ({ name: value }))}
                    />
                </MenuRow>
                <MenuRow title={"Id"}>
                    <StringEditor
                        className="font-mono"
                        value={comp.args.portId}
                        update={makeEditFunction(setEditorState, editCtx, comp, (value: string) => ({ portId: value }))}
                    />
                </MenuRow>
                <MenuRow title={<CheckboxMenuTitle title="Input" value={isInput} update={editPortType} />} />
                <MenuRow title={<CheckboxMenuTitle title="Override Value" value={isInputOverride} update={editIsOverriden} />} disabled={!isInput}>
                    <HexValueEditor
                        inputType={comp.args.valueMode}
                        value={comp.args.inputValueOverride}
                        update={editValueOverride}
                        maxBits={comp.args.bitWidth}
                        padBits={comp.args.bitWidth}
                        signed={comp.args.signed}
                    />
                </MenuRow>
                <MenuRow title={"Bit Width"}>
                    <HexValueEditor inputType={HexValueInputType.Dec} hidePrefix value={comp.args.bitWidth} update={editBitWidth} />
                </MenuRow>
                <MenuRow title={<CheckboxMenuTitle title="Signed" value={comp.args.signed} update={editSigned} />} />
            </ConfigMenu>
        </CompRectBase>
        {isActive && <PortResizer editCtx={editCtx} comp={comp} />}
    </>;
});

export const PortResizer: React.FC<{
    editCtx: IEditContext,
    comp: IComp<{ w: number, h: number, portPos: PortPlacement }>,
}> = memo(function PortResizer({ editCtx, comp }) {

    let { editorState, setEditorState } = useEditorContext();

    useGlobalKeyboard(KeyboardOrder.Element, ev => {
        if (isKeyWithModifiers(ev, 'r')) {
            setEditorState(editCompConfig(editCtx, true, comp, a => assignImm(a, { portPos: (a.portPos + 1) % 4 })));
            ev.preventDefault();
            ev.stopPropagation();
        }
    });

    let scale = editorState.mtx.a;

    function handleResize(end: boolean, pos: Vec3, size: Vec3) {
        setEditorState(editComp(editCtx, end, comp, a => assignImm(a, {
            pos,
            args: assignImm(a.args, { w: size.x, h: size.y }),
            size,
        })));
    }

    return <div className="absolute origin-top-left" style={{ transform: `translate(${comp.pos.x}px, ${comp.pos.y}px) scale(${1/scale})`, width: comp.size.x * scale, height: comp.size.y * scale }}>
        {[...new Array(4)].map((_, idx) => {
            return <Gripper key={idx} gripPos={idx} size={comp.size} pos={comp.pos} onResize={handleResize} centerY />;
        })}
    </div>;
});

export const Gripper: React.FC<{
    gripPos: PortPlacement,
    pos: Vec3,
    size: Vec3,
    centerY?: boolean,
    onResize: (end: boolean, pos: Vec3, size: Vec3) => void,
}> = ({ gripPos, pos, size, onResize, centerY }) => {
    let { mtx } = useViewLayout();
    let [el, setEl] = React.useState<HTMLElement | null>(null);

    function evToModel(ev: IPointerEvent) {
        return mtx.mulVec3Inv(new Vec3(ev.clientX, ev.clientY));
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, _ev => ({ size, pos }), (ev, ds, end) => {
        let oldPos = ds.data.pos;
        let oldSize = ds.data.size;
        let delta = evToModel(ev).sub(evToModel(ds)).round();
        let isHoriz = gripPos === PortPlacement.Left || gripPos === PortPlacement.Right;

        if (isHoriz) {
            delta.y = 0;
        } else {
            delta.x = 0;
        }

        if (gripPos === PortPlacement.Left) {
            onResize(end, oldPos.add(delta), oldSize.sub(delta));
        } else if (gripPos === PortPlacement.Right) {
            onResize(end, oldPos, oldSize.add(delta));
        } else if (gripPos === PortPlacement.Top) {
            onResize(end, oldPos.add(delta), oldSize.mulAdd(delta, centerY ? -2 : -1));
        } else {
            onResize(end, oldPos.mulAdd(delta, centerY ? -1 : 0), oldSize.mulAdd(delta, centerY ? 2 : 1));
        }
        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.preventDefault();
        ev.stopPropagation();
    }

    let isVertical = gripPos === PortPlacement.Left || gripPos === PortPlacement.Right;
    let classNameHit = clsx(
        "group absolute pointer-events-auto flex items-center justify-center",
        isVertical ? "cursor-ew-resize my-auto top-0 bottom-0 h-12 w-6" : "cursor-ns-resize mx-auto left-0 right-0 h-6 w-12",
        gripPos === PortPlacement.Left && "left-0 -translate-x-1/2",
        gripPos === PortPlacement.Right && "right-0 translate-x-1/2",
        gripPos === PortPlacement.Top && "top-0 -translate-y-1/2",
        gripPos === PortPlacement.Bottom && "bottom-0 translate-y-1/2",
    );

    let className = clsx(
        "bg-blue-200 hover:bg-blue-300 rounded-xs flex items-center justify-center",
        isVertical ? "h-6 w-2" : "h-2 w-6",
    );

    return <div className={classNameHit} ref={setEl} onMouseDown={handleMouseDown}>
        <div className={className}>
            <FontAwesomeIcon icon={isVertical ? faEllipsisVertical : faEllipsis} className="text-md text-white group-hover:text-gray-100" />
        </div>
        {dragStart && <CursorDragOverlay className={isVertical ? "cursor-ew-resize" : "cursor-ns-resize"} /> }
    </div>;
}
