import React from "react";
import { AffineMat2d } from "@/src/utils/AffineMat2d";
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditContext, IExeComp, IExePort, PortType } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from "../Editor";
import { CompRectBase } from "./RenderHelpers";
import { assignImm } from "@/src/utils/data";
import { KeyboardOrder, isKeyWithModifiers, useGlobalKeyboard } from "@/src/utils/keyboard";

interface IBinGateConfig {
    rotate: number; // 0, 1, 2, 3
}

interface IBinGateData {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

interface INotGateData {
    inPort: IExePort;
    outPort: IExePort;
}


export function rotateAffineInt(r: number) {
    switch (r) {
        case 0: return new AffineMat2d(1, 0, 0, 1, 0, 0);
        case 1: return new AffineMat2d(0, 1, -1, 0, 0, 0);
        case 2: return new AffineMat2d(-1, 0, 0, -1, 0, 0);
        case 3: return new AffineMat2d(0, -1, 1, 0, 0, 0);
        default: return new AffineMat2d();
    }
}

export function rotateAboutAffineInt(r: number, center: Vec3) {
    return AffineMat2d.multiply(
        AffineMat2d.translateVec(center),          // 3) translate back
        rotateAffineInt(r),                        // 2) rotate
        AffineMat2d.translateVec(center.mul(-1))); // 1) translate to origin
}

export function createBinaryGateComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 3;
    let h = 4;
    let rotateCenter = new Vec3(1, 2);
    let orGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/or',
        altDefIds: ['or'],
        name: "Or",
        size: new Vec3(w, h),
        ports: [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: 1 },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: 1 },
            { id: 'o', name: '', pos: new Vec3(w, 2), type: PortType.Out, width: 1 },
        ],
        initConfig: () => ({ rotate: 0 }),
        applyConfig(comp, args) {
            let mat = rotateAboutAffineInt(args.rotate, rotateCenter);
            comp.ports = comp.ports.map(p => {
                return { ...p, pos: mat.mulVec3(p.pos) }
            });
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value | inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            ctx.transform(...mtx.toTransformParams());

            ctx.beginPath();
            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.2;
            let x = comp.pos.x - dx;
            let y = comp.pos.y + 0.5;
            let rightX = x + comp.size.x;
            let w = comp.size.x + dx;
            let h = comp.size.y - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            ctx.lineTo(x + w, y + h / 2);

            ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        renderDom: ({ comp, exeComp, editCtx, isActive }) => {

            return <CompRectBase comp={comp} hideHover>
                <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
            </CompRectBase>;
        },
    };

    let xorGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/xor',
        altDefIds: ['xor'],
        name: "Xor",
        size: new Vec3(w, h),
        ports: [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: 1 },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: 1 },
            { id: 'o', name: '', pos: new Vec3(w, 2), type: PortType.Out, width: 1 },
        ],
        initConfig: () => ({ rotate: 0 }),
        applyConfig(comp, args) {
            let mat = rotateAboutAffineInt(args.rotate, rotateCenter);
            comp.ports = comp.ports.map(p => {
                return { ...p, pos: mat.mulVec3(p.pos) }
            });
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value ^ inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            ctx.transform(...mtx.toTransformParams());

            ctx.beginPath();
            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.2;
            let x = comp.pos.x - dx;
            let y = comp.pos.y + 0.5;
            let rightX = x + comp.size.x;
            let w = comp.size.x + dx;
            let h = comp.size.y - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            ctx.lineTo(x + w, y + h / 2);

            ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            ctx.closePath();

            ctx.fill();

            ctx.moveTo(x - 0.5, y + h);
            ctx.arcTo(x + 0.7 - 0.5, y + h / 2, x - 0.5, y, h * 0.8);
            ctx.lineTo(x - 0.5, y);

            ctx.stroke();
            ctx.restore();
        },
        renderDom: ({ comp, exeComp, editCtx, isActive }) => {

            return <CompRectBase comp={comp} hideHover>
                <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
            </CompRectBase>;
        },
    };

    let andGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/and',
        altDefIds: ['and'],
        name: "And",
        size: new Vec3(w, h),
        ports: [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: 1 },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: 1 },
            { id: 'o', name: '', pos: new Vec3(w, 2), type: PortType.Out, width: 1 },
        ],
        initConfig: () => ({ rotate: 0 }),
        applyConfig(comp, args) {
            let mat = rotateAboutAffineInt(args.rotate, rotateCenter);
            comp.ports = comp.ports.map(p => {
                return { ...p, pos: mat.mulVec3(p.pos) }
            });
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value & inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            let mtx = rotateAboutAffineInt(comp.args.rotate, comp.pos.add(rotateCenter));
            ctx.transform(...mtx.toTransformParams());

            ctx.beginPath();
            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.0;
            let x = comp.pos.x - dx;
            let y = comp.pos.y + 0.5;
            let rightX = x + comp.size.x;
            let w = comp.size.x + dx;
            let h = comp.size.y - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.lineTo(x + w * 0.4, y);
            ctx.arc(rightX - h/2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
            // ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            // ctx.lineTo(x + w, y + h / 2);

            // ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x, y);
            // ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        renderDom: ({ comp, exeComp, editCtx, isActive }) => {

            return <CompRectBase comp={comp} hideHover>
                <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
            </CompRectBase>;
        },
    };

    let notW = 3;
    let notH = 4;
    let notGate: ICompDef<INotGateData> = {
        defId: 'gate/not',
        altDefIds: ['not'],
        name: "NOT",
        size: new Vec3(notW, notH),
        ports: [
            { id: 'i', name: '', pos: new Vec3(0, notH/2), type: PortType.In, width: 1 },
            { id: 'o', name: '', pos: new Vec3(notW, notH/2), type: PortType.Out, width: 1 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inPort: builder.getPort('i'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inPort, outPort } }) => {
                outPort.value = !inPort.value ? 1 : 0;
            }, [data.inPort], [data.outPort]);

            return builder.build();
        },
        renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.beginPath();
            let dy = 0.7;
            let dx = 0.5;
            let x = comp.pos.x;
            let y = comp.pos.y + dy;
            let rightX = x + comp.size.x - dx;
            let w = comp.size.x;
            let h = comp.size.y - dy * 2;
            ctx.moveTo(x, y);
            ctx.lineTo(rightX, y + h / 2);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.moveTo(x + w, y + h / 2);
            ctx.arc(rightX + dx/2, y + h / 2, dx/2, 0, Math.PI * 2);
            ctx.moveTo(rightX + dx*0.9, y + h / 2)
            ctx.arc(rightX + dx/2, y + h / 2, dx * (0.5 - 0.1), 0, Math.PI * 2);
            ctx.fill("evenodd");
            ctx.stroke();
        },
    };

    return [orGate, xorGate, andGate, notGate];
}

export const BinGate: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IBinGateConfig>,
    exeComp: IExeComp<IBinGateData>,
    isActive: boolean,
}> = ({ editCtx, comp, isActive }) => {
    let { setEditorState } = useEditorContext();


    useGlobalKeyboard(KeyboardOrder.Element, ev => {
        if (isKeyWithModifiers(ev, 'r')) {
            setEditorState(editCompConfig(editCtx, true, comp, a => assignImm(a, { rotate: (a.rotate + 1) % 4 })));
            ev.preventDefault();
            ev.stopPropagation();
        }
    }, { isActive });

    function handleRotate() {
        let newRotate = (comp.args.rotate + 1) % 4;
        setEditorState(editCompConfig(editCtx, true, comp, a => assignImm(a, { rotate: newRotate })));
    }

    return <div className={""} onClick={handleRotate}></div>;
};
