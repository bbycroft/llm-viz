import React, { memo, useMemo } from "react";
import { StateSetter, assignImm, hasFlag } from "@/src/utils/data";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IEditorState, IExeComp, IExePort, IoDir, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CheckboxMenuTitle, CompRectBase } from "./RenderHelpers";
import { editComp, editCompConfig, useEditorContext, useViewLayout } from "../Editor";
import { HexValueEditor, HexValueInputType, clampToSignedWidth } from "../displayTools/HexValueEditor";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "@/src/utils/keyboard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import clsx from "clsx";
import { IPointerEvent, useCombinedMouseTouchDrag } from "@/src/utils/pointer";
import { StringEditor } from "../displayTools/StringEditor";
import { CursorDragOverlay } from "@/src/utils/CursorDragOverlay";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";
import { EditKvp } from "../sidebars/CompDetails";
import { SelectEditor } from "../displayTools/SelectEditor";
import { BooleanEditor } from "../displayTools/BooleanEditor";
import { RectCorner } from "./SchematicComp";
import { invertRotation, rotateAffineInt, rotatePos, rotatedBbPivotPoint } from "./CompHelpers";
import { ButtonRadio, ButtonStandard } from "../sidebars/EditorControls";

export enum PortPlacement {
    Right = 0,
    Bottom = 1,
    Left = 2,
    Top = 3,
}

export enum CompPortFlags {
    None = 0,
    HiddenInParent = 1 << 0, // hide when rendering inside the component
    NearParentPort = 1 << 1, // the port's location matches the parent's location at least roughly, and we'll draw a line between them
    MoveWithParentPort = 1 << 2, // when the parent (or the parent-port itself) is moved, the port moves with it
}

export interface ICompPortConfig extends IBaseCompConfig {
    portId: string;
    name: string;
    w: number;
    h: number;
    flags: CompPortFlags;
    portPos: PortPlacement;
    rotate: PortPlacement;
    type: PortType;
    bitWidth: number;
    signed: boolean;
    tristateOrder: TristateOrder;
    inputValueOverride: number;
    valueMode: HexValueInputType;
}

