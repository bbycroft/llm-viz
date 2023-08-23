import { ExeCompBuilder } from "./CompBuilder";
import { IComp, IExeComp, IExeNet, IExePort } from "../CpuModel";
import { netToString } from "../CpuExecution";

export interface ICompDataAdder {
    inPort0: IExePort;
    inPort1: IExePort;
    outPort: IExePort;
}

export function buildAdder(comp: IComp) {
    let builder = new ExeCompBuilder<ICompDataAdder>(comp);
    let data: ICompDataAdder = {
        inPort0: builder.getPort('in0'),
        inPort1: builder.getPort('in1'),
        outPort: builder.getPort('out'),
    };
    builder.addPhase(adderPhase0, [data.inPort0, data.inPort1], [data.outPort]);
    return builder.build(data);
}

function adderPhase0({ data: { inPort0, inPort1, outPort } }: IExeComp<ICompDataAdder>) {
    outPort.value = inPort0.value + inPort1.value;
}

export function runNet(comps: IExeComp[], net: IExeNet) {


    if (net.tristate) {
        // need to ensure exactly 1 output is enabled
        let enabledCount = 0;
        let enabledPortValue = 0;
        for (let portRef of net.outputs) {
            let comp = comps[portRef.compIdx];
            let port = comp.ports[portRef.portIdx];
            if (comp.valid && port.ioEnabled) {
                enabledCount++;
                enabledPortValue = port.value;
            }
        }
        net.enabledCount = enabledCount;
        net.value = enabledCount === 1 ? enabledPortValue : 0;
        if (enabledCount > 1) {
            console.log('tristate', netToString(net, comps), 'has', enabledCount, 'enabled outputs');
        }
    } else {
        // has exactly 1 input
        if (net.outputs.length !== 1) {
            net.value = 0;
        } else {
            let portRef = net.outputs[0];
            let port = comps[portRef.compIdx].ports[portRef.portIdx];
            net.value = port.value;
        }
    }

    for (let portRef of net.inputs) {
        let port = comps[portRef.compIdx].ports[portRef.portIdx];
        port.value = net.value;
    }

    // console.log('running net', netToString(net, comps), 'with value', net.value.toString(16), net.value);
}
