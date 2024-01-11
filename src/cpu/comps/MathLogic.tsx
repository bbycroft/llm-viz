import React from "react";
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditContext, IExePort, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { editCompConfig, useEditorContext } from "../Editor";
import { assignImm, isNotNil } from "@/src/utils/data";
import { EditKvp } from "../sidebars/CompDetails";
import { BooleanEditor } from "../displayTools/BooleanEditor";
import { ensureUnsigned32Bit, ensureSigned32Bit } from "./CompHelpers";

interface IAdderData {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;

    carryInPort?: IExePort;
    carryOutPort?: IExePort;
}

interface IAdderConfig extends IBaseCompConfig {
    carryInPort: boolean;
    carryOutPort: boolean;
}

interface ISetLessThanData {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
    signedPort: IExePort;
}

interface ISetLessThanConfig extends IBaseCompConfig {
}

interface IShiftLeftData {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
}

interface IShiftLeftConfig extends IBaseCompConfig {
}

interface IShiftRightData {
    inAPort: IExePort;
    inBPort: IExePort;
    outPort: IExePort;
    arithPort: IExePort;
}

interface IShiftRightConfig extends IBaseCompConfig {
}


interface IComparitorData {
    inAPort: IExePort;
    inBPort: IExePort;
    signedPort: IExePort;
    outEqPort: IExePort;
    outLtPort: IExePort;
}

interface IComparitorConfig extends IBaseCompConfig {
}

