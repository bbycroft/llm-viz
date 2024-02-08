import React from 'react';
import { Vec3 } from "@/src/utils/vector";
import { IComp, IEditContext, IExeComp, IExePort, IoDir, PortType } from "../CpuModel";
import { IBaseCompConfig, ICompBuilderArgs, ICompDef } from "./CompBuilder";
import { CompRectBase } from "./RenderHelpers";
import s from './CompStyles.module.scss';
import { editCompConfig, useEditorContext } from '../Editor';
import { assignImm } from '@/src/utils/data';
import { HexValueEditor, HexValueInputType } from '../displayTools/HexValueEditor';
import { IBitExpanderMultiConfig } from './BitExpander';
import { IBitComparitorConfig } from './BitComparitor';
import { EditKvp } from '../sidebars/CompDetails';

interface ICompAddressMapper {
    busCtrl: IExePort;
    busData: IExePort;
    busAddr: IExePort;

    localCtrl: IExePort;
    localData: IExePort;
    localAddr: IExePort;

    addrOffset: number;
    addrMask: number;

    isMatch: boolean;
}

interface IAddressMapperConfig extends IBaseCompConfig {
    addrOffset: number;
    addrMask: number;
}

/*
We have a needed feature here, where the internal schematic parts take their
values from our component config.

A couple ways we could do this:

1) The internal schematic has named comps, and we find and set the config of those comps
   - We'll do this when necessary, such as when we update this config, or on first load

2) Each variable in comps in the internal schematic can be set from a variable in the parent config
   - In some ways this is nicer (less code, more data), but it is way more complicated!
   - It also works better with custom-built components, but those are a can of worms
*/

