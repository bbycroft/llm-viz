import { IGpuGptBlockLayer, IGpuGptModel, IGpuLayerNormLayer, IModelShape } from "./GptModel";
import { isNil } from "./utils/data";
import { Mat4f } from "./utils/matrix";
import { Dim } from "./utils/vector";
import { IBufferTex } from "./utils/renderPhases";
import { dimProps } from "./Annotations";
import { DimStyle, dimStyleColor } from "./walkthrough/WalkthroughTools";

export interface IBlkDef {
    t: 'w' | 'i' | 'a', // weights; intermediate value; aggregate (just LN & softmax)
    x: number;
    y: number;
    z: number;
    dx: number; // units: model-space
    dy: number;
    dz: number;
    cx: number; // units: number of cells
    cy: number;
    cz: number;
    access?: IBlkAccess;
    deps?: IBlkDeps;
    dimX: DimStyle;
    dimY: DimStyle;
    name: string;
    // implicit dimZ = DimStyle.Batch for t === 'i'

    // fields that are post-added by the walk-through for various rendering configurations

    localMtx?: Mat4f; // for creating blocks that are sub-parts of a block
    // what to do for different axes?
    rangeOffsetsX?: [number, number][]; // if this block has been split, map from [[s0, xOff], [s1, xOff], ...] to the original block
    rangeOffsetsY?: [number, number][];
    rangeOffsetsZ?: [number, number][];
    highlight: number; // 0 - 1 (0 = no highlight, 1 = full highlight)
    opacity: number; // 0 - 1 (0 = transparent, 1 = opaque)
    subs?: IBlkDef[]; // substitutes for this block (i.e. render these instead)
}

// define how a cell is computed from other blocks
// matrix-mulplication: cell(x, y, b) = sum_i(A[i, y] * B[x, i, b]) + C[0, y]
export interface IBlkDeps {
    dot?: [IBlkCellDep, IBlkCellDep];
    dotLen?: number;
    add?: IBlkCellDep[];
    special: BlKDepSpecial;
    lowerTri?: boolean;
}

export interface IBlkCellDep {
    src: IBlkDef;
    srcIdxMtx: Mat4f; // inputs: [x, y, b, [i]], outputs: [x, y, b]
}

interface IBlkDepArgs {
    dot?: [[IBlkDef, string], [IBlkDef, string]];
    dotLen?: number;
    add?: [IBlkDef, string][];
    lowerTri?: boolean; // only use the lower triangle of the matrix (causal attention matrices)
    special?: BlKDepSpecial;
}

export enum BlKDepSpecial {
    None,
    Softmax,
    Gelu,
    LayerNorm,
    InputEmbed,
    LayerNormMu,
    LayerNormSigma,
    SoftmaxAggMax,
    SoftmaxAggExp,
    Attention,
}

let depIdxVars = '0xybi';
function parseDepIdxStr(str: string): Mat4f {
    let mtx = Mat4f.zeros();
    for (let destI = 0; destI < str.length; destI++) {
        let srcIdx = depIdxVars.indexOf(str[destI]);
        if (srcIdx > 0) {
            mtx.s(destI, srcIdx - 1, 1.0);
        }
    }
    return mtx;
}

function depArgsToDeps(args: IBlkDepArgs): IBlkDeps {
    let makeBlkDeps = (src: IBlkDef, depStr: string) => ({ src, srcIdxMtx: parseDepIdxStr(depStr) });
    return {
        dot: args.dot && args.dot.map(([src, depStr]) => makeBlkDeps(src, depStr)) as [IBlkCellDep, IBlkCellDep],
        dotLen: args.dotLen,
        add: args.add && args.add.map(([src, depStr]) => makeBlkDeps(src, depStr)),
        special: args.special ?? BlKDepSpecial.None,
        lowerTri: args.lowerTri,
    };
}

export interface IBlkAccess {
    src: IBufferTex;
    channel: 'r' | 'g' | 'b';
    scale: number;
    mat: Mat4f; // actually using the first two columns for a 3x2 matrix: mapping (x, y, z) integer cell coord to (x, y) src tex coord
    disable?: boolean;
}

interface IBlkAccessDefArgs {
    src?: IBufferTex;
    channel?: 'r' | 'g' | 'b';
    scale?: number;
    x: number[];
    y: number[];
}

interface IBlkDefArgs {
    t: 'w' | 'i' | 'a', // weights; intermediate value
    xL?: number; // pos of Left edge
    xR?: number; // Right
    xM?: number; // Middle
    zF?: number; // Front
    zB?: number; // Back
    zM?: number; // Middle
    name?: string;
    y: number;
    cx: number; // units: number of cells
    cz: number;
    cy: number;
    dimX: DimStyle;
    dimY: DimStyle;
    access?: IBlkAccessDefArgs;
    deps?: IBlkDepArgs;
}

