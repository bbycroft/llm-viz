import { Vec3 } from "@/src/utils/vector";
import { CompDefFlags, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { createBitWidthMask, rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";

interface IBinGateConfig extends IBaseCompConfig {
    rotate: number; // 0, 1, 2, 3
    bitWidth: number;
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

export function createBinaryGateComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let wOrig = 4;
    let hOrig = 4;
    let baseSize = new Vec3(wOrig, hOrig);
    let orGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/or',
        altDefIds: ['or'],
        name: "Or",
        size: new Vec3(wOrig, hOrig),
        flags: (args) => CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | (args.bitWidth === 1 ? CompDefFlags.IsAtomic : 0),
        ports: (args) => [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: args.bitWidth },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: args.bitWidth },
            { id: 'o', name: '', pos: new Vec3(wOrig, 2), type: PortType.Out, width: args.bitWidth },
        ],
        initConfig: () => ({ rotate: 0, bitWidth: 1 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, baseSize);
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
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();
            ctx.translate(comp.pos.x, comp.pos.y);

            let mtx = rotateAboutAffineInt(comp.rotation, baseSize);
            ctx.transform(...mtx.toTransformParams());

            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.23;
            let x = 0.5 + -dx;
            let y = 0.5;
            let rightX = x + wOrig - 1;
            let w = wOrig + dx - 1;
            let h = hOrig - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            ctx.lineTo(x + w, y + h / 2);

            ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            ctx.closePath();
            ctx.restore();
        },
        // renderDom: ({ comp, exeComp, editCtx, isActive }) => {

        //     return <CompRectBase comp={comp} hideHover>
        //         <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
        //     </CompRectBase>;
        // },
    };

    let xorGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/xor',
        altDefIds: ['xor'],
        name: "Xor",
        size: new Vec3(wOrig, hOrig),
        flags: (args) => CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | (args.bitWidth === 1 ? CompDefFlags.IsAtomic : 0),
        ports: (args) => [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: args.bitWidth },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: args.bitWidth },
            { id: 'o', name: '', pos: new Vec3(wOrig, 2), type: PortType.Out, width: args.bitWidth },
        ],
        initConfig: () => ({ rotate: 0, bitWidth: 1 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, baseSize);
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
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();
            ctx.translate(comp.pos.x, comp.pos.y);

            let mtx = rotateAboutAffineInt(comp.rotation, baseSize);
            ctx.transform(...mtx.toTransformParams());

            // basic structure is a trapezoid, narrower on the right, with slopes of 45deg
            let dx = 0.23;
            let x = 0.5 - dx;
            let y = 0.5;
            let rightX = x + wOrig - 1;
            let w = wOrig + dx - 1;
            let h = hOrig - 1;
            let frontRad = h * 0.9;
            ctx.moveTo(x, y);
            ctx.arcTo(rightX - 1, y    , x + w, y + h / 2, frontRad);
            ctx.lineTo(x + w, y + h / 2);

            ctx.arcTo(rightX - 1, y + h, x    , y + h, frontRad);
            ctx.lineTo(x, y + h);
            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);
            ctx.lineTo(x, y);

            // ctx.fill();

            let arcX = x - 0.25;
            ctx.moveTo(arcX, y + h);
            ctx.arcTo(arcX + 0.7, y + h / 2, arcX, y, h * 0.8);
            ctx.lineTo(arcX, y);
            ctx.arcTo(arcX + 0.7, y + h / 2, arcX, y + h, h * 0.8);
            ctx.lineTo(arcX, y + h);

            // ctx.stroke();
            ctx.restore();
        },
        // renderDom: ({ comp, exeComp, editCtx, isActive }) => {

        //     return <CompRectBase comp={comp} hideHover>
        //         <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
        //     </CompRectBase>;
        // },
    };

    let andGate: ICompDef<IBinGateData, IBinGateConfig> = {
        defId: 'gate/and',
        altDefIds: ['and'],
        name: "And",
        size: new Vec3(wOrig, hOrig),
        flags: (args) => CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | (args.bitWidth === 1 ? CompDefFlags.IsAtomic : 0),
        ports: (args) => [
            { id: 'a', name: '', pos: new Vec3(0, 1), type: PortType.In, width: args.bitWidth },
            { id: 'b', name: '', pos: new Vec3(0, 3), type: PortType.In, width: args.bitWidth },
            { id: 'o', name: '', pos: new Vec3(wOrig, 2), type: PortType.Out, width: args.bitWidth },
        ],
        initConfig: () => ({ rotate: 0, bitWidth: 1 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, baseSize);
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
        renderCanvasPath: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();
            ctx.translate(comp.pos.x, comp.pos.y);

            let mtx = rotateAboutAffineInt(comp.rotation, baseSize);
            ctx.transform(...mtx.toTransformParams());

            let dx = 0.0;
            let x = 0.5 - dx;
            let y = 0.5;
            let rightX = x + wOrig - 1;
            let w = wOrig + dx - 1;
            let h = hOrig - 1;
            ctx.moveTo(x, y);
            ctx.lineTo(x + w * 0.4, y);
            ctx.arc(rightX - h/2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x, y);

            ctx.closePath();
            ctx.restore();
        },
        // renderDom: ({ comp, exeComp, editCtx, isActive }) => {

        //     return <CompRectBase comp={comp} hideHover>
        //         <BinGate editCtx={editCtx} comp={comp} exeComp={exeComp} isActive={isActive} />
        //     </CompRectBase>;
        // },
    };

    let notW = 3;
    let notH = 2;
    let notBaseSize = new Vec3(notW, notH);
    let notGate: ICompDef<INotGateData, IBinGateConfig> = {
        defId: 'gate/not',
        altDefIds: ['not'],
        name: "Not",
        size: new Vec3(notW, notH),
        flags: (args) => CompDefFlags.CanRotate | CompDefFlags.HasBitWidth | (args.bitWidth === 1 ? CompDefFlags.IsAtomic : 0),
        ports: (args) => [
            { id: 'i', name: '', pos: new Vec3(0, notH/2), type: PortType.In, width: args.bitWidth },
            { id: 'o', name: '', pos: new Vec3(notW, notH/2), type: PortType.Out, width: args.bitWidth },
        ],
        initConfig: () => ({ rotate: 0, bitWidth: 1 }),
        applyConfig(comp, args) {
            rotatePortsInPlace(comp, args.rotate, notBaseSize);
        },
        build: (builder) => {
            let mask = createBitWidthMask(builder.comp.args.bitWidth);

            let data = builder.addData({
                inPort: builder.getPort('i'),
                outPort: builder.getPort('o'),
            });

            builder.addPhase(({ data: { inPort, outPort } }) => {
                outPort.value = (~inPort.value) & mask;
            }, [data.inPort], [data.outPort]);

            return builder.build();
        },
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();
            ctx.translate(comp.pos.x, comp.pos.y);

            let mtx = rotateAboutAffineInt(comp.rotation, notBaseSize);
            ctx.transform(...mtx.toTransformParams());

            let dy = 0.7;
            let dx = 0.5;
            let x = 0.5;
            let y = -0.5 + dy;
            let w = wOrig - 1.0;
            let h = hOrig - 1.0 - dy * 2;
            let rightX = x + w - dx - 1.0;
            ctx.moveTo(x, y);
            ctx.lineTo(rightX, y + h / 2);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.moveTo(x + w - dx, y + h / 2);
            ctx.arc(rightX + dx/2, y + h / 2, dx/2, 0, Math.PI * 2);
            ctx.moveTo(rightX + dx*0.9, y + h / 2)
            ctx.arc(rightX + dx/2, y + h / 2, dx * (0.5 - 0.1), 0, Math.PI * 2);

            ctx.restore();
        },
    };

    return [orGate, xorGate, andGate, notGate];
}
