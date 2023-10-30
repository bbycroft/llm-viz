import { isNil, hasFlag, assignImm } from "@/src/utils/data";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { PortType, IComp, ICompPort, ICompRenderArgs, IExeComp, IExePhase, IExePort, IExeRunArgs, IoDir, IEditSnapshot, ILibraryItem, ISchematic } from "../CpuModel";

export interface ICompBuilderArgs {

}

export interface IResetOptions {
    hardReset: boolean; // reset everything including ROMs (that would usually be expected to be persistent over device restarts)
}

// this isn't that great!
// need to be able to adjust size, name, ports based on config, where the config is per-instance
// Also, our IComp object should probably just contain the IExeComp stuff

/*
Want to think about about what an ICompDef/IComp looks like for a sub-component

 * A component may have its own exe model, as well as a sub-component tree, where we execute the
   efficient one.
* Also have a way to compare the two execution models.
* But not important!
* Have a couple of modes:
  - when building the model, place ports into the _internal_ object
    - and these will be placed on the external object
  - or the other way around: add a port externally, and it will be added internally
  - but there's some set, a mapping between them, and ports have names/ids
* Either way, shape/position of nodes is all adjustable by the config (& user)

* I think we have some standard config args (size, rotation, port list) that we apply to a component
  - So our current plan is probably OK

* What about the comp library? Does an ICompDef map to a particular user-defined type of a component,
  or is there one ICompDef for all user-defined comps?

  - So it has a common set of functions, but we want a unique defId, name, size, ports etc
  - Also I guess the args will contain the inner/sub-comps

* What about import/export
  - Want each layout & sub-layout to be defined in a list of layouts, with refs by defId

* Have a typical issue of managing the library: if we import something with a sub-layout that doesn't
  match one in the library, what do we do? Kind of want a versioning system here, so we add an additional
  version of the component to our library, and can optionally modify the "active" version (or move it to
  another library item)
*/

/*
Steps: let's create & manage a library of user-defined components.
Store them somehow, and make them editable in a UI. Probably still local-storage, but should
add some weightier load/store system
Editing is either: editing directly, or within the scope of a tree of components

*/

export interface ICompDef<T, A = any> {
    defId: string;
    altDefIds?: string[]; // so we can safely rename things
    name: string;
    size: Vec3;
    type?: CompDefType; // defaults to BuiltIn
    ports: ICompPort[] | ((args: A, compDef: ICompDef<T, A>) => ICompPort[]);
    subLayout?: ISubLayoutArgs;

    initConfig?: (args: ICompBuilderArgs) => A;

    // modify the comp {size, ports} based on the component args
    applyConfig?: (comp: IComp, args: A) => void;

    // create the exe model for this component. Copy across any relevant data from the comp into the exeComp
    build?: (builder: ExeCompBuilder<T, A>) => IExeComp<T>;

    // render to the canvas based on the {comp, exeComp} pair (+ other data)
    render?: (args: ICompRenderArgs<T, A>) => void;

    // render to the DOM based on the {comp, exeComp} pair (+ other data). Suitable for user-interactive components
    renderDom?: (args: ICompRenderArgs<T, A>) => React.ReactNode;

    // Let render() handle all rendering; don't render a box/name
    renderAll?: boolean;

    // copy things like memory & registers (not ports) between IExeComp data's (during a regen of the exe model)
    copyStatefulData?: (src: T, dest: T) => void;

    // action to reset stateful components, typically to 0x00. Option for hard or soft reset. Soft reset is typically
    // equivalent to a power-down/restart (leaving ROM untouched), while a hard reset includes things like ROMs.
    reset?: (exeComp: IExeComp<T>, resetOpts: IResetOptions) => void;
}

export enum CompDefType {
    Builtin,
    UserDefined,
}

export interface ISubLayoutArgs {
    // how do we reference the ports in the sub layout?
    // maybe have some I/O components that are ports, and have the appropriate id in args
    // we'll just have to add logic to keep them in sync, but otherwise, the inner port has pos, rot etc,
    // and the outer port has its own pos

    // how do we create a nice looking sub-layout if we construct from a group of components?
    // give the inner layout a rectangle that matches the parent group, and put the internal ports just
    // outside that region
    // That way, the wires extend naturally, and when it's only partially zoomed in, everything remains the same &
    // can be easily un-done
    bb: BoundingBox3d;
    layout: ISchematic;
    ports: ISubLayoutPort[];
}

export interface ISubLayoutPort {
    id: string;
    name: string
    type: PortType;
    pos: Vec3;
    width?: number;
}

export class CompLibrary {
    libraryLookup = new Map<string, ILibraryItem>();
    constructor() {}

    public addComp(comp: ICompDef<any>) {
        let item = createLibraryItemFromComp(comp);
        this.addLibraryItem(item);
    }

