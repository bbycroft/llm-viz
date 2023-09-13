import React, { memo } from 'react';
import { Vec3 } from "@/src/utils/vector";
import { IComp, IExeComp, IExePort, IoDir, PortType } from "../../CpuModel";
import { ICompBuilderArgs, ICompDef } from "../CompBuilder";
import { CompRectBase } from "../RenderHelpers";
import s from '../CompStyles.module.scss';
import clsx from 'clsx';

interface ILedOutputData {
    busCtrl: IExePort;
    busData: IExePort;
    busAddr: IExePort;

    bitsOn: number;
    bitsOff: number;
    bitsToggle: number;
    newValue: number | null;

    value: number;
}

interface ILedOutputConfig {
}

// need to make a list of registers we can read & write to
// then have functions for reading & writing
// maybe a list of functions that take in the data object, whether to read or write
// and the address is given by the order in the list

type IRegAccess<T> = (data: T, value: number, isWrite: boolean) => number;

interface IRegDef<T> {
    regs: IRegAccess<T>[];
}

let ledOutputRegAccess: IRegDef<ILedOutputData> = {
    regs: [
        function ledState(data, value, isWrite) {
            if (isWrite) {
                data.newValue = value;
            }
            return data.value;
        },
        function ledToggleOn(data, value, isWrite) {
            if (isWrite) {
                data.newValue = data.value | value;
                data.bitsOn = value;
            }
            return 0;
        },
        function ledToggleOff(data, value, isWrite) {
            if (isWrite) {
                data.newValue = data.value & ~value;
                data.bitsOff = value;
            }
            return 0;
        },
        function ledToggle(data, value, isWrite) {
            if (isWrite) {
                data.newValue = data.value ^ value;
                data.bitsToggle = value;
            }
            return 0;
        }
    ],
};

export function createLedOutputComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 30;
    let h = 8;
    let ledOutputSimple: ICompDef<ILedOutputData, ILedOutputConfig> = {
        defId: 'io/ledOutput0',
        altDefIds: ['p_ledOutput'],
        name: "LED Output",
        size: new Vec3(w, h),
        ports: [
            { id: 'busCtrl', name: 'C', pos: new Vec3(0, 2), type: PortType.In | PortType.Ctrl, width: 4 },
            { id: 'busAddr', name: 'A', pos: new Vec3(0, 4), type: PortType.In | PortType.Addr, width: 32 },
            { id: 'busData', name: 'D', pos: new Vec3(0, 6), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },
        ],
        // initConfig: () => ({ addrOffset: 0x1_0000, addrMask: 0xffff }),
        copyStatefulData: (src, dest) => {
            dest.value = src.value;
        },
        reset: (comp) => {
            comp.data.value = 0;
        },
        build: (builder) => {
            let data = builder.addData({
                busCtrl: builder.getPort('busCtrl'),
                busData: builder.getPort('busData'),
                busAddr: builder.getPort('busAddr'),
                value: 0,
                bitsOn: 0,
                bitsOff: 0,
                bitsToggle: 0,
                newValue: null,
            });

            // read from bus & write to local
            builder.addPhase(({ data: { busCtrl, busAddr, busData } }) => {
                let ctrl = busCtrl.value;
                let isEnabled = (ctrl & 0b1) === 0b1; // enabled
                let isWrite = (ctrl & 0b11) === 0b01; // write
                let isRead = (ctrl & 0b11) === 0b11; // read
                let addr = busAddr.value;
                data.bitsOn = 0;
                data.bitsOff = 0;
                data.bitsToggle = 0;
                data.newValue = null;

                if (isWrite) {
                    // write to local with addr
                    let fn = ledOutputRegAccess.regs[addr];
                    if (fn) {
                        fn(data, busData.value, true);
                    }
                }

                busData.ioEnabled = isEnabled;
                busData.ioDir = isRead ? IoDir.Out : IoDir.In;

            }, [data.busCtrl, data.busAddr, data.busData], []);

            // read from local & write to bus
            builder.addPhase(({ data: { busCtrl, busAddr, busData } }) => {
                let ctrl = busCtrl.value;
                let isEnabled = (ctrl & 0b1) === 0b1; // enabled
                let isRead = (ctrl & 0b11) === 0b11; // read
                if (isRead) {
                    let fn = ledOutputRegAccess.regs[busAddr.value];
                    if (fn) {
                        busData.value = fn(data, 0, false);
                    } else {
                        busData.value = 0;
                    }
                }
                busData.ioEnabled = isEnabled;
            }, [], [data.busData]);

            builder.addLatchedPhase(({ data: { busCtrl, busAddr, busData } }) => {
                if (data.newValue !== null) {
                    data.value = data.newValue;
                }
            }, [], []);

            return builder.build();
        },
        // renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
        },
        renderDom: ({ comp, exeComp }) => {
            return <LedOutputSimple comp={comp} exeComp={exeComp} value={exeComp.data.value} />;
        },
    };

    return [ledOutputSimple];
}

const LedOutputSimple: React.FC<{
    comp: IComp<ILedOutputConfig>,
    exeComp: IExeComp<ILedOutputData>,
    value: number,
}> = memo(function LedOutputSimple({ comp, exeComp, value }) {

    let ledBits: boolean[] = [];
    for (let i = 0; i < 8; i++) {
        let isOn = (value & (1 << i)) !== 0;
        ledBits.push(isOn);
    }

    return <CompRectBase comp={comp} className={s.compLedOutputSimple} hideHover>
        <div>{'0x' + value.toString(16).padStart(8, '0')}</div>
        <div className={s.ledOutput}>
            {ledBits.map((en, i) => {
                return <div key={i} className={clsx(s.ledOutputBit, en && s.enabled)} />;
            })}
        </div>
    </CompRectBase>;

});
