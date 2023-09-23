import { Vec3 } from "@/src/utils/vector";
import { PortType, IExeComp, IExePort, ICompRenderArgs } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder"
import { registerOpts, regValToStr } from "./RenderHelpers";
import { FontType, makeCanvasFont } from "../CanvasRenderHelpers";

export interface ICompDataRegFile {
    inCtrlPort: IExePort;
    outAPort: IExePort;
    outBPort: IExePort;
    inDataPort: IExePort;

    file: Uint32Array;

    writeEnabled: boolean;
    writeReg: number;
    writeData: number;

    readAReg: number; // -1 means no read
    readBReg: number;
}

export interface ICompDataSingleReg {
    outPort: IExePort;
    inPort: IExePort;
    value: number;
}

export function createRegisterComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 40;
    let reg32: ICompDef<ICompDataRegFile> = {
        defId: 'riscv/reg32',
        altDefIds: ['reg32Riscv'],
        name: "RISCV Registers",
        size: new Vec3(w, 66),
        ports: [
            { id: 'ctrl', name: 'Ctrl', pos: new Vec3(4, 0), type: PortType.In | PortType.Ctrl, width: 3 * 6 },
            { id: 'in', name: 'In', pos: new Vec3(0, 3), type: PortType.In, width: 32 },
            { id: 'outA', name: 'A', pos: new Vec3(w, 3), type: PortType.Out, width: 32 },
            { id: 'outB', name: 'B', pos: new Vec3(w, 6), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inCtrlPort: builder.getPort('ctrl'),
                inDataPort: builder.getPort('in'),
                outAPort: builder.getPort('outA'),
                outBPort: builder.getPort('outB'),

                file: new Uint32Array(32),

                writeEnabled: false,
                writeReg: 0,
                writeData: 0,
                readAReg: -1,
                readBReg: -1,
            });
            builder.addPhase(regFilePhase0, [data.inCtrlPort], [data.outAPort, data.outBPort]);
            builder.addPhase(regFilePhase1, [data.inCtrlPort, data.inDataPort], []);
            builder.addLatchedPhase(regFilePhase2Latch, [], []);
            return builder.build(data);
        },
        render: renderRegisterFile,
        copyStatefulData: (src, dest) => {
            dest.file.set(src.file);
        },
        reset: (comp) => {
            comp.data.file.fill(0);
        },
    };

    let regSingle: ICompDef<ICompDataSingleReg> = {
        defId: 'flipflop/reg1',
        altDefIds: ['reg1'],
        name: "Register",
        size: new Vec3(40, 6),
        ports: [
            { id: 'in', name: 'I', pos: new Vec3(0, 3), type: PortType.In, width: 32 },
            { id: 'out', name: 'O', pos: new Vec3(w, 3), type: PortType.Out, width: 32 },
        ],
        build: (builder) => {
            let data = builder.addData({
                inPort: builder.getPort('in'),
                outPort: builder.getPort('out'),
                value: 0,
            });
            builder.addPhase(({ data }) => {
                let outPort = data.outPort;
                outPort.value = data.value;
            }, [], [data.outPort]);

            builder.addLatchedPhase(({ data }) => {
                data.value = data.inPort.value;
            }, [data.inPort], []);
            return builder.build(data);
        },
        copyStatefulData: (src, dest) => {
            dest.value = src.value;
        },
        reset: (comp) => {
            comp.data.value = 0;
        },
        render: renderPc,
    };

    return [reg32, regSingle];
}

// inCtrl bits ((1 + 5) * 3 = 18 bits)

// phase0 reads
function regFilePhase0({ data }: IExeComp<ICompDataRegFile>) {
    let { inCtrlPort, outAPort, outBPort, file } = data;
    let ctrl = inCtrlPort.value;
    let outBitsA = (ctrl >> (1 + 0)) & 0x1f;
    let outBitsB = (ctrl >> (1 + 6)) & 0x1f;

    let outAEnabled = ctrl & 0b1;
    let outBEnabled = (ctrl >> 6) & 0b1;

    outAPort.ioEnabled = !!outAEnabled;
    outBPort.ioEnabled = !!outBEnabled;
    outAPort.value = outAEnabled ? file[outBitsA] : 0;
    outBPort.value = outBEnabled ? file[outBitsB] : 0;

    data.readAReg = outAEnabled ? outBitsA : -1;
    data.readBReg = outBEnabled ? outBitsB : -1;
}

// phase1 writes
function regFilePhase1({ data }: IExeComp<ICompDataRegFile>) {
    let ctrl = data.inCtrlPort.value;
    let inData = data.inDataPort.value;

    let inBits = (ctrl >> (1 + 12)) & 0x1f;
    let inEnabled = (ctrl >> 12) & 0b1;

    data.writeEnabled = !!inEnabled;
    data.writeReg = inBits;
    data.writeData = inData;
    data.inDataPort.ioEnabled = !!inEnabled && inBits !== 0;
}

// phase2 latches
function regFilePhase2Latch({ data }: IExeComp<ICompDataRegFile>) {
    if (data.writeEnabled && data.writeReg !== 0) {
        data.file[data.writeReg] = data.writeData;
    }
}