    public addLibraryItem(item: ILibraryItem) {
        this.libraryLookup.set(item.id, item);
        for (let altId of item.altIds ?? []) {
            this.libraryLookup.set(altId, item);
        }
    }

    getCompDef(defId: string): ICompDef<any> | null {
        let item = this.libraryLookup.get(defId);
        if (!item || !item.compDef) {
            return null;
        }
        return item.compDef;
    }

    create<A = undefined>(defId: string, cfg?: A | undefined): IComp<A> {
        let compDef = this.getCompDef(defId);
        if (!compDef) {
            return {
                id: '',
                defId,
                name: '<unknown>',
                args: cfg!,
                ports: [],
                pos: new Vec3(0, 0),
                size: new Vec3(4, 4),
                resolved: false,
                hasSubSchematic: false,
            };
        }

        let args = compDef.initConfig ? compDef.initConfig({}) : null;

        if (args && cfg) {
            args = assignImm(args, cfg);
        }

        let comp: IComp = {
            id: '',
            defId: compDef.defId,
            name: compDef.name,
            ports: compDef.ports instanceof Function ? compDef.ports(args, compDef) : compDef.ports,
            pos: new Vec3(0, 0),
            size: compDef.size,
            args,
            resolved: true,
            hasSubSchematic: !!compDef.subLayout,
        };
        compDef.applyConfig?.(comp, comp.args);

        return comp;
    }

    updateCompFromDef(comp: IComp) {
        let compDef = this.getCompDef(comp.defId);
        if (!compDef) {
            return;
        }
        comp.name ??= compDef.name;
        comp.ports = compDef.ports instanceof Function ? compDef.ports(comp.args, compDef) : compDef.ports;
        comp.size = compDef.size;
        comp.hasSubSchematic = !!compDef.subLayout;
        compDef.applyConfig?.(comp, comp.args);
    }

    updateAllCompsFromDefs(comps: IComp[]) {
        for (let comp of comps) {
            this.updateCompFromDef(comp);
        }
        return comps;
    }

    build(comp: IComp): IExeComp<any> {
        let compDef = this.getCompDef(comp.defId);
        if (compDef?.build) {
            let builder = new ExeCompBuilder<any>(comp);
            return compDef.build(builder);
        }
        return buildDefault(comp);
    }
}

export function createLibraryItemFromComp(compDef: ICompDef<any>): ILibraryItem {
    return {
        id: compDef.defId,
        altIds: compDef.altDefIds,
        name: compDef.name,
        compDef: compDef,
    };
}

export class ExeCompBuilder<T, A=any> {
    ports: IExePort[] = [];
    portNameToIdx = new Map<string, number>();
    phases: IExePhase[] = [];
    seenLatch = false;
    valid = true;
    data: T | null = null;

    constructor(
        public comp: IComp<A>,
    ) {
        this.ports = comp.ports.map<IExePort>((node, i) => {
            return {
                portIdx: i,
                netIdx: -1,
                ioEnabled: true,
                ioDir: IoDir.None,
                dataUsed: true,
                type: node.type ?? PortType.In,
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

    public createExternalPort(id: string, type: PortType, width: number): IExePort {
        let portIdx = this.ports.length;
        this.portNameToIdx.set(id, portIdx);
        let newPort: IExePort = {
            portIdx,
            netIdx: -1,
            dataUsed: true,
            ioEnabled: true,
            ioDir: IoDir.None,
            type: type,
            value: 0,
            width: width,
        };
        this.ports.push(newPort);
        return newPort;
    }

    public addData(data: T): T {
        this.data = data;
        return data;
    }

    public addLatchedPhase(func: (comp: IExeComp<T>, args: IExeRunArgs) => void, inPorts: IExePort[], outPorts: IExePort[]): ExeCompBuilder<T> {
        return this.addPhase(func, inPorts, outPorts, true);
    }

    public addPhase(func: (comp: IExeComp<T>, args: IExeRunArgs) => void, inPorts: IExePort[], outPorts: IExePort[], isLatch: boolean = false): ExeCompBuilder<T> {
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
            ports: this.ports,
            compFullId: this.comp.id,
            idx: -1,
        };
    }
}


export function buildDefault(comp: IComp): IExeComp<{}> {
    let builder = new ExeCompBuilder<{}>(comp);
    builder.valid = false;
    let data = {};
    let inPorts = builder.ports.filter(p => hasFlag(p.type, PortType.In));
    let outPorts = builder.ports.filter(p => hasFlag(p.type, PortType.Out));
    for (let port of [...inPorts, ...outPorts]) {
        port.ioEnabled = false;
    }
    builder.addPhase(defaultPhase0, inPorts, outPorts);
    return builder.build(data);
}

function defaultPhase0(comp: IExeComp<{}>) {
    // do nothing
}
