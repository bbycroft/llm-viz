import React, { memo, useMemo } from "react";
import { StateSetter, assignImm, hasFlag } from "@/src/utils/data";
import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IComp, IEditContext, IEditorState, IExeComp, IExePort, PortType } from "../CpuModel";
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
import { makeCanvasFont } from "../CanvasRenderHelpers";
import { EditKvp } from "../CompDetails";
import { SelectEditor } from "../displayTools/SelectEditor";
import { BooleanEditor } from "../displayTools/BooleanEditor";

export enum PortPlacement {
    Right,
    Bottom,
    Left,
    Top,
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
    type: PortType;
    bitWidth: number;
    signed: boolean;
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
            let pos = portPlacementToPos(args.portPos, args.w, args.h);

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
            bitWidth: 1,
            signed: false,
            flags: CompPortFlags.None,
            valueMode: HexValueInputType.Dec,
            inputOverride: false,
            inputValueOverride: 0,
        }),
        applyConfig(comp, args) {
            args.flags ??= CompPortFlags.None;
            comp.size = new Vec3(args.w, args.h);
        },
        build: (builder) => {
            let args = builder.comp.args;
            let isInput = hasFlag(args.type, PortType.In);

            let data = builder.addData({
                port: builder.getPort('a'),
                externalPort: builder.getPort(compPortExternalPortId),
                externalPortBound: false,
                value: isInput ? args.inputValueOverride : 0,
            });

            if (isInput) {
                builder.addPhase(({ data }) => {
                    if (data.externalPortBound) {
                        data.value = data.externalPort.value;
                        data.externalPort.ioEnabled = true;
                    }
                    data.port.value = data.value;
                    data.port.ioEnabled = true;
                }, [data.externalPort], [data.port]);

            } else {
                builder.addPhase(({ data }) => {
                    data.value = data.port.value;
                    if (data.externalPortBound) {
                        data.externalPort.value = data.value;
                        data.externalPort.ioEnabled = true;
                    }
                    data.port.ioEnabled = true;
                }, [data.port], [data.externalPort]);
            }

            return builder.build();
        },
        renderAll: true,
        renderCanvasPath: ({ comp, ctx, cvs }) => {
            ctx.save();

            // let isInput = hasFlag(comp.args.type, PortType.In);
            // ctx.fillStyle = isInput ? palette.portInputBg : palette.portOutputBg;
            let p = comp.pos;
            let s = comp.size;
            ctx.roundRect(p.x, p.y, s.x, s.y, s.y / 2);
        },
        render: ({ comp, ctx, cvs }) => {
            let scale = Math.min(cvs.scale, 1/15);
            let p = comp.pos;
            let s = comp.size;

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
        <CompRectBase comp={comp} hideHover={true}>
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
        </CompRectBase>
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

    function editCompPortFlag(end: boolean, flag: CompPortFlags, value: boolean) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, {
            flags: value ? a.flags | flag : a.flags & ~flag,
        })));
    }

    let isInput = hasFlag(comp.args.type, PortType.In);

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
        <EditKvp label={"Is Input"}>
            <CheckboxMenuTitle title="" value={isInput} update={editPortType} />
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
    comp: IComp<{ w: number, h: number, portPos: PortPlacement }>,
}> = memo(function PortResizer({ editCtx, comp }) {

    let [editorState, setEditorState] = useEditorContext();

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
