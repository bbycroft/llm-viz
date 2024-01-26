import { Vec3 } from "@/src/utils/vector";
import { PortType, IExePort, CompDefFlags } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { FontType, makeCanvasFont } from "../render/CanvasRenderHelpers";
import { rotateAboutAffineInt, rotateCompIsHoriz, rotateCompPortPos, rotatePortsInPlace } from "./CompHelpers";

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
    reverse: boolean; // if true, the select button is on the other side
    bitWidth: number;
}

interface IAdderConfig extends IBaseCompConfig {
}

export function createMuxComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 2;
    let h = 4;
    let baseSize = new Vec3(w, h);
    let mux2: ICompDef<ICompDataMux, IMuxConfig> = {
        defId: 'flow/mux2',
        altDefIds: ['mux2'],
        name: "Mux",
        size: baseSize,
        flags: CompDefFlags.HasBitWidth | CompDefFlags.CanRotate,
        ports: (args) => [
            { id: 'sel', name: 'S', pos: new Vec3(1, args.reverse ? h : 0), type: PortType.In, width: 1 },

            { id: 'a', name: '0', pos: new Vec3(0, args.reverse ? 3 : 1), type: PortType.In, width: args.bitWidth },
            { id: 'b', name: '1', pos: new Vec3(0, args.reverse ? 1 : 3), type: PortType.In, width: args.bitWidth },

            { id: 'out', name: 'Z', pos: new Vec3(w, 2), type: PortType.Out, width: args.bitWidth },
        ],
        applyConfig: (comp, args) => {
            args.reverse ??= false;
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
            let mtx = rotateAboutAffineInt(comp.rotation, comp.pos);
            ctx.transform(...mtx.toTransformParams());
            // basic structure is a trapezoid, narrower on the right
            // slope passes through (1, 1) i.e. the select button, but doesn't need to be 45deg
            let slope = 0.4;
            let w = baseSize.x - 1.0;
            let h = baseSize.y;

            let yTl = 0.5 - slope * baseSize.x / 2;
            let yTr = 0.5 + slope * baseSize.x / 2;

            let yBl = h - 0.5 + slope * baseSize.x / 2;
            let yBr = h - 0.5 - slope * baseSize.x / 2;

            ctx.moveTo(0.5, yTl);
            ctx.lineTo(0.5 + w, yTr);
            ctx.lineTo(0.5 + w, yBr);
            ctx.lineTo(0.5, yBl);
            ctx.closePath();

            ctx.restore();
        },
        render: ({ comp, ctx, cvs, exeComp }) => {
            return;
            ctx.save();

            ctx.translate(comp.bb.min.x, comp.bb.min.y);

            // let mtx = rotateAboutAffineInt(comp.args.rotate, baseSize);
            // ctx.transform(...mtx.toTransformParams());

            let x = 0;
            let y = 0;

            let srcPort = comp.ports[exeComp?.data.inSelPort.value ? 2 : 1];
            let destPort = comp.ports[3];

            let srcPos = rotateCompPortPos(comp, srcPort).sub(comp.bb.min);
            let destPos = rotateCompPortPos(comp, destPort).sub(comp.bb.min);
            let isHoriz = rotateCompIsHoriz(comp, comp.rotation === 0 || comp.rotation === 2);

            if (isHoriz) {
                srcPos.x += 0.5;
            }

            let mid = comp.bb.size().mul(0.5);

            // let dashScale = Math.min(cvs.scale, 0.03);
            ctx.beginPath();
            ctx.moveTo(x + srcPos.x, y + srcPos.y);
            if (isHoriz) {
                ctx.lineTo(x + mid.x, y + srcPos.y);
                ctx.lineTo(x + mid.x, y + destPos.y);
            } else {
                ctx.lineTo(x + srcPos.x, y + mid.y);
                ctx.lineTo(x + destPos.x, y + mid.y);
            }
            ctx.lineTo(x + destPos.x, y + destPos.y);
            // ctx.setLineDash([10 * dashScale, 10 * dashScale]);
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 * cvs.scale;
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = makeCanvasFont(0.6, FontType.Mono);
            ctx.fillStyle = '#000';
            ctx.fillText(comp.args.bitWidth.toString(), mid.x, mid.y);

            ctx.restore();
        },
    };

    return [mux2];
}