export function createMathLogicComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let aW = 4;
    let aH = 6;
    let adder: ICompDef<IAdderData, IAdderConfig> = {
        defId: 'math/adder',
        altDefIds: ['adder'],
        name: "+",
        size: new Vec3(aW, aH),
        ports: (args) => {
            return [
                { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
                { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 32 },

                { id: 'out', name: 'O', pos: new Vec3(aW, 4), type: PortType.Out, width: 32 },

                args.carryInPort ? { id: 'carryIn', name: 'Cin', pos: new Vec3(0, 5), type: PortType.In, width: 1 } : null,
                args.carryOutPort ? { id: 'carryOut', name: 'Cout', pos: new Vec3(aW, 2), type: PortType.Out, width: 1 } : null,
            ].filter(isNotNil);
        },
        build: (builder) => {
            let args = builder.comp.args;
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
                carryInPort: args.carryInPort ? builder.getPort('carryIn') : undefined,
                carryOutPort: args.carryOutPort ? builder.getPort('carryOut') : undefined,
            });

            if (!args.carryInPort && !args.carryOutPort) {
                builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                    outPort.value = inAPort.value + inBPort.value;
                }, [data.inAPort, data.inBPort], [data.outPort]);
            } else {
                builder.addPhase(({ data: { inAPort, inBPort, outPort, carryInPort, carryOutPort } }) => {
                    // @TODO: need to verify this is correct
                    let a = inAPort.value;
                    let b = inBPort.value;
                    let cin = args.carryInPort ? (carryInPort!.value & 0b1) : 0;

                    let sum = a + b + cin;
                    outPort.value = sum & 0xffffffff;
                    if (args.carryOutPort) {
                        carryOutPort!.value = ensureUnsigned32Bit(sum) > 0xffffffff ? 1 : 0;
                    }
                }, [data.inAPort, data.inBPort, data.carryInPort].filter(isNotNil), [data.outPort, data.carryOutPort].filter(isNotNil));
            }

            return builder.build();
        },
        renderOptions: ({ editCtx, comp }) => {
            return <AdderOptions editCtx={editCtx} comp={comp} />;
        },
    };

    let setLessThan: ICompDef<ISetLessThanData, ISetLessThanConfig> = {
        defId: 'math/setLessThan',
        name: "<?1:0",
        size: new Vec3(aW, aH),
        ports: (args) => {
            return [
                { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
                { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 32 },
                { id: 'signed', name: 'Signed', pos: new Vec3(1, 0), type: PortType.In, width: 1 },

                { id: 'out', name: 'O', pos: new Vec3(aW, 4), type: PortType.Out, width: 32 },
            ];
        },
        build: (builder) => {
            let args = builder.comp.args;
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
                signedPort: builder.getPort('signed'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort, signedPort } }) => {
                let a = inAPort.value;
                let b = inBPort.value;

                if (signedPort.value) {
                    a = ensureSigned32Bit(a);
                    b = ensureSigned32Bit(b);
                } else {
                    a = ensureUnsigned32Bit(a);
                    b = ensureUnsigned32Bit(b);
                }

                outPort.value = a < b ? 1 : 0;
            }, [data.inAPort, data.inBPort, data.signedPort], [data.outPort]);

            return builder.build();
        },
    };

    let shiftLeft: ICompDef<IShiftLeftData, IShiftLeftConfig> = {
        defId: 'math/shiftLeft',
        name: "<<",
        size: new Vec3(aW, aH),
        ports: (args) => {
            return [
                { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
                { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 5 },
                { id: 'out', name: 'O', pos: new Vec3(aW, 4), type: PortType.Out, width: 32 },
            ];
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort } }) => {
                let a = inAPort.value;
                let b = inBPort.value;
                outPort.value = a << b;
            }, [data.inAPort, data.inBPort], [data.outPort]);

            return builder.build();
        },
    };


    let shiftRight: ICompDef<IShiftRightData, IShiftRightConfig> = {
        defId: 'math/shiftRight',
        name: ">>",
        size: new Vec3(aW, aH),
        ports: (args) => {
            return [
                { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
                { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 5 },
                { id: 'arith', name: 'Arithmetic', pos: new Vec3(1, 0), type: PortType.In, width: 1 },
                { id: 'out', name: 'O', pos: new Vec3(aW, 4), type: PortType.Out, width: 32 },
            ];
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                outPort: builder.getPort('out'),
                arithPort: builder.getPort('arith'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, outPort, arithPort } }) => {
                let a = inAPort.value;
                let b = inBPort.value;
                outPort.value = arithPort.value ? a >> b : a >>> b;
            }, [data.inAPort, data.inBPort, data.arithPort], [data.outPort]);

            return builder.build();
        },
    };

    let comparitor: ICompDef<IComparitorData, IComparitorConfig> = {
        defId: 'math/comparitor',
        name: "</=",
        size: new Vec3(aW, aH),
        ports: (args) => {
            return [
                { id: 'a', name: 'A', pos: new Vec3(0, 2), type: PortType.In, width: 32 },
                { id: 'b', name: 'B', pos: new Vec3(0, 4), type: PortType.In, width: 32 },
                { id: 'signed', name: 'Signed', pos: new Vec3(1, 0), type: PortType.In, width: 1 },
                { id: 'outEq', name: 'O EQ', pos: new Vec3(aW, 2), type: PortType.Out, width: 1 },
                { id: 'outLt', name: 'O LT', pos: new Vec3(aW, 4), type: PortType.Out, width: 1 },
            ];
        },
        build: (builder) => {
            let data = builder.addData({
                inAPort: builder.getPort('a'),
                inBPort: builder.getPort('b'),
                signedPort: builder.getPort('signed'),
                outEqPort: builder.getPort('outEq'),
                outLtPort: builder.getPort('outLt'),
            });

            builder.addPhase(({ data: { inAPort, inBPort, signedPort, outEqPort, outLtPort } }) => {
                let a = inAPort.value;
                let b = inBPort.value;

                if (signedPort.value) {
                    a = ensureSigned32Bit(a);
                    b = ensureSigned32Bit(b);
                } else {
                    a = ensureUnsigned32Bit(a);
                    b = ensureUnsigned32Bit(b);
                }

                outEqPort.value = a === b ? 1 : 0;
                outLtPort.value = a < b ? 1 : 0;

            }, [data.inAPort, data.inBPort, data.signedPort], [data.outEqPort, data.outLtPort]);

            return builder.build();
        },
    };

    return [adder, setLessThan, shiftLeft, shiftRight, comparitor];
}


const AdderOptions: React.FC<{
    editCtx: IEditContext;
    comp: IComp<IAdderConfig>;
}> = ({ editCtx, comp }) => {
    let [, setEditorState] = useEditorContext();

    return <>
        <EditKvp label="LSB Carry In">
            <BooleanEditor value={comp.args.carryInPort} update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { carryInPort: v })))} />
        </EditKvp>
        <EditKvp label="MSB Carry Out">
            <BooleanEditor value={comp.args.carryOutPort} update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { carryOutPort: v })))} />
        </EditKvp>
    </>;
};