export const riscvRegNames = [
    'zero', 'ra', 'sp', 'gp', 'tp',
    't0', 't1', 't2',
    's0', 's1',
    'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    't3', 't4', 't5', 't6'
];

export const riscvInColor = '#ee39';
export const riscvOutAColor = '#3f39';
export const riscvOutBColor = '#33f9';

// 32bit pc
function renderPc({ ctx, comp, exeComp, styles }: ICompRenderArgs<ICompDataSingleReg>) {
    let padX = 1.2;
    let padY = 0.8;
    let pcValue = exeComp?.data.value ?? 0;

    let boxSize =  new Vec3(comp.size.x - 2 * padX, styles.lineHeight);
    let boxOffset = new Vec3(padX, comp.size.y / 2 - boxSize.y / 2);
    ctx.beginPath();
    ctx.rect(comp.pos.x + boxOffset.x, comp.pos.y + boxOffset.y, boxSize.x, boxSize.y);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#0004";
    ctx.fill();
    ctx.stroke();

    ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
    ctx.textAlign = 'end';
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    let xRight = comp.pos.x + boxOffset.x + boxSize.x - registerOpts.innerPadX;
    let yMid = comp.pos.y + boxOffset.y + boxSize.y / 2;
    let currText = regValToStr(pcValue);
    ctx.fillText(currText, xRight, yMid);

    ctx.textAlign = 'start';
    ctx.fillText('pc', comp.pos.x + padX + registerOpts.innerPadX, yMid);

    let xNewRight = xRight - ctx.measureText(currText).width - padX * 3;

    ctx.textAlign = 'end';
    let newValStr = regValToStr(exeComp?.data.inPort.value ?? 0);
    ctx.fillStyle = "#44c9";
    ctx.fillText(newValStr, xNewRight, yMid);
}



// x0-x31 32bit registers, each with names
function renderRegisterFile({ ctx, comp, exeComp, styles }: ICompRenderArgs<ICompDataRegFile, {}>) {
    let padX = 1.2;
    let padY = 1.0;
    let lineHeight = styles.lineHeight; // (comp.size.y - padY * 2) / 32;

    ctx.save();
    ctx.beginPath();
    ctx.rect(comp.pos.x, comp.pos.y, comp.size.x, comp.size.y);
    ctx.clip();

    for (let i = 0; i < 32; i++) {
        let regValue = exeComp?.data.file[i] ?? 0;

        let boxSize = new Vec3(comp.size.x, lineHeight).sub(new Vec3(padX * 2));
        let boxOffset = new Vec3(padX, padY + lineHeight * i);

        ctx.beginPath();
        ctx.rect(comp.pos.x + boxOffset.x, comp.pos.y + boxOffset.y, boxSize.x, boxSize.y);
        ctx.fillStyle = i === 0 ? "#ddd" : "#fff";
        ctx.strokeStyle = "#0004";
        ctx.fill();
        ctx.stroke();

        // draw transparent circle on upper right (or lower right for B)
        let drawReadCircle = (xStart: number, xEnd: number, color: string) => {
            let r = 4 / 10;
            ctx.beginPath();
            (ctx as any).roundRect(xStart, comp.pos.y + boxOffset.y + 0.2, xEnd - xStart, boxSize.y - 0.4, r);
            ctx.fillStyle = color;
            ctx.fill();
        };

        ctx.font = makeCanvasFont(styles.fontSize, FontType.Mono);
        ctx.textAlign = 'end';
        ctx.textBaseline = "middle";

        let yMid = comp.pos.y + padY + lineHeight * (i + 0.5);

        let regCurrStr = regValToStr(regValue);

        let textWidth = ctx.measureText(regCurrStr).width;
        let xRight = comp.pos.x + boxOffset.x + boxSize.x - registerOpts.innerPadX;
        let xLeft = xRight - textWidth;

        let isARead = exeComp?.data.readAReg === i;
        let isBRead = exeComp?.data.readBReg === i;
        let xMid = (xLeft + xRight) / 2;

        if (isARead) {
            drawReadCircle(xLeft, isBRead ? xMid : xRight, riscvOutAColor);
        }
        if (isBRead) {
            drawReadCircle(isARead ? xMid : xLeft, xRight, riscvOutBColor);
        }

        ctx.fillStyle = (i > 0 && regValue === 0) ? '#0007' : "#000";
        ctx.fillText(regCurrStr, xRight, yMid + 0.1);

        if (i > 0 && exeComp?.data.writeEnabled && i === exeComp.data.writeReg) {

            let writeStr = regValToStr(exeComp.data.writeData);
            let writeTextWidth = ctx.measureText(writeStr).width;
            let xNewRight = xRight - textWidth - padX * 3;

            drawReadCircle(xNewRight - writeTextWidth - 0.2, xNewRight + 0.2, riscvInColor);

            ctx.textAlign = 'end';
            ctx.fillStyle = "#883f";
            ctx.fillText(writeStr, xNewRight, yMid);
        }

        ctx.fillStyle = "#000";
        let text = riscvRegNames[i];
        ctx.textAlign = 'start';
        ctx.fillText(text, comp.pos.x + boxOffset.x + registerOpts.innerPadX, yMid);
    }

    ctx.restore();
}
