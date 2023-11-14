import { isNotNil, assignImm } from "../utils/data";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { CompLibrary } from "./comps/CompBuilder";
import { IComp, IEditSnapshot, IElRef, ISchematic, IWireGraph, IWireGraphNode, RefType } from "./CpuModel";
import { checkWires } from "./Wire";

// what's our format?
// plain text format, with # comments
// first line is #wire-schema <version> where version is a single number

// Then we have a list of components & wires
// Component lines start with "C", and wires start with "W"

// Want to make them fairly easily copy-able, so we use deltas for the ids
// note that ids can't contain spaces

/* e.g.:

#wire-schema 1
C ram 0 p:-12,-23
C rom 1 p:-12,-10
C insFetch 3 p:-12,2
C id 2 p:3,4
C ls 8 p:26,4
C alu 4 p:26,15
C pc 5 p:3,11
C reg 6 p:3,23
W 3 ns:[13,6 p:id/rhsImm|22,6,0|22,12,1|33,12|33,12,2,3|22,28,2|33,7,3 p:ls/data|13,28,5 p:reg/outB|33,15,4 p:alu/rhs]
W 6 ns:[-12,3 p:insFetch/addr|-17,3,0]
W 7 ns:[-12,4 p:insFetch/data|-17,4,0]
W 10 ns:[3,26 p:reg/in|-1,26,0|-1,31,1|31,31,2|31,21,3 p:alu/result|38,31,3|38,6,5|36,6,6 p:ls/dataOut]
W 11 ns:[3,12 p:pc/in|-5,12,0]
W 13 ns:[29,10|29,15,0 p:alu/lhs|29,7,0 p:ls/addrBase|20,10,0|16,10,3|20,26,3|16,12,4|16,9,4|13,26,5 p:reg/outA|13,12,6 p:pc/out|-7,9,7|-7,5,10 p:insFetch/pc]
W 16 ns:[3,5 p:id/ins|0,5,0|0,3,1|-2,3,2 p:insFetch/ins]

*/

export function exportData(layout: ISchematic) {

    let str = "#wire-schema 1\n";

    for (let i = 0; i < layout.comps.length; i++) {
        let comp = layout.comps[i];
        let configStr = comp.args ? " c:" + JSON.stringify(comp.args) : "";
        str += `C ${comp.id} ${comp.defId} p:${comp.pos.x},${comp.pos.y}${configStr}\n`;
    }
    for (let i = 0; i < layout.wires.length; i++) {
        let wire = layout.wires[i];
        str += `W ${wire.id} ns:[`;
        for (let j = 0; j < wire.nodes.length; j++) {
            let node = wire.nodes[j];
            let nodeStr = "";
            if (j > 0) {
                nodeStr += "|";
            }
            let initParts = [node.pos.x, node.pos.y].concat(node.edges.filter(x => x < j));
            nodeStr += initParts.join(",");
            if (node.ref?.type === RefType.CompNode) {
                nodeStr += ` p:${node.ref.id}/${node.ref.compNodeId}`;
            }
            str += nodeStr;
        }
        str += "]\n";
    }

    return str;
}

export interface IImportResult {
    issues: ILineIssue[] | null;
    schematic?: ISchematic;
}

export interface ILineIssue {
    issue: string;
    lineNo: number;
    lineContent: string;
    colNo?: number;
}