export enum TristateOrder {
    None = 0,
    ReadThenWrite = 1,
    WriteThenRead = 2,
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
export const compPortExternalPortId = '_b';

export function createCompIoComps(args: ICompBuilderArgs) {

    let w = 6;
    let h = 6;
    let compPort: ICompDef<ICompPortData, ICompPortConfig> = {
        defId: 'comp/port',
        name: "Port",
        size: new Vec3(w, h),
        flags: CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | CompDefFlags.IsAtomic,
        ports: (args, compDef) => {

            let internalPortDir = switchPortDir(args.type);
            let pos = portPlacementToPos(0, args.w, args.h);

            return [
                { id: 'a', name: '', pos, type: internalPortDir, width: args.bitWidth },
                { id: compPortExternalPortId, name: '', pos: new Vec3(NaN, NaN), type: args.type | PortType.Hidden, width: args.bitWidth },
            ];
        },
        initConfig: () => ({
            portId: '',
            name: '',
            w: 6,
            h: 6,
            type: PortType.Out,
            portPos: PortPlacement.Right,
            rotate: 0,
            bitWidth: 1,
            signed: false,
            tristateOrder: TristateOrder.None,
            flags: CompPortFlags.None,
            valueMode: HexValueInputType.Dec,
            inputOverride: false,
            inputValueOverride: 0,
        }),
        applyConfig(comp, args) {
            args.flags ??= CompPortFlags.None;
            args.rotate ??= args.portPos ?? PortPlacement.Right;
            comp.size = new Vec3(args.w, args.h);
        },
        build: (builder) => {
            let args = builder.comp.args;
            let isInput = hasFlag(args.type, PortType.In);
            let isTristate = hasFlag(args.type, PortType.Tristate);
            let readThenWrite = args.tristateOrder === TristateOrder.ReadThenWrite;
            let writeThenRead = args.tristateOrder === TristateOrder.WriteThenRead;
            let tristateOut = isTristate && !isInput;

            let defaultValue = isInput ? args.inputValueOverride : 0;

            let data = builder.addData({
                port: builder.getPort('a'),
                externalPort: builder.getPort(compPortExternalPortId),
                externalPortBound: false,
                value: defaultValue,
            });

            function addCopyInPhase() {
                builder.addPhase(({ data }) => {
                    if (data.externalPortBound) {
                        data.value = data.externalPort.value;
                        if (isTristate) {
                            data.port.ioEnabled = true; // data.externalPort.ioEnabled;
                            // data.port.ioDir = data.port.floating ? IoDir.Out : IoDir.In;
                            // data.port.ioDir = IoDir.In; // switchIoDir(data.externalPort.ioDir);
                        }
                    } else if (isTristate && writeThenRead && data.port.floating) {
                        data.port.ioEnabled = true;
                    }
                    data.port.value = data.value;
                }, [data.externalPort], [data.port]);
            }

            function addCopyOutPhase() {
                builder.addPhase(({ data }) => {
                    if (data.externalPortBound) {
                        data.externalPort.value = data.value;
                        if (isTristate) {
                            data.externalPort.ioEnabled = true; // !data.port.floating;
                            data.externalPort.ioDir = data.port.floating ? IoDir.In : IoDir.Out;
                        }
                    }
                    if (isTristate) {
                        data.port.ioDir = data.port.floating ? IoDir.Out : IoDir.In;
                        data.value = data.port.floating ? defaultValue : data.port.value;
                        data.port.ioEnabled = true;
                    } else {
                        data.value = data.port.value;
                    }
                }, [data.port], [data.externalPort]);
            }

            if (hasFlag(args.type, PortType.Tristate)) {
                if (!isInput) {
                    addCopyOutPhase(); // out only; treat as a regular output

                } else if (args.tristateOrder === TristateOrder.ReadThenWrite) {
                    addCopyInPhase();
                    addCopyOutPhase();
                } else {
                    addCopyOutPhase();
                    addCopyInPhase();
                }
            } else {
                if (isInput) {
                    addCopyInPhase();
                } else {
                    addCopyOutPhase();
                }
            }

            return builder.build();
        },
        // renderAll: true,
        renderCanvasPath: ({ comp, ctx, cvs }) => {
            ctx.save();

            ctx.translate(comp.pos.x, comp.pos.y);
            ctx.transform(...rotateAffineInt(comp.rotation).toTransformParams());

            // let isInput = hasFlag(comp.args.type, PortType.In);
            // ctx.fillStyle = isInput ? palette.portInputBg : palette.portOutputBg;
            let p = new Vec3(0.5, 0.5);
            let s = new Vec3(comp.size.x - 1, comp.size.y - 1);
            ctx.roundRect(p.x, p.y, s.x, s.y, s.y / 2);
            ctx.restore();
        },
        render: ({ comp, exeComp, ctx, cvs, styles }) => {
            ctx.save();

            let scale = Math.min(cvs.scale, 1/15);
            let p = comp.bb.min; // new Vec3(comp.pos.x + 0.5, comp.pos.y + 0.5);
            let s = comp.bb.size(); //new Vec3(comp.size.x - 1, comp.size.y - 1);

            ctx.fillStyle = 'black';
            ctx.font = makeCanvasFont(scale * 14);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(comp.args.name, p.x + s.x / 2, p.y + s.y + 0.3);

            ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let value = exeComp?.data.value ?? 0;
            let valueStr: string;
            if (comp.args.valueMode === HexValueInputType.Bin) {
                valueStr = value.toString(2).padStart(comp.args.bitWidth, '0');
            } else if (comp.args.valueMode === HexValueInputType.Dec) {
                valueStr = value.toString();
            } else {
                valueStr = '0x' + value.toString(16).padStart(Math.ceil(comp.args.bitWidth / 4), '0');
            }
            ctx.fillText(valueStr, p.x + s.x / 2, p.y + s.y / 2 + 0.1);

            ctx.restore();
        },
        renderDom: ({ comp, exeComp, ctx, styles, isActive, editCtx }) => {
            return isActive ? <PortEditor editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} /> : null;
        },
        renderOptions: ({ comp, exeComp, editCtx }) => {
            return <PortOptions comp={comp} editCtx={editCtx} exeComp={exeComp} />;
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

export function switchIoDir(dir: IoDir) {
    return dir === IoDir.In ? IoDir.Out : dir === IoDir.Out ? IoDir.In : IoDir.None;
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
    let [, setEditorState] = useEditorContext();

    function editValueOverride(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { inputValueOverride: clampToSignedWidth(value, a.bitWidth, a.signed), valueMode })));
    }