export interface IBlkLabel {
    visible: number;
    cubes: IBlkDef[];
}

export interface IModelLayout {
    cell: number;
    height: number;
    margin: number;
    cubes: IBlkDef[];
}

export function cellPosition(layout: IModelLayout, blk: IBlkDef, dim: Dim, index: number) {
    let { x, rangeOffsets } = dimProps(blk, dim);
    let base = x + layout.cell * index;
    if (!rangeOffsets) {
        return base;
    }
    for (let [s, xOff] of rangeOffsets!) {
        if (index < s) {
            return base + xOff;
        }
    }
    return base;
}

export type IGptModelLayout = ReturnType<typeof genGptModelLayout>;

export function genGptModelLayout(shape: IModelShape, gptGpuModel: IGpuGptModel | null = null) {
    let { B, T, C, vocabSize, nHeads, A, nBlocks } = shape;

    // work our way downwards from the top
    // x is to the left and right
    // y is coming out of the page
    // z is going up, and the stack advances down from the top (at (0, 0, 0))

    // a single batch of the residual pathway goes down the x-z plane
    // weights & off-residual pathways are left & right of the residual pathway (i.e. along x)
    // those blocks might have y-depth but that's OK: still have space to add batches
    // x = 0 is just to the left of time-cell t=0

    let y = 0;

    let cell = 1.5;
    let margin = Math.max(12, C / 6);

    function mk(args: IBlkDefArgs): IBlkDef {
        let xDef = [args.xL, args.xR, args.xM].map(a => +!isNil(a)).reduce((a, b) => a + b, 0);
        let yDef = [args.zF, args.zB, args.zM].map(a => +!isNil(a)).reduce((a, b) => a + b, 0);
        if (xDef !== 1 || yDef !== 1) {
            throw new Error(`Must supply exactly 1 x arg & 1 y arg: ${JSON.stringify(args)}`);
        }
        let dx = args.cx * cell;
        let dy = args.cz * cell;
        let x = !isNil(args.xL) ? args.xL : !isNil(args.xR) ? args.xR - dx : args.xM! - dx / 2;
        let z = !isNil(args.zB) ? args.zB : !isNil(args.zF) ? args.zF - dy : args.zM! - dy / 2;

        function ensure4(a: number[]) {
            return a.length === 4 ? a : [...a, 0];
        }

        return {
            t: args.t,
            x: x,
            y: args.y,
            z: z,
            dx: args.cx * cell,
            dy: args.cy * cell,
            dz: args.cz * cell,
            cx: args.cx,
            cy: args.cy,
            cz: args.cz,
            dimX: args.dimX,
            dimY: args.dimY,
            name: args.name ?? "<unknown>",
            access: args.access?.src ? {
                channel: args.access.channel ?? 'r',
                src: args.access.src,
                scale: args.access.scale ?? 10.0,
                mat: Mat4f.fromColMajor([...ensure4(args.access.x), ...ensure4(args.access.y), 0, 0, 0, 0, 0, 0, 0, 0]),
            } : undefined,
            deps: args.deps ? depArgsToDeps(args.deps) : undefined,
            opacity: 1.0,
            highlight: 0.0,
        };
    }

    function mkLabel(init: number, cubes?: IBlkDef[]): IBlkLabel {
        return { visible: 0, cubes: cubes ?? [] };
    }

    let cubes: IBlkDef[] = [];

    let idxObj = mk({
        t: 'i', cx: T, cz: B, cy: 1, y: y,
        xM: 0, zM: 0,
        access: { src: gptGpuModel?.inputTokens, x: [0, 1, 0], y: [1, 0, T], scale: 1 / vocabSize},
        dimX: DimStyle.T, dimY: DimStyle.None,
        name: 'Tokens',
    });

    let leftX = -T * cell / 2 - margin;
    let rightX = T * cell / 2 + margin;

    y += cell + margin;

    let tokEmbedObj = mk({
        t: 'w',
        xR: leftX, zM: 0, y: y,
        cx: vocabSize, cz: 1, cy: C, // src has shape [vocabSize, C]
        access: { src: gptGpuModel?.vocabEmbed.weight, x: [0, 1, 0], y: [1, 0, 0] },
        dimX: DimStyle.n_vocab, dimY: DimStyle.C,
        name: 'Token Embed',
    });

    let posEmbedObj = mk({
        t: 'w',
        xL: rightX, zM: 0, y: y,
        cx: T, cz: 1, cy: C,
        access: { src: gptGpuModel?.posEmbed.weight, x: [0, 1, 0], y: [1, 0, 0] },
        dimX: DimStyle.T, dimY: DimStyle.C,
        name: 'Position Embed',
    });

    let residual0 = mk({
        t: 'i',
        xM: 0, zM: 0, y: y,
        cx: T, cz: B, cy: C,
        access: { src: gptGpuModel?.add.output, x: [0, 1, 0], y: [1, 0, T] },
        deps: { add: [[tokEmbedObj, 'iy'], [posEmbedObj, 'xy'], [idxObj, 'x0']], special: BlKDepSpecial.InputEmbed }, // the i comes from the idxObj lookup
        dimX: DimStyle.T, dimY: DimStyle.C,
        name: 'Input Embed',
    });
    cubes.push(idxObj, tokEmbedObj, posEmbedObj, residual0);

    let embedLabel = mkLabel(y, [idxObj, tokEmbedObj, posEmbedObj, residual0]);

    y += C * cell + margin;

    function createLn(x: number, src: IBlkDef, target?: IGpuLayerNormLayer) {
        let lnLeftX = leftX + x;
        let resLeftX = lnLeftX - T * cell - margin;

        let lnAgg1 = mk({
            t: 'a', cx: T, cz: B, cy: 1, y: y,
            xR: lnLeftX, zM: 0,
            access: { src: target?.normAgg, x: [0, 1, 0], y: [1, 0, T], scale: 10.0, channel: 'r' },
            deps: { add: [[src, 'xi']], special: BlKDepSpecial.LayerNormMu },
            dimX: DimStyle.T, dimY: DimStyle.None,
            name: 'LN Agg: μ, 1/σ',
        });
        let lnAgg2 = mk({
            t: 'a', cx: T, cz: B, cy: 1, y: y + cell,
            xR: lnLeftX, zM: 0,
            access: { src: target?.normAgg, x: [0, 1, 0], y: [1, 0, T], scale: 10.0, channel: 'g' },
            deps: { add: [[src, 'xi']], special: BlKDepSpecial.LayerNormSigma },
            dimX: DimStyle.T, dimY: DimStyle.None,
            name: '',
        });

        y += 2 * cell + margin;

        let lnSigma = mk({
            t: 'w', cx: 1, cz: 1, cy: C, y: y,
            xR: resLeftX, zM: 0,
            access: { src: target?.normWeight, x: [1, 0, 0], y: [0, 1, 0], scale: 0.5 }, // mostly around 1.0
            dimX: DimStyle.None, dimY: DimStyle.C,
            name: 'γ',
        });
        let lnMu = mk({
            t: 'w', cx: 1, cz: 1, cy: C, y: y,
            xR: resLeftX - cell * 1 - margin, zM: 0,
            access: { src: target?.normBias, x: [1, 0, 0], y: [0, 1, 0] },
            dimX: DimStyle.None, dimY: DimStyle.C,
            name: 'β',
        });
        let lnResid = mk({
            t: 'i', cx: T, cz: B, cy: C, y: y,
            xR: lnLeftX, zM: 0,
            access: { src: target?.output, x: [0, 1, 0], y: [1, 0, T], scale: 1.0 },
            deps: { add: [[src, 'xy'], [lnAgg1, 'xi'], [lnAgg2, 'xi'], [lnSigma, '0y'], [lnMu, '0y']], special: BlKDepSpecial.LayerNorm }, // lnSigma is really mul rather than add
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'Layer Norm',
        });
        let lnCubes = [lnAgg1, lnAgg2, lnSigma, lnMu, lnResid];
        return { lnAgg1, lnAgg2, lnResid, lnSigma, lnMu, cubes: lnCubes };
    }

    let lnLeftX = leftX - (T + 2) * cell - 3 * margin;

    function createBlock(src: IBlkDef, target: IGpuGptBlockLayer | undefined) {
        let ln1 = createLn(0, src, target?.ln_1);

        let interHeadMargin = 3 * margin + (C * cell) / 16;
        let qkvMargin = 1 * margin + (C * cell) / 16;

        let headWidth = 3 * B * cell + qkvMargin * 2 + interHeadMargin;

        let attn1Y = y + A * cell + margin;
        let attn2Y = attn1Y; // + T * cell + margin;
        let vOutY = attn2Y + T * cell + margin;

        let attnLeftX = lnLeftX; // leftX - ((T + 2) * cell + 3 * margin);
        let qkvValLeftX = attnLeftX - T * cell - margin;
        let qkvBiasLeftX = qkvValLeftX - C * cell - margin;
        let stepPerHeadY = 0; // A * cell;

        let attnTarget = target?.attn;

        let heads = [];
        for (let i = 0; i < nHeads; i++) {
            let headZMid = headWidth * i - (nHeads - 1) * headWidth / 2;
            let qMid = headZMid + B * cell + qkvMargin;
            let kMid = headZMid;
            let vMid = headZMid - B * cell - qkvMargin;

            let qWeightBlock = mk({
                t: 'w', cx: C, cz: 1, cy: A, y: y,
                xR: qkvValLeftX, zM: qMid,
                access: { src: attnTarget?.qkvWeight, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'r' },
                dimX: DimStyle.C, dimY: DimStyle.A,
                name: 'Q Weights',
            });

            let kWeightBlock = mk({
                t: 'w', cx: C, cz: 1, cy: A, y: y,
                xR: qkvValLeftX, zM: kMid,
                access: { src: attnTarget?.qkvWeight, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'g' },
                dimX: DimStyle.C, dimY: DimStyle.A,
                name: 'K Weights',
            });

            let vWeightBlock = mk({
                t: 'w', cx: C, cz: 1, cy: A, y: y,
                xR: qkvValLeftX, zM: vMid,
                access: { src: attnTarget?.qkvWeight, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'b' },
                dimX: DimStyle.C, dimY: DimStyle.A,
                name: 'V Weights',
            });

            let qBiasBlock = mk({
                t: 'w', cx: 1, cz: 1, cy: A, y: y,
                xR: qkvBiasLeftX, zM: qMid,
                access: { src: attnTarget?.qkvBias, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'r' },
                dimX: DimStyle.None, dimY: DimStyle.A,
                name: 'Q Bias',
            });

            let kBiasBlock = mk({
                t: 'w', cx: 1, cz: 1, cy: A, y: y,
                xR: qkvBiasLeftX, zM: kMid,
                access: { src: attnTarget?.qkvBias, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'g' },
                dimX: DimStyle.None, dimY: DimStyle.A,
                name: 'K Bias',
            });

            let vBiasBlock = mk({
                t: 'w', cx: 1, cz: 1, cy: A, y: y,
                xR: qkvBiasLeftX, zM: vMid,
                access: { src: attnTarget?.qkvBias, x: [1, 0, 0], y: [0, 1, 0, A * i], channel: 'b' },
                dimX: DimStyle.None, dimY: DimStyle.A,
                name: 'V Bias',
            });

            let qBlock = mk({
                t: 'i', cx: T, cz: B, cy: A, y: y,
                xR: attnLeftX, zM: qMid,
                access: { src: attnTarget?.qkvOutput, x: [0, 1, 0], y: [1, 0, T * nHeads, 0, T * i], channel: 'r', scale: 1.0 },
                deps: { dot: [[qWeightBlock, 'iy'], [ln1.lnResid, 'xi']], add: [[qBiasBlock, '0y']], dotLen: C },
                dimX: DimStyle.T, dimY: DimStyle.A,
                name: 'Q vectors',
            });

            let kBlock = mk({
                t: 'i', cx: T, cz: B, cy: A, y: y,
                xR: attnLeftX, zM: kMid,
                access: { src: attnTarget?.qkvOutput, x: [0, 1, 0], y: [1, 0, T * nHeads, T * i], channel: 'g', scale: 1.0 },
                deps: { dot: [[kWeightBlock, 'iy'], [ln1.lnResid, 'xi']], add: [[kBiasBlock, '0y']], dotLen: C },
                dimX: DimStyle.T, dimY: DimStyle.A,
                name: 'K vectors',
            });

            let vBlock = mk({
                t: 'i', cx: T, cz: B, cy: A, y: y,
                xR: attnLeftX, zM: vMid,
                access: { src: attnTarget?.qkvOutput, x: [0, 1, 0], y: [1, 0, T * nHeads, T * i], channel: 'b', scale: 1.0 },
                deps: { dot: [[vWeightBlock, 'iy'], [ln1.lnResid, 'xi']], add: [[vBiasBlock, '0y']], dotLen: C },
                dimX: DimStyle.T, dimY: DimStyle.A,
                name: 'V vectors',
            });

            let attn2LeftX = attnLeftX - (T + 2) * cell - 2 * margin;

            let attnMtx = mk({
                t: 'i', cx: T, cz: B, cy: T, y: attn1Y,
                xR: attnLeftX, zM: headZMid,
                access: { src: attnTarget?.attnMatrix, x: [1, 0, 0], y: [0, 1, nHeads * T, T * i], scale: 1.0 },
                deps: { dot: [[qBlock, 'yi'], [kBlock, 'xi']], lowerTri: true, dotLen: A, special: BlKDepSpecial.Attention },
                dimX: DimStyle.T, dimY: DimStyle.T,
                name: 'Attention Matrix',
            });

            let attnMtxAgg1 = mk({
                t: 'a', cx: 1, cz: B, cy: T, y: attn1Y,
                xR: attnLeftX - T * cell - margin - cell, zM: headZMid,
                access: { src: attnTarget?.attnMatrixSoftmax, x: [0, 0, 0, 1], y: [0, 1, nHeads * T, T * i], scale: 1.0, channel: 'r' },
                deps: { add: [[attnMtx, 'iy']], special: BlKDepSpecial.SoftmaxAggExp },
                dimX: DimStyle.None, dimY: DimStyle.T,
                name: '',
            });

            let attnMtxAgg2 = mk({
                t: 'a', cx: 1, cz: B, cy: T, y: attn1Y,
                xR: attnLeftX - T * cell - margin, zM: headZMid,
                access: { src: attnTarget?.attnMatrixSoftmax, x: [0, 0, 0, 1], y: [0, 1, nHeads * T, T * i], scale: 1.0, channel: 'g' },
                deps: { add: [[attnMtx, 'iy']], special: BlKDepSpecial.SoftmaxAggMax },
                dimX: DimStyle.None, dimY: DimStyle.T,
                name: '',
            });

            let attnMtxSm = mk({
                t: 'i', cx: T, cz: B, cy: T, y: attn1Y,
                xR: attn2LeftX, zM: headZMid,
                access: { src: attnTarget?.attnMatrixSoftmax, x: [1, 0, 0], y: [0, 1, nHeads * T, T * i], scale: 1.0 },
                deps: { add: [[attnMtx, 'xy'], [attnMtxAgg1, 'iy'], [attnMtxAgg2, 'iy']], lowerTri: true, special: BlKDepSpecial.Softmax },
                dimX: DimStyle.T, dimY: DimStyle.T,
                name: 'Attn Matrix Softmax',
            });

            let vOutBlock = mk({
                t: 'i', cx: T, cz: B, cy: A, y: vOutY + i * stepPerHeadY,
                xR: attnLeftX, zM: headZMid,
                access: { src: attnTarget?.scaledVectors, x: [0, 1, 0, i * A], y: [1, 0, T] },
                deps: { dot: [[vBlock, 'iy'], [attnMtxSm, 'ix']], dotLen: A }, 
                dimX: DimStyle.T, dimY: DimStyle.A,
                name: 'V Output',
            });

            let headCubes = [qWeightBlock, kWeightBlock, vWeightBlock,
                qBiasBlock, kBiasBlock, vBiasBlock,
                qBlock, kBlock, vBlock,
                attnMtx, attnMtxAgg1, attnMtxAgg2, attnMtxSm, vOutBlock];

            let headLabel = mkLabel(1.0, headCubes);
            let qLabel = mkLabel(1.0, [qWeightBlock, qBiasBlock, qBlock]);
            let kLabel = mkLabel(1.0, [kWeightBlock, kBiasBlock, kBlock]);
            let vLabel = mkLabel(1.0, [vWeightBlock, vBiasBlock, vBlock]);
            let biasLabel = mkLabel(1.0, [qBiasBlock, kBiasBlock, vBiasBlock]);
            let mtxLabel = mkLabel(1.0, [attnMtx, attnMtxAgg1, attnMtxAgg2, attnMtxSm]);
            let vectorLabel = mkLabel(1.0, [vOutBlock]);

            let head = {
                qWeightBlock, kWeightBlock, vWeightBlock,
                qBiasBlock, kBiasBlock, vBiasBlock,
                qBlock, kBlock, vBlock,
                attnMtx, attnMtxAgg1, attnMtxAgg2, attnMtxSm, vOutBlock,
                qLabel, kLabel, vLabel, biasLabel, mtxLabel, vectorLabel, headLabel,
                cubes: headCubes,
                labels: [qLabel, kLabel, vLabel, biasLabel, mtxLabel, vectorLabel, headLabel],
            };
            heads.push(head);
        }

        let vOutCombined = mk({
            t: 'i', cx: T, cz: B, cy: C, y: vOutY,
            xR: attnLeftX, zF: - headWidth * nHeads / 2,
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'V Output Combined',
        });

        let vFinalZ = Math.max(
            vOutY + stepPerHeadY * (nHeads - 1) + A * cell + 2 * margin,
            y + C * cell + margin, // in case the layer norm block is shorter
        );

        let projWeight = mk({
            t: 'w', cx: C, cz: 1, cy: C, y: vFinalZ,
            xR: qkvValLeftX, zM: 0,
            access: { src: attnTarget?.proj.weight, x: [1, 0, 0], y: [0, 1, 0], scale: C * 0.5 },
            dimX: DimStyle.C, dimY: DimStyle.C,
            name: 'Projection Weights',
        });

        let projBias = mk({
            t: 'w', cx: 1, cz: 1, cy: C, y: vFinalZ,
            xR: qkvValLeftX - C * cell - margin, zM: 0,
            access: { src: attnTarget?.proj.bias!, x: [0, 0, 0], y: [0, 1, 0], scale: C * 0.5 },
            dimX: DimStyle.None, dimY: DimStyle.C,
            name: 'Projection Bias',
        });

        let attnOut = mk({
            t: 'i', cx: T, cz: B, cy: C, y: vFinalZ,
            xR: attnLeftX, zM: 0,
            access: { src: attnTarget?.proj.output, x: [0, 1, 0], y: [1, 0, T] },
            // deps: { dot: [[projWeight, 'iy'], [vOutCombined, 'xi']], dotLen: C }
            // vOutCombined isn't displayed atm, so add from the heads instead
            deps: {
                dot: [[projWeight, 'iy'], [vOutCombined, 'xi']], dotLen: C,
                add: [[projBias, '0y'], ...heads.map(h => [h.vOutBlock, 'xi'] as [IBlkDef, string])]
            },
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'Attention Output',
        });

        let attnResidual = mk({
            t: 'i', cx: T, cz: B, cy: C, y: vFinalZ,
            xM: 0, zM: 0,
            access: { src: attnTarget?.output, x: [0, 1, 0], y: [1, 0, T] },
            deps: { add: [[attnOut, 'xy'], [src, 'xy']] },
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'Attention Residual',
        });

        y = vFinalZ + C * cell + margin;

        let ln2 = createLn(0, attnResidual, target?.ln_2);

        let mlpFcWeight = mk({
            t: 'w', cx: C * 4, cz: 1, cy: C, y: y,
            xR: attnLeftX, zM: 0,
            access: { src: target?.mlp.fcLayer.weight, x: [0, 1, 0], y: [1, 0, 0], scale: C * 0.5 },
            dimX: DimStyle.C4, dimY: DimStyle.C,
            name: 'MLP Weights',
        });

        let mlpFcBias = mk({
            t: 'w', cx: C * 4, cz: 1, cy: 1, y: y - 1 * cell - margin,
            xR: attnLeftX, zM: 0,
            access: { src: target?.mlp.fcLayer.bias!, x: [0, 1, 0], y: [1, 0, 0], scale: C * 0.5 },
            dimX: DimStyle.C4, dimY: DimStyle.None,
            name: 'MLP Bias',
        });

        y += C * cell + margin;

        let mlpFc = mk({
            t: 'i', cx: C * 4, cz: B, cy: T, y: y,
            xR: attnLeftX, zM: 0,
            access: { src: target?.mlp.fcLayer.output, x: [1, 0, 0], y: [0, 1, T] },
            deps: { dot: [[mlpFcWeight, 'xi'], [ln2.lnResid, 'yi']], dotLen: C, add: [[mlpFcBias, 'x']] },
            dimX: DimStyle.C4, dimY: DimStyle.T,
            name: 'MLP',
        });

        y += T * cell + margin;

        let mlpAct = mk({
            t: 'i', cx: C * 4, cz: B, cy: T, y: y,
            xR: attnLeftX, zM: 0,
            access: { src: target?.mlp.mlpGelu, x: [1, 0, 0], y: [0, 1, T] },
            deps: { add: [[mlpFc, 'xy']], special: BlKDepSpecial.Gelu },
            dimX: DimStyle.C4, dimY: DimStyle.T,
            name: 'MLP Activation',
        });

        y += T * cell + margin;

        let mlpProjWeight = mk({
            t: 'w', cx: C * 4, cz: 1, cy: C, y: y,
            xR: attnLeftX, zM: 0,
            access: { src: target?.mlp.projLayer.weight, x: [1, 0, 0], y: [0, 1, 0], scale: C * 0.5 },
            dimX: DimStyle.C4, dimY: DimStyle.C,
            name: 'MLP Projection Weights',
        });

        let mlpProjBias = mk({
            t: 'w', cx: 1, cz: 1, cy: C, y: y,
            xR: attnLeftX - C * 4 * cell - margin, zM: 0,
            access: { src: target?.mlp.projLayer.bias!, x: [1, 0, 0], y: [0, 1, 0], scale: C * 0.5 },
            dimX: DimStyle.None, dimY: DimStyle.C,
            name: 'MLP Projection Bias',
        });

        let mlpResult = mk({
            t: 'i', cx: T, cz: B, cy: C, y: y,
            xL: attnLeftX + margin, zM: 0,
            access: { src: target?.mlp.projLayer.output, x: [0, 1, 0], y: [1, 0, T] },
            deps: { dot: [[mlpProjWeight, 'iy'], [mlpAct, 'ix']], dotLen: C, add: [[mlpProjBias, '0y']] },
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'MLP Result',
        });

        let mlpResidual = mk({
            t: 'i', cx: T, cz: B, cy: C, y: y,
            xM: 0, zM: 0,
            access: { src: target?.mlp.output, x: [0, 1, 0], y: [1, 0, T] },
            deps: { add: [[mlpResult, 'xy'], [attnResidual, 'xy']] },
            dimX: DimStyle.T, dimY: DimStyle.C,
            name: 'MLP Residual',
        });

        y += C * cell - margin;

        let blockCubes = [
            ...ln1.cubes,
            ...heads.flatMap(h => h.cubes),
            projWeight,
            projBias,
            attnOut,
            attnResidual,
            ...ln2.cubes,
            mlpFcWeight,
            mlpFcBias,
            mlpFc,
            mlpAct,
            mlpProjWeight,
            mlpProjBias,
            mlpResult,
            mlpResidual,
        ]

        let headCubes = [...ln1.cubes, ...heads.flatMap(h => h.cubes)];
        let projCubes = [projWeight, projBias, attnOut, attnResidual];

        let transformerLabel = mkLabel(1.0, blockCubes);
        let selfAttendLabel = mkLabel(1.0, [...headCubes, ...projCubes]);
        let projLabel = mkLabel(1.0, projCubes);
        let mlpLabel = mkLabel(1.0, [...ln2.cubes, mlpFcWeight, mlpFcBias, mlpFc, mlpAct, mlpProjWeight, mlpProjBias, mlpResult, mlpResidual]);

        cubes.push(...blockCubes);

        return {
            ln1,
            heads,
            labels: [transformerLabel, projLabel, selfAttendLabel, mlpLabel, ...heads.flatMap(h => h.labels)],
            cubes: blockCubes,
            transformerLabel,
            projLabel,
            selfAttendLabel,
            mlpLabel,
            projWeight,
            projBias,
            attnOut,
            attnResidual,
            mlpFc,
            mlpFcWeight,
            mlpFcBias,
            mlpAct,
            mlpProjWeight,
            mlpProjBias,
            mlpResult,
            mlpResidual,
            ln2,
        };
    }

    let blockHalfMargin = 2 * margin;

    y += blockHalfMargin;

    let blocks: ReturnType<typeof createBlock>[] = [];
    let blockSrc = residual0;
    for (let i = 0; i < nBlocks; i++) {
        let target = gptGpuModel?.blocks[i];
        y += blockHalfMargin;
        let block = createBlock(blockSrc, target);
        blocks.push(block);
        blockSrc = block.mlpResidual;
        y += blockHalfMargin;
    }

    y += blockHalfMargin;
    let ln_f = createLn(0, blockSrc, gptGpuModel?.ln_f);

    cubes.push(...ln_f.cubes);

    let logitsTransposed = false;

    let lmHeadWeight: IBlkDef, logits: IBlkDef, logitsAgg1: IBlkDef, logitsAgg2: IBlkDef, logitsSoftmax: IBlkDef;

    if (logitsTransposed) {
        lmHeadWeight = mk({
            t: 'w', cx: vocabSize, cz: 1, cy: C, y: y,
            xR: lnLeftX, zM: 0,
            access: { src: gptGpuModel?.lm_head.weight, x: [0, 1, 0], y: [1, 0, 0], scale: 5.0 },
            dimX: DimStyle.n_vocab, dimY: DimStyle.C,
            name: 'LM Head Weights',
        });

        y += C * cell + margin;

        logits = mk({
            t: 'i', cx: vocabSize, cz: B, cy: T, y: y,
            xR: lnLeftX, zM: 0,
            access: { src: gptGpuModel?.lm_head.output, x: [1, 0, 0], y: [0, 1, T] },
            deps: { dot: [[lmHeadWeight, 'xi'], [ln_f.lnResid, 'yi']], dotLen: C },
            dimX: DimStyle.n_vocab, dimY: DimStyle.T,
            name: 'Logits',
        });

        // z += vocabSize * cell + margin;

        logitsAgg1 = mk({
            t: 'a', cx: 1, cz: B, cy: T, y: y,
            xL: lnLeftX + 1.5 * margin, zM: -3 * cell,
            access: { src: gptGpuModel?.softmaxFinal.agg, x: [1, 0, 0], y: [0, 1, T], channel: 'r' },
            deps: { add: [[logits, 'iy']], special: BlKDepSpecial.SoftmaxAggExp },
            dimX: DimStyle.None, dimY: DimStyle.T,
            name: 'SM Agg',
        });

        logitsAgg2 = mk({
            t: 'a', cx: 1, cz: B, cy: T, y: y,
            xL: lnLeftX + 1.5 * margin + cell, zM: -3 * cell,
            access: { src: gptGpuModel?.softmaxFinal.agg, x: [1, 0, 0], y: [0, 1, T], channel: 'g' },
            deps: { add: [[logits, 'iy']], special: BlKDepSpecial.SoftmaxAggMax },
            dimX: DimStyle.None, dimY: DimStyle.T,
            name: '',
        });

        y += T * cell + margin;

        logitsSoftmax = mk({
            t: 'i', cx: vocabSize, cz: B, cy: T, y: y,
            xR: lnLeftX, zM: 0,
            access: { src: gptGpuModel?.softmaxFinal.output, x: [1, 0, 0], y: [0, 1, T] },
            deps: { add: [[logits, 'xy'], [logitsAgg1, 'iy'], [logitsAgg2, 'iy']], special: BlKDepSpecial.Softmax },
            dimX: DimStyle.n_vocab, dimY: DimStyle.T,
            name: 'Logits Softmax',
        });

    } else {
        y += C * cell + margin;
        let leftX2 = leftX - T * cell - margin;

        lmHeadWeight = mk({
            t: 'w', cx: C, cy: vocabSize, cz: 1, y: y,
            xR: leftX2, zM: 0,
            access: { src: gptGpuModel?.lm_head.weight, x: [1, 0, 0], y: [0, 1, 0], scale: 5.0 },
            dimX: DimStyle.C, dimY: DimStyle.n_vocab,
            name: 'LM Head Weights',
        });


        logits = mk({
            t: 'i', cx: T, cy: vocabSize, cz: B, y: y,
            xR: leftX, zM: 0,
            access: { src: gptGpuModel?.lm_head.output, x: [0, 1, 0], y: [1, 0, T] },
            deps: { dot: [[lmHeadWeight, 'iy'], [ln_f.lnResid, 'xi']], dotLen: C },
            dimX: DimStyle.T, dimY: DimStyle.n_vocab,
            name: 'Logits',
        });

        y += vocabSize * cell + margin;

        logitsAgg2 = mk({
            t: 'a', cx: T, cy: 1, cz: B, y: y,
            xR: leftX, zM: 0,
            access: { src: gptGpuModel?.softmaxFinal.agg, x: [0, 1, 0], y: [1, 0, T], channel: 'g' },
            deps: { add: [[logits, 'xi']], special: BlKDepSpecial.SoftmaxAggMax },
            dimX: DimStyle.T, dimY: DimStyle.None,
            name: 'SM Agg',
        });

        logitsAgg1 = mk({
            t: 'a', cx: T, cy: 1, cz: B, y: y + cell,
            xR: leftX, zM: 0,
            access: { src: gptGpuModel?.softmaxFinal.agg, x: [0, 1, 0], y: [1, 0, T], channel: 'r' },
            deps: { add: [[logits, 'xi'], [logitsAgg2, 'x0']], special: BlKDepSpecial.SoftmaxAggExp },
            dimX: DimStyle.T, dimY: DimStyle.None,
            name: '',
        });

        y += 2 * cell + margin;

        logitsSoftmax = mk({
            t: 'i', cx: T, cy: vocabSize, cz: B, y: y,
            xR: leftX, zM: 0,
            access: { src: gptGpuModel?.softmaxFinal.output, x: [0, 1, 0], y: [1, 0, T] },
            deps: { add: [[logits, 'xy'], [logitsAgg1, 'xi'], [logitsAgg2, 'xi']], special: BlKDepSpecial.Softmax },
            dimX: DimStyle.T, dimY: DimStyle.n_vocab,
            name: 'Logits Softmax',
        });

    }

    // let logitsSoftmaxTopN = mk({
    //     t: 'i', cx: T, cz: B, cy: Math.min(32, vocabSize), y: y,
    //     xM: 0, zM: 0,
    // });

    let weightCount = vocabSize*C + T*C +
        nBlocks * ((2*C + 4*C*C + C + 3*C) + // self attn
                   (2*C + 4*C + 8*C*C + C)) + 2*C; // mlp

    // let decoderCount = vocabSize * C; (excluded from the weight count apparently)

    cubes.push(lmHeadWeight, logits, logitsAgg1, logitsAgg2, logitsSoftmax);

    return {
        cubes,
        cell,
        margin,
        idxObj,
        tokEmbedObj,
        posEmbedObj,
        residual0,
        ln_f,
        lmHeadWeight,
        logits,
        logitsAgg1,
        logitsAgg2,
        logitsSoftmax,
        embedLabel,
        blocks,
        height: y,
        logitsTransposed,
        model: gptGpuModel,
        labels: [embedLabel, ...blocks.flatMap(b => b.labels)],
        weightCount,
        shape,
        extraSources: {
            idx: gptGpuModel?.inputBuf,
            tokEmbedOut: gptGpuModel?.vocabEmbed.output,
            posEmbedOut: gptGpuModel?.posEmbed.output,
        },
    };
}