export function importData(str: string): IImportResult {
    let res: IImportResult = { issues: null };
    let lines = str.split("\n");

    function makeIssue(issue: string, lineIdx: number, colNo?: number) {
        res.issues = res.issues || [];
        res.issues.push({ issue, lineNo: lineIdx + 1, lineContent: lines[lineIdx], colNo });
    }

    if (lines.length === 0 || !lines[0].startsWith('#wire-schema')) {
        makeIssue("Invalid file format: first line must be #wire-schema <version>", 0);
        return res;
    }
    let version = parseInt(lines[0].split(" ")[1]);
    if (version !== 1) {
        makeIssue("Invalid file format: only version 1 is supported", 0);
        return res;
    }

    interface ILinePart {
        text: string;
        label: string;
        value: string;
    }

    function parseLine(a: string): ILinePart[] {
        let res: ILinePart[] = [];
        let re = /\s*(?:([\w]+):)?(\[[^\]]+\]|\{.*\}|[^\[\]: ]+)/g;
        let match: RegExpExecArray | null;
        while (!!(match = re.exec(a))) {
            let value = match[2].trim();
            if (value.startsWith("[") && value.endsWith("]")) {
                value = value.substring(1, value.length - 1);
            }
            res.push({ text: match[0].trim(), label: match[1], value });
        }
        return res;
    }

    let comps: IComp[] = [];
    let wires: IWireGraph[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        let lineRaw = lines[lineIdx];
        let line = lineRaw.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        let parts = parseLine(line);

        if (parts[0].text === 'C') {
            if (parts.length < 3) {
                makeIssue("Invalid component line: must have at least 3 parts", lineIdx);
                continue;
            }
            let id = parts[1].text;
            let type = parts[2].text;

            let comp: IComp = {
                id,
                name: id,
                pos: new Vec3(0, 0),
                size: new Vec3(0, 0),
                defId: type,
                ports: [],
                args: null,
                resolved: false,
                hasSubSchematic: false,
            };

            for (let j = 3; j < parts.length; j++) {
                let part = parts[j];
                if (part.label === 'p') {
                    let posParts = part.value.split(",");
                    if (posParts.length !== 2) {
                        makeIssue("Invalid component line: p: must have 2 parts", lineIdx);
                        continue;
                    }
                    let x = parseFloat(posParts[0]);
                    let y = parseFloat(posParts[1]);
                    if (isNaN(x) || isNaN(y)) {
                        makeIssue("Invalid component line: p: must have 2 numbers", lineIdx);
                        continue;
                    }
                    comp.pos = new Vec3(x, y);
                } else if (part.label === 'c') {
                    comp.args = JSON.parse(part.value);
                } else {
                    makeIssue(`Invalid component line: unknown part [${part.label}] [${part.value}]`, lineIdx);
                    continue;
                }
            }

            comps.push(comp);

        } else if (parts[0].text === 'W') {
            if (parts.length < 3) {
                makeIssue("Invalid wire line: must have at least 3 space-separated parts", lineIdx);
                continue;
            }
            let id = parts[1].text;
            let nodes: IWireGraphNode[] = [];
            for (let part of parts) {
                if (part.label === 'ns') {
                    let nodesStrs = part.value.split("|");
                    for (let nodeStr of nodesStrs) {
                        let nodeParts = parseLine(nodeStr);
                        let posAndEdges = nodeParts[0].text.split(",");
                        if (posAndEdges.length < 2) {
                            makeIssue("Invalid wire node: must have at least 2 parts", lineIdx);
                            continue;
                        }
                        let x = parseFloat(posAndEdges[0]);
                        let y = parseFloat(posAndEdges[1]);
                        if (isNaN(x) || isNaN(y)) {
                            makeIssue("Invalid wire node: must have 2 numbers", lineIdx);
                            continue;
                        }
                        let edges: number[] = [];
                        for (let i = 2; i < posAndEdges.length; i++) {
                            let edge = parseInt(posAndEdges[i]);
                            if (isNaN(edge)) {
                                makeIssue("Invalid wire node: edge must be a number", lineIdx);
                                continue;
                            }
                            edges.push(edge);
                        }

                        let ref: IElRef | undefined;

                        for (let nodePart of nodeParts) {
                            if (nodePart.label === 'p') {
                                let compNodeParts = nodePart.value.split("/");
                                if (compNodeParts.length !== 2) {
                                    makeIssue("Invalid wire node: c: must have 2 parts", lineIdx);
                                    continue;
                                }
                                let compId = compNodeParts[0];
                                let compNodeId = compNodeParts[1];
                                ref = { type: RefType.CompNode, id: compId, compNodeId };
                            }
                        }

                        nodes.push({ id: nodes.length, pos: new Vec3(x, y), edges, ref });
                    }
                }
            }
            for (let node of nodes) {
                for (let edge of node.edges) {
                    if (node.id > edge) {
                        nodes[edge].edges.push(node.id);
                    }
                }
            }
            wires.push({ id, nodes });
        } else {
            makeIssue(`Unexpected line start letter: '${line[0]}'`, lineIdx);
            continue;
        }

    }

    let schematic: ISchematic = { comps, wires, compBbox: new BoundingBox3d() };

    let outStr = exportData(schematic);

    if (outStr.replaceAll(/\r/g, '') !== str.replaceAll(/\r/g, '')) {
        makeIssue("Exported data does not match imported data", 0);
        console.log('--- str:\n', str);
        console.log('--- outStr:\n', outStr);
    }

    if (res.issues !== null) {
        console.log(res.issues);
    }

    if (!res.issues) {
        res.schematic = schematic;
    }

    return res;
}



