import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { ICanvasState, IComp, IExeComp, IExePort, IoDir, PortDir } from "../CpuModel";
import { ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';

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
        defId: 'addrMap',
        name: "Address Map",
        size: new Vec3(w, h),
        ports: [
            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(0, 2), type: PortDir.In | PortDir.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(0, 4), type: PortDir.In | PortDir.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(0, 6), type: PortDir.In | PortDir.Out | PortDir.Tristate, width: 32 },

            { id: 'localCtrl', name: 'Local Ctrl', pos: new Vec3(w, 2), type: PortDir.Out | PortDir.Ctrl, width: 4 },
            { id: 'localAddr', name: 'Local Addr', pos: new Vec3(w, 4), type: PortDir.Out | PortDir.Addr, width: 32 },
            { id: 'localData', name: 'Local Data', pos: new Vec3(w, 6), type: PortDir.In | PortDir.Out | PortDir.Tristate, width: 32 },
        ],
        initConfig: () => ({ addrOffset: 0x1_0000, addrMask: 0xffff }),
        build2: (builder) => {
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
                localData.ioDir = IoDir.None;
                // console.log('setting busData.ioDir to', IoDir[busData.ioDir]);

                if (isMatch && isEnabled) {
                    localCtrl.value = ctrl;
                    localAddr.value = addrLowerBits;
                    if (isWrite) {
                        console.log('[ADDR] isWrite, sending value', busData.value, 'from bus to local');
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
                let isRead = (ctrl & 0b11) === 0b11; // read
                if (isRead) {
                    busData.value = localData.value;
                    busData.ioDir = isRead ? IoDir.Out : IoDir.In;
                }
                busData.ioEnabled = isRead; // isRead;
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
        renderDom: ({ comp, cvs, exeComp }) => {
            return <Addressing cvs={cvs} comp={comp} exeComp={exeComp} />;
        },
    };

    return [addrMapper];
}

export const Addressing: React.FC<{
    cvs: ICanvasState,
    comp: IComp<IAddressMapperConfig>,
    exeComp: IExeComp<ICompAddressMapper>,
}> = ({ cvs, comp, exeComp }) => {

    let { setEditorState } = useEditorContext();

    function editAddrOffset(ev: React.ChangeEvent<HTMLInputElement>, end: boolean) {
        let addrOffset = parseInt(ev.target.value);
        setEditorState(editCompConfig(end, comp, a => assignImm(a, { addrOffset })));
    }

    function editAddrMask(ev: React.ChangeEvent<HTMLInputElement>, end: boolean) {
        let addrMask = parseInt(ev.target.value);
        setEditorState(editCompConfig(end, comp, a => assignImm(a, { addrMask })));
    }

    return <CompRectBase comp={comp} cvs={cvs}>
        <div style={{ height: '90px' }} />
        <input type={'number'} value={comp.args.addrOffset} className={s.addrInput} onChange={ev => editAddrOffset(ev, false)} onBlur={ev => editAddrOffset(ev, true)} />
        <input type={'number'} value={comp.args.addrMask} className={s.addrInput} onChange={ev => editAddrMask(ev, false)} onBlur={ev => editAddrMask(ev, true)} />
    </CompRectBase>;

};