    let isInput = hasFlag(comp.args.type, PortType.In);
    let isBound = exeComp?.data.externalPortBound ?? false;

    return <>
        {/* <CompRectBase comp={comp} hideHover={true}>
            {isInput && <HexValueEditor
                className={clsx("absolute inset-0 px-2")}
                inputType={comp.args.valueMode}
                value={isBound ? exeComp.data.value : comp.args.inputValueOverride}
                update={editValueOverride}
                minimalBackground
                readonly={isBound}
                inputClassName={clsx("text-center", isActive ? "pointer-events-auto" : "pointer-events-none")}
                maxBits={comp.args.bitWidth}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
                hidePrefix
            />}
            {!isInput && <HexValueEditor
                className={clsx("absolute inset-0 px-2")}
                value={exeComp?.data.value ?? 0}
                minimalBackground
                inputClassName={clsx("text-center", isActive ? "pointer-events-auto" : "pointer-events-none")}
                update={(end, _val, inputType) => editValueOverride(end, comp.args.inputValueOverride, inputType)}
                inputType={comp.args.valueMode}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
                readonly
                hidePrefix
            />}
        </CompRectBase> */}
        {isActive && <PortResizer editCtx={editCtx} comp={comp} />}
    </>;
});

const PortOptions: React.FC<{
    editCtx: IEditContext,
    comp: IComp<ICompPortConfig>,
    exeComp: IExeComp<ICompPortData> | null,
}> = memo(function PortOptions({ editCtx, exeComp, comp }) {
    let [editorState, setEditorState] = useEditorContext();

    let snapshot = editorState.snapshot;

    let editPortType = makeEditFunction(setEditorState, editCtx, comp, (portType: PortType, prev) => {
            let type = prev.type;
            if (portType === PortType.In) {
                type |= PortType.In;
                type &= ~(PortType.Out | PortType.Tristate);
            } else if (portType === PortType.Out) {
                type |= PortType.Out;
                type &= ~(PortType.In | PortType.Tristate);
            } else {
                type |= PortType.Tristate | PortType.Out;
            }
            return { type };
    });

    let editTristateMode = makeEditFunction(setEditorState, editCtx, comp, (order: TristateOrder, prev) => {
            let type = prev.type;
            let tristateOrder = order;
            if (order === TristateOrder.None) {
                type &= ~PortType.In;
            } else {
                type |= PortType.In;
            }
            return { type, tristateOrder };
    });

    function editValueOverride(end: boolean, value: number, valueMode: HexValueInputType) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { inputValueOverride: clampToSignedWidth(value, a.bitWidth, a.signed), valueMode })));
    }

    function editCompPortFlag(end: boolean, flag: CompPortFlags, value: boolean) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, {
            flags: value ? a.flags | flag : a.flags & ~flag,
        })));
    }

    let parentComp = snapshot.mainSchematic.parentComp;
    let parentPorts = parentComp?.ports ?? snapshot.mainSchematic.compPorts;

    let existingCompPorts = useMemo(() => {
        return snapshot.mainSchematic.comps
            .filter(c => c.defId === compPortDefId && c.id !== comp.id);
    }, [snapshot.mainSchematic.comps, comp.id]);

    interface IPortOption {
        value: string;
        label: React.ReactNode;
        alreadyUsed: boolean;
    }

    let portOptions: IPortOption[] = useMemo(() => {
        let existingPortIds = new Set(existingCompPorts.filter(c => !!c.args.portId).map(c => c.args.portId));

        return parentPorts.map(p => {
            return {
                value: p.id,
                label: <><span className="mr-4">{p.name}</span> (<span className="font-mono">{p.id}</span>)</>,
                alreadyUsed: p.id !== comp.args.portId && !existingPortIds.has(p.id),
            };
        });
    }, [parentPorts, existingCompPorts, comp.args.portId]);

    let isTristate = hasFlag(comp.args.type, PortType.Tristate);
    let isInput = hasFlag(comp.args.type, PortType.In);
    let IsOutput = hasFlag(comp.args.type, PortType.Out);

    let modes = [
        { label: 'Input', active: !isTristate && isInput, value: PortType.In },
        { label: 'Output', active: !isTristate && IsOutput, value: PortType.Out },
        { label: 'Tristate', active: isTristate, value: PortType.Tristate },
    ];

    let tristateModes = [
        { label: 'Output only', value: TristateOrder.None + '' },
        { label: 'Read then write', value: TristateOrder.ReadThenWrite + '' },
        { label: 'Write then read', value: TristateOrder.WriteThenRead + '' },
    ];

    let tristateOrder = comp.args.tristateOrder ?? TristateOrder.None;

    return <>
        <div className="border-t mx-8" />
        <EditKvp label={"Port Id"}>
            <SelectEditor
                className="bg-slate-100 rounded flex-1"
                options={portOptions}
                allowCustom
                allowEmpty
                placeholder="Select Port..."
                value={comp.args.portId}
                update={makeEditFunction(setEditorState, editCtx, comp, (value: string) => ({ portId: value }))}
            />
        </EditKvp>
        <EditKvp label={"Hidden"}>
            <BooleanEditor value={hasFlag(comp.args.flags, CompPortFlags.HiddenInParent)} update={(end, v) => editCompPortFlag(end, CompPortFlags.HiddenInParent, v)}/>
        </EditKvp>
        <EditKvp label={"Near Parent"}>
            <BooleanEditor value={hasFlag(comp.args.flags, CompPortFlags.NearParentPort)} update={(end, v) => editCompPortFlag(end, CompPortFlags.NearParentPort, v)}/>
        </EditKvp>
        <div className="border-t mx-8" />
        <EditKvp label={"Mode"}>
            {/* <BooleanEditor value={isInput} update={(end, v) => editPortType(end, v)} /> */}
            <div className="flex flex-col">

                <div className="flex flex-row">
                {modes.map((mode, i) => {
                    return <ButtonRadio key={i} active={mode.active} onClick={() => editPortType(true, mode.value)}>{mode.label}</ButtonRadio>;
                })}
                </div>

                {isTristate && <SelectEditor
                    className="bg-slate-100 rounded flex-1"
                    options={tristateModes}
                    value={tristateOrder + ''}
                    update={(end, v) => editTristateMode(end, parseInt(v, 10))}
                />}

            </div>
            {/*
                - Actually have a number of input/output states!
                - Input
                - Output
                - Tristate
                  - Output only
                  - Input & output: copy-out then copy-in
                  - Input & output: copy-in then copy-out
             */}

        </EditKvp>
        <EditKvp label={"Default"}>
            <HexValueEditor
                className="bg-slate-100 rounded flex-1"
                inputType={comp.args.valueMode}
                value={comp.args.inputValueOverride}
                update={editValueOverride}
                maxBits={comp.args.bitWidth}
                padBits={comp.args.bitWidth}
                signed={comp.args.signed}
            />
        </EditKvp>
        <div className="border-t mx-8" />
        {exeComp && <div className="flex flex-col">
            <div>Ports</div>
            <div className="flex flex-col">
                {exeComp.ports.map((p, id) => {
                    let port = comp.ports[p.portIdx];
                    return <div className="mx-2 my-1" key={p.portIdx}>
                        <div>Port <span className="font-mono">{port.id}</span>{port.name && <> ({port.name})</>}
                            &nbsp;
                            {hasFlag(port.type, PortType.In) ? 'IN' : '' }
                            {hasFlag(port.type, PortType.Out) ? 'OUT' : '' }
                            {hasFlag(port.type, PortType.Tristate) ? 'TRI' : '' }
                            </div>
                        <div className="ml-4 font-mono">io:{p.ioEnabled ? '1' : '0'}, du:{p.dataUsed ? '1' : '0'}, V:0x{p.value.toString(16)}</div>
                    </div>;
                })}
            </div>
        </div>}
    </>;
});

