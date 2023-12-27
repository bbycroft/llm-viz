import { Vec3 } from "@/src/utils/vector";
import { PortType, IExePort, CompDefFlags } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";
import { rotateAboutAffineInt, rotatePortsInPlace } from "./CompHelpers";

interface ICompDataMux {
    inSelPort: IExePort;
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

interface ICompDataAdder {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

interface IMuxConfig extends IBaseCompConfig {
    rotate: number; // 0, 1, 2, 3
    bitWidth: number;
}

interface IAdderConfig extends IBaseCompConfig {
}

export function createMuxComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 2;
    let h = 6;
    let baseSize = new Vec3(w, h);
    let mux2: ICompDef<ICompDataMux, IMuxConfig> = {
        defId: 'flow/mux2',
        altDefIds: ['mux2'],
        name: "Mux",
        size: baseSize,
        flags: CompDefFlags.HasBitWidth | CompDefFlags.CanRotate,
        ports: (args) => [
            { id: 'sel', name: 'S', pos: new Vec3(1, 1), type: PortType.In, width: 1 },

            { id: 'a', name: '0', pos: new Vec3(0, 2), type: PortType.In, width: args.bitWidth },
            { id: 'b', name: '1', pos: new Vec3(0, 4), type: PortType.In, width: args.bitWidth },

            { id: 'out', name: 'Z', pos: new Vec3(w, 3), type: PortType.Out, width: args.bitWidth },
        ],
        applyConfig: (comp, args) => {
            rotatePortsInPlace(comp, args.rotate, baseSize);
            if (args.rotate === 1 || args.rotate === 2) {
                let portAPos = comp.ports[1].pos;
                comp.ports[1].pos = comp.ports[2].pos;
                comp.ports[2].pos = portAPos;
            }

            args.rotate ??= 0;
            args.bitWidth ??= 32;
        },
        build: (builder) => {
            let data = builder.addData({
                inSelPort: builder.getPort('sel'),
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inSelPort, inAPort, inBPort, outPort } }) => {
                let isAPort = inSelPort.value === 0;
                outPort.value = isAPort ? inAPort.value : inBPort.value;
                inAPort.ioEnabled = isAPort;
                inBPort.ioEnabled = !isAPort;
            }, [data.inSelPort, data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
        renderCanvasPath: ({ comp, ctx }) => {
            ctx.save();

            ctx.translate(comp.pos.x, comp.pos.y);
            let mtx = rotateAboutAffineInt(comp.args.rotate, baseSize);
            ctx.transform(...mtx.toTransformParams());
            // basic structure is a trapezoid, narrower on the right
            // slope passes through (1, 1) i.e. the select button, but doesn't need to be 45deg
            let slope = 0.9;
            let w = baseSize.x;
            let h = baseSize.y;

            let yTl = 1 - slope * baseSize.x / 2;
            let yTr = 1 + slope * baseSize.x / 2;

            let yBl = h - 1 + slope * baseSize.x / 2;
            let yBr = h - 1 - slope * baseSize.x / 2;

            ctx.moveTo(0, yTl);
            ctx.lineTo(0 + w, yTr);
            ctx.lineTo(0 + w, yBr);
            ctx.lineTo(0, yBl);
            ctx.closePath();

            ctx.restore();
        },
        render: ({ comp, ctx, cvs, exeComp }) => {
            ctx.save();

            ctx.translate(comp.pos.x, comp.pos.y);

            // let mtx = rotateAboutAffineInt(comp.args.rotate, baseSize);
            // ctx.transform(...mtx.toTransformParams());

            let x = 0;
            let y = 0;

            let srcPos = comp.ports[exeComp?.data.inSelPort.value ? 2 : 1].pos;
            let destPos = comp.ports[3].pos;

            let xMid = comp.size.x / 2;
            let yMid = comp.size.y / 2;

            // let dashScale = Math.min(cvs.scale, 0.03);
            ctx.beginPath();
            ctx.moveTo(x + srcPos.x, y + srcPos.y);
            if (comp.args.rotate === 0 || comp.args.rotate === 2) {
                ctx.lineTo(x + xMid, y + srcPos.y);
                ctx.lineTo(x + xMid, y + destPos.y);
            } else {
                ctx.lineTo(x + srcPos.x, y + yMid);
                ctx.lineTo(x + destPos.x, y + yMid);
            }
            ctx.lineTo(x + destPos.x, y + destPos.y);
            // ctx.setLineDash([10 * dashScale, 10 * dashScale]);
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = makeCanvasFont(1.0, FontType.Mono);
            ctx.fillStyle = '#000';
            ctx.fillText(comp.args.bitWidth.toString(), xMid, yMid);

            ctx.restore();
        },
    };

    let aW = 4;
    let aH = 6;
    let adder: ICompDef<ICompDataAdder, IAdderConfig> = {
        defId: 'math/adder',
        altDefIds: ['adder'],
        name: "+",
        size: new Vec3(aW, aH),
        ports: [
            { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
            { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 32 },

            { id: 'out', name: 'O', pos: new Vec3(aW, 4), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                outPort.value = inAPort.value + inBPort.value;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
    };


    return [mux2, adder];
}