export function createAddressingComps(_args: ICompBuilderArgs): ICompDef<any>[] {

    let w = 8;
    let h = 10;
    let addrMapper: ICompDef<ICompAddressMapper, IAddressMapperConfig> = {
        defId: 'bus/addrMap',
        altDefIds: ['addrMap'],
        name: "Address Map",
        size: new Vec3(w, h),
        ports: [
            { id: 'busCtrl', name: 'Bus Ctrl', pos: new Vec3(0, 1), type: PortType.In | PortType.Ctrl, width: 4 },
            { id: 'busAddr', name: 'Bus Addr', pos: new Vec3(0, 3), type: PortType.In | PortType.Addr, width: 32 },
            { id: 'busData', name: 'Bus Data', pos: new Vec3(0, 5), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },

            { id: 'localCtrl', name: 'Ctrl', pos: new Vec3(w, 1), type: PortType.Out | PortType.Ctrl, width: 4 },
            { id: 'localAddr', name: 'Addr', pos: new Vec3(w, 3), type: PortType.Out | PortType.Addr, width: 32 },
            { id: 'localData', name: 'Data', pos: new Vec3(w, 5), type: PortType.In | PortType.Out | PortType.Tristate, width: 32 },
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
                isMatch: false,
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
                let isMatch = addrUpperBits === addrOffset;

                localCtrl.value = 0b00;
                localAddr.value = 0;
                localData.ioEnabled = true; // the only time we don't write to localData is if we're reading
                localData.ioDir = isRead && isMatch ? IoDir.In : IoDir.Out;

                busData.ioEnabled = isEnabled && isMatch;
                busData.ioDir = !isEnabled ? IoDir.None : isWrite ? IoDir.In : IoDir.Out;
                // console.log('setting busData.ioDir to', IoDir[busData.ioDir]);

                if (isMatch && isEnabled) {
                    localCtrl.value = ctrl;
                    localAddr.value = addrLowerBits;
                    if (isWrite) {
                        localData.value = busData.value;
                        localData.ioDir = IoDir.Out;
                    }
                }

                data.isMatch = isMatch && isEnabled;

            }, [data.busCtrl, data.busAddr], [data.localCtrl, data.localAddr]);

            // read from local & write to bus: ctrl, addr, data
            builder.addPhase(({ data: { localCtrl, localData, busData } }) => {
                busData.ioDir = IoDir.In;
                let ctrl = localCtrl.value;
                let isEnabled = data.isMatch && (ctrl & 0b1) === 0b1; // enabled
                let isRead = (ctrl & 0b11) === 0b11; // read
                if (isRead) {
                    busData.value = localData.value;
                    busData.ioDir = isRead ? IoDir.Out : IoDir.In;
                } else if (isEnabled) {
                    localData.value = busData.value;
                }
                busData.ioEnabled = isEnabled; // isRead;
            }, [data.localData, data.busData, data.busCtrl], [data.localData, data.busData], { atLeastOneResolved: [data.busData, data.localData] });

            return builder.build();
        },
        updateSubSchematicCompArgs: ({ comp, schematic, issues }) => {

            let splitter = schematic.comps.find(c => c.extId === 'splitter') as IComp<IBitExpanderMultiConfig>;
            let upperBitsMatch = schematic.comps.find(c => c.extId === 'upper_bits_match') as IComp<IBitComparitorConfig>;

            if (!splitter || !upperBitsMatch) {
                issues.push(`Missing required components 'splitter' or 'upper_bits_match' in sub-schematic`);
                return schematic;
            }

            let maskStr = comp.args.addrMask.toString(2).padStart(33, '0').split('').reverse().join('');
            let firstZeroIdx = maskStr.indexOf('0');

            let addrOffsetShifted = comp.args.addrOffset >>> firstZeroIdx;
            let matchStr = addrOffsetShifted.toString(2).padStart(32 - firstZeroIdx, '0');

            splitter = assignImm(splitter, {
                args: assignImm(splitter.args, {
                    bitRange: [
                        { id: 0, end: 31, start: firstZeroIdx, individual: false, showBits: false },
                        { id: 1, end: firstZeroIdx - 1, start: 0, individual: false, showBits: false },
                    ],
                }),
            });

            upperBitsMatch = assignImm(upperBitsMatch, {
                args: assignImm(upperBitsMatch.args, {
                    match: matchStr,
                }),
            });

            schematic = assignImm(schematic, {
                comps: schematic.comps.map(c => c.id === splitter.id ? splitter : c.id === upperBitsMatch.id ? upperBitsMatch : c),
            });

            return schematic;
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
        renderDom: ({ comp, exeComp, editCtx, isActive }) => {
            return isActive ? <Addressing editCtx={editCtx} comp={comp} exeComp={exeComp} /> : null;
        },
        renderOptions: ({ editCtx, comp }) => {
            return <AddressingOptions editCtx={editCtx} comp={comp} />;
        },
    };

    return [addrMapper];
}

export const AddressingOptions: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IAddressMapperConfig>,
}> = ({ editCtx, comp }) => {

    let [, setEditorState] = useEditorContext();

    return <>
        <EditKvp label="Addr Mask">
            <HexValueEditor
                className='bg-slate-100 rounded'
                inputClassName='bg-slate-100'
                inputType={HexValueInputType.Hex}
                signed={false}
                hidePrefix={false}
                fixedInputType
                padBits={32}
                maxBits={32}
                value={comp.args.addrMask}
                update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => {
                    return assignImm(a, { addrMask: v });
                }))} />
        </EditKvp>

        <EditKvp label="Addr Match">
            <HexValueEditor
                className='bg-slate-100 rounded'
                inputClassName='bg-slate-100'
                inputType={HexValueInputType.Hex}
                signed={false}
                hidePrefix={false}
                fixedInputType
                padBits={32}
                maxBits={32}
                value={comp.args.addrOffset}
                update={(end, v) => setEditorState(editCompConfig(editCtx, end, comp, a => {
                    return assignImm(a, { addrOffset: v });
                }))} />
        </EditKvp>
    </>;
};

export const Addressing: React.FC<{
    editCtx: IEditContext,
    comp: IComp<IAddressMapperConfig>,
    exeComp: IExeComp<ICompAddressMapper>,
}> = ({ editCtx, comp, exeComp }) => {

    let [, setEditorState] = useEditorContext();

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
