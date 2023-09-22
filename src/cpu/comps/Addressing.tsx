import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, IEditContext, IExeComp, IExePort, IoDir, PortType } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';
import { HexValueEditor, HexValueInputType } from '../displayTools/HexValueEditor';

interface ICompAddressMapper {
    busCtrl: IExePort;
    busData: IExePort;
    busAddr: IExePort;

    localCtrl: IExePort;
    localData: IExePort;
    localAddr: IExePort;

    addrOffset: number;
    addrMask: number;
}

interface IAddressMapperConfig {
    addrOffset: number;
    addrMask: number;
}

export function createAddressingComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 10;
    let h = 12;
    let addrMapper: ICompDef<ICompAddressMapper, IAddressMapperConfig> = {
        defId: 'bus/addrMap',
        altDefIds: ['addrMap'],
        name: "Address Map",
        size: new Vec3(w, h),
        ports: [
            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(0, 2), type: PortType.In | PortType.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(0, 4), type: PortType.In | PortType.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(0, 6), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },

            { id: 'localCtrl', name: 'Local Ctrl', pos: new Vec3(w, 2), type: PortType.Out | PortType.Ctrl, width: 4 },
            { id: 'localAddr', name: 'Local Addr', pos: new Vec3(w, 4), type: PortType.Out | PortType.Addr, width: 32 },
            { id: 'localData', name: 'Local Data', pos: new Vec3(w, 6), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },
        ],
        initConfig: () => ({ addrOffset: 0x1_0000, addrMask: 0xffff }),
        build: (builder) => {
            let data = builder.addData({
                busCtrl: builder.getPort('busCtrl'),
                busData: builder.getPort('busData'),
                busAddr: builder.getPort('busAddr'),
                localCtrl: builder.getPort('localCtrl'),
                localData: builder.getPort('localData'),
                localAddr: builder.getPort('localAddr'),
                addrOffset: builder.comp.args!.addrOffset,
                addrMask: builder.comp.args!.addrMask,
            });

            // addresser phases:
            // read from busCtrl, busAddr
            // write to localCtrl, localAddr
            // we're not reading/writing the data lines at this point!

            // read from localData
            // write to busData
            // read from busData
            // write to localData


            // hmm, can't make it so we do all writes first, then all reads first, if our addresser straddles 2 buses
            // since at least one of them has to be re-orded based on read vs write

            // since the choice of read/write decides which bus needs to be evaluated first
            // so need at least 2 phases on each bus for this to work

            // read from bus: ctrl, addr, data & wrte to local
            builder.addPhase(({ data: { busCtrl, busAddr, busData, localCtrl, localAddr, localData, addrOffset } }) => {
                let ctrl = busCtrl.value;
                let isEnabled = (ctrl & 0b1) === 0b1; // enabled
                let isWrite = (ctrl & 0b11) === 0b01; // write
                let isRead = (ctrl & 0b11) === 0b11; // read
                let addr = busAddr.value;
                let addrUpperBits = addr & ~data.addrMask;
                let addrLowerBits = addr & data.addrMask;
                let isMatch = addrUpperBits === data.addrOffset;

                localCtrl.value = 0b00;
                // localData.value = 0;
                // localData.ioEnabled = false;
                // localData.ioDir = isWrite ? IoDir.Output : IoDir.Input;
                localAddr.value = 0;
                // busData.ioEnabled = false;
                localData.ioEnabled = isEnabled;
                localData.ioDir = isWrite ? IoDir.Out : IoDir.In;
                busData.ioEnabled = isEnabled;
                // console.log('setting busData.ioDir to', IoDir[busData.ioDir]);

                if (isMatch && isEnabled) {
                    localCtrl.value = ctrl;
                    localAddr.value = addrLowerBits;
                    if (isWrite) {
                        localData.value = busData.value;
                        localData.ioEnabled = true;
                        localData.ioDir = IoDir.Out;
                    }
                }

            }, [data.busCtrl, data.busAddr, data.busData], [data.localCtrl, data.localAddr, data.localData]);

            // read from local & write to bus: ctrl, addr, data
            builder.addPhase(({ data: { localCtrl, localData, busData } }) => {
                busData.ioDir = IoDir.In;
                let ctrl = localCtrl.value;
                let isEnabled = (ctrl & 0b1) === 0b1; // enabled
                let isRead = (ctrl & 0b11) === 0b11; // read
                if (isRead) {
                    busData.value = localData.value;
                    busData.ioDir = isRead ? IoDir.Out : IoDir.In;
                }
                busData.ioEnabled = isEnabled; // isRead;
            }, [data.localData, data.busCtrl], [data.busData]);

            return builder.build();
        },
        // renderAll: true,
        render: ({ comp, ctx, cvs, exeComp }) => {
            /*
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
            // ctx.arcTo(x + w, y + h, x    , y + h, w / 2);

            ctx.arcTo(x + 0.7, y + h / 2, x, y, h * 0.8);

            // ctx.lineTo(x, y + h);
            // ctx.lineTo(x + w, y + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            */
        },
        renderDom: ({ comp, exeComp, editCtx }) => {
            return <Addressing editCtx={editCtx} comp={comp} exeComp={exeComp} />;
        },
    };

    return [addrMapper];
}

export const Addressing: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IAddressMapperConfig>,
    exeComp: IExeComp<ICompAddressMapper>,
}> = ({ editCtx, comp, exeComp }) => {

    let { setEditorState } = useEditorContext();

    function editAddrOffset(end: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { addrOffset: value })));
    }

    function editAddrMask(end: boolean, value: number) {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, { addrMask: value })));
    }

    return <CompRectBase comp={comp} className={s.compAddressing} hideHover>
        <HexValueEditor value={comp.args.addrOffset} update={editAddrOffset} inputType={HexValueInputType.Hex} fixedInputType minimalBackground padBits={32} />
        <HexValueEditor value={comp.args.addrMask} update={editAddrMask} inputType={HexValueInputType.Hex} fixedInputType minimalBackground padBits={32} />
        {/* <input type={'number'} value={comp.args.addrOffset} className={s.addrInput} onChange={ev => editAddrOffset(ev, false)} onBlur={ev => editAddrOffset(ev, true)} />
        <input type={'number'} value={comp.args.addrMask} className={s.addrInput} onChange={ev => editAddrMask(ev, false)} onBlur={ev => editAddrMask(ev, true)} /> */}
    </CompRectBase>;

};