export const PortResizer: React.FC<{
    editCtx: IEditContext,
    comp: IComp<{ w: number, h: number }>,
}> = memo(function PortResizer({ editCtx, comp }) {

    let [editorState, setEditorState] = useEditorContext();

    let scale = editorState.mtx.a;

    function handleResize(end: boolean, pos: Vec3, size: Vec3) {
        setEditorState(editComp(editCtx, end, comp, a => {
            let p0 = new Vec3(pos.x - 0.5, pos.y - 0.5);
            let p1 = new Vec3(p0.x + size.x + 1, p0.y + size.y + 1);
            let bb = new BoundingBox3d(p0, p1);
            let size2 = bb.size(); // p1Unrotated.sub(p0Unrotated).abs();
            if (comp.rotation === 1 || comp.rotation === 3) {
                size2 = new Vec3(size2.y, size2.x);
            }

            return assignImm(a, {
                pos: rotatedBbPivotPoint(comp.rotation, bb),
                args: assignImm(a.args, { w: Math.max(2, size2.x), h: Math.max(2, size2.y) }),
                size,
            });
        }));
    }

    let pos = comp.bb.min;
    let size = comp.bb.size();

    return <div className="absolute origin-top-left" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${1/scale})`, width: size.x * scale, height: size.y * scale }}>
        {[...new Array(4)].map((_, idx) => {
            // return <SideGripper key={idx} gripPos={idx} size={comp.size} pos={comp.pos} onResize={handleResize} centerY />;
            return <CornerGripper key={idx} gripPos={1 << idx} size={size} pos={pos} onResize={handleResize} />;
        })}
    </div>;
});

export const SideGripper: React.FC<{
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


export const CornerGripper: React.FC<{
    gripPos: RectCorner,
    pos: Vec3,
    size: Vec3,
    onResize: (end: boolean, pos: Vec3, size: Vec3) => void,
}> = ({ gripPos, pos, size, onResize }) => {
    let { mtx } = useViewLayout();
    let [el, setEl] = React.useState<HTMLElement | null>(null);

    function evToModel(ev: IPointerEvent) {
        return mtx.mulVec3Inv(new Vec3(ev.clientX, ev.clientY));
    }

    let [dragStart, setDragStart] = useCombinedMouseTouchDrag(el, _ev => ({ size, pos }), (ev, ds, end) => {
        let oldPos = ds.data.pos;
        let oldSize = ds.data.size;
        let delta = evToModel(ev).sub(evToModel(ds)).round();
        let newPos = oldPos.clone();
        let newSize = oldSize.clone();

        if (hasFlag(RectCorner.IsLeft, gripPos)) {
            newPos.x += delta.x;
            newSize.x -= delta.x;
        } else {
            newSize.x += delta.x;
        }

        if (hasFlag(RectCorner.IsTop, gripPos)) {
            newPos.y += delta.y;
            newSize.y -= delta.y;
        } else {
            newSize.y += delta.y;
        }

        onResize(end, newPos, newSize);
        ev.stopPropagation();
        ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        setDragStart(ev);
        ev.preventDefault();
        ev.stopPropagation();
    }

    let isCrossDiag = hasFlag(RectCorner.IsLeft, gripPos) !== hasFlag(RectCorner.IsTop, gripPos);

    let cursor = isCrossDiag ? "cursor-nesw-resize" : "cursor-nwse-resize";

    let classNameHit = clsx("group absolute pointer-events-auto w-8 h-8 flex items-center justify-center", cursor);

    let className = clsx(
    );

    return <div className={classNameHit} ref={setEl} onMouseDown={handleMouseDown} style={{
        transform: 'translate(-50%, -50%)',
        left: hasFlag(RectCorner.IsLeft, gripPos) ? '0' : '100%',
        top: hasFlag(RectCorner.IsTop, gripPos) ? '0' : '100%',
        }}>
        <div className={"border-2 border-blue-400 group-hover:border-blue-600 bg-white rounded-xs h-4 w-4"} />
        {dragStart && <CursorDragOverlay className={cursor} /> }
    </div>;
}
