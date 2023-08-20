import { isNil, hasFlag } from "@/src/utils/data";
import { Vec3 } from "@/src/utils/vector";
import { PortDir, IComp, ICompPort, ICompRenderArgs, IExeComp, IExePhase, IExePort } from "../CpuModel";

export interface ICompBuilderArgs {

}

export interface ICompDef<T> {
    defId: string;
    name: string;
    size: Vec3;
    ports: ICompPort[];

    build?: (comp: IComp) => IExeComp<T>;
    render?: (args: ICompRenderArgs<T>) => void;
}

export class CompLibrary {
    comps = new Map<string, ICompDef<any>>();
    constructor() {}

    public addComp(comp: ICompDef<any>) {
        this.comps.set(comp.defId, comp);
    }

    create(defId: string) {
        let compDef = this.comps.get(defId);
        if (!compDef) {
            return null;
        }
        let comp: IComp = {
            id: '',
            defId: compDef.defId,
            name: compDef.name,
            ports: compDef.ports,
            pos: new Vec3(0, 0),
            size: compDef.size,
        };

        return comp;
    }

    build(comp: IComp): IExeComp<any> {
        let compDef = this.comps.get(comp.defId);
        let buildFn = compDef?.build ?? buildDefault;
        return buildFn(comp);
    }
}

export class ExeCompBuilder<T> {
    ports: IExePort[] = [];
    portNameToIdx = new Map<string, number>();
    phases: IExePhase[] = [];
    seenLatch = false;
    valid = true;
    data: T | null = null;

    constructor(
        public comp: IComp,
    ) {
        this.ports = comp.ports.map((node, i) => {
            return {
                portIdx: i,
                netIdx: -1,
                outputEnabled: true,
                type: node.type ?? PortDir.In,
                value: 0,
                width: node.width ?? 1,
            };
        });

        for (let i = 0; i < comp.ports.length; i++) {
            this.portNameToIdx.set(comp.ports[i].id, i);
        }
    }

    public getPort(id: string): IExePort {
        let portIdx = this.portNameToIdx.get(id);
        if (isNil(portIdx)) {
            let validPortsMsg = 'Valid ports are [' + Array.from(this.portNameToIdx.keys()).join(', ') + ']';
            throw new Error(`Port ${id} not found on component ${this.comp.name} (${this.comp.id}). ` + validPortsMsg);
        }
        return this.ports[portIdx];
    }

    public addData(data: T): T {
        this.data = data;
        return data;
    }

    public addPhase(func: (comp: IExeComp<T>) => void, inPorts: IExePort[], outPorts: IExePort[], isLatch: boolean = false): ExeCompBuilder<T> {
        if (this.seenLatch) {
            throw new Error(`Cannot add phase after latch phase`);
        }
        if (isLatch) {
            this.seenLatch = true;
        }
        this.phases.push({
            readPortIdxs: inPorts.map(a => a.portIdx),
            writePortIdxs: outPorts.map(a => a.portIdx),
            func,
            isLatch,
        });
        return this;
    }

    public build(data?: T): IExeComp<T> {
        return {
            comp: this.comp,
            data: this.data ?? data!,
            phases: this.phases,
            phaseCount: this.phases.length,
            phaseIdx: 0,
            ports: this.ports,
            valid: this.valid,
        };
    }
}


export function buildDefault(comp: IComp): IExeComp<{}> {
    let builder = new ExeCompBuilder<{}>(comp);
    builder.valid = false;
    let data = {};
    let inPorts = builder.ports.filter(p => hasFlag(p.type, PortDir.In));
    let outPorts = builder.ports.filter(p => hasFlag(p.type, PortDir.Out));
    builder.addPhase(defaultPhase0, inPorts, outPorts);
    return builder.build(data);
}

function defaultPhase0(comp: IExeComp<{}>) {
    // do nothing
}