export interface ILSGraphWire {
    nodes: ILSGraphWireNode[];
}

export interface ILSComp {
    id: string;
    defId: string;
    x: number;
    y: number;
    args?: any;
    subSchematicId?: string;
}

export interface ILSGraphWireNode {
    id: number;
    x: number;
    y: number;
    edges: number[];
    ref?: IElRef;
}

export interface ILSState {
    parentCompDefId?: string;
    wires: ILSGraphWire[];
    comps: ILSComp[];
}

export function hydrateFromLS(ls: Partial<ILSState> | undefined): ILSState {
    return {
        parentCompDefId: ls?.parentCompDefId,
        wires: ls?.wires ?? [],
        comps: ls?.comps ?? [],
    };
}

export function wiresFromLsState(layoutBase: IEditSnapshot, ls: ILSState, compLibrary: CompLibrary): IEditSnapshot {

    let wireIdx = 0;
    let newWires: IWireGraph[] = ls.wires.map(w => ({
        id: '' + wireIdx++,
        nodes: w.nodes.map(n => ({
            id: n.id,
            pos: new Vec3(n.x, n.y),
            edges: n.edges,
            ref: n.ref,
        })),
    }));

    let maxWireId = 0;
    for (let w of newWires) {
        maxWireId = Math.max(maxWireId, parseInt(w.id));
    }

    checkWires(newWires, 'wiresFromLsState');

    let lsCompLookup = new Map<string, ILSComp>();
    for (let c of ls.comps) {
        lsCompLookup.set(c.id, c);
    }

    let comps: IComp[] = ls.comps.map(c => {
        let comp = compLibrary.create(c.defId, c.args);

        comp.id = c.id;
        comp.pos = new Vec3(c.x, c.y);
        comp.subSchematicId = c.subSchematicId;

        return comp;
    });

    let maxCompId = 0;
    for (let c of comps) {
        maxCompId = Math.max(maxCompId, parseInt(c.id));
    }

    return assignImm(layoutBase, {
        mainSchematic: assignImm(layoutBase.mainSchematic, {
            nextWireId: maxWireId + 1,
            nextCompId: maxCompId + 1,
            parentCompDefId: ls.parentCompDefId,
            wires: newWires,
            comps: comps,
        }),
    });
}

export function schematicToLsState(layout: ISchematic): ILSState {
    return {
        wires: layout.wires
            .filter(w => w.nodes.length > 0)
            .map(w => ({
                nodes: w.nodes.map(n => ({ id: n.id, x: n.pos.x, y: n.pos.y, edges: n.edges, ref: n.ref })),
            })),
        comps: layout.comps.map(c => ({
            id: c.id,
            defId: c.defId,
            x: c.pos.x,
            y: c.pos.y,
            args: c.args,
            subSchematicId: c.subSchematicId,
        })),
    };
}

