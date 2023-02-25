import { IModelShape } from "./GptModel";

interface IBlkDef {
    t: 'w' | 'i', // weights; intermediate value
    x: number;
    y: number;
    z: number;
    cx: number; // units: number of cells
    cy: number;
    cz: number;
}

export function genModelStructure(shape: IModelShape) {
    let { B, T, C, vocabSize } = shape;

    // work our way downwards from the top
    // x is to the left and right
    // y is coming out of the page
    // z is going down the stack

    // a single batch of the residual pathway goes down the x-z plane
    // weights & off-residual pathways are left & right of the residual pathway (i.e. along x)
    // those blocks might have y-depth but that's OK: still have space to add batches
    // x = 0 is just to the left of time-cell t=0

    let z = 0;

    let cell = 1;
    let margin = 2;

    let blocks: IBlkDef[] = [];

    let idxObj: IBlkDef = {
        t: 'i',
        x: 0,
        y: 0,
        z: z,
        cx: T,
        cy: B,
        cz: 1,
    };

    let leftX = -margin;
    let rightX = T * cell + margin;

    z += cell + margin;

    let tokEmbedObj: IBlkDef = {
        t: 'w',
        x: leftX - vocabSize * cell, y: 0, z: z,
        cx: vocabSize, cy: 1, cz: C,
    };

    let posEmbedObj: IBlkDef = {
        t: 'w',
        x: rightX, y: 0, z: z,
        cx: T, cy: 1, cz: C,
    };

    let residual0: IBlkDef = {
        t: 'i',
        x: 0, y: 0, z: z,
        cx: T, cy: B, cz: C,
    };
    blocks.push(idxObj, tokEmbedObj, posEmbedObj, residual0);

    z += C * cell + margin;

    function createLn(x: number) {
        let lnAgg: IBlkDef = {
            t: 'i',
            x: 0,
            y: 0,
            z: z,
            cx: T,
            cy: B,
            cz: 2,
        };
        z += 2 * cell + margin;
        let lnResid: IBlkDef = {
            t: 'i',
            x: 0, y: 0, z: z,
            cx: T, cy: B, cz: C,
        };
        let lnSigma: IBlkDef = {
            t: 'w',
            x: rightX, y: 0, z: z,
            cx: 1, cy: 1, cz: C,
        };
        let lnMu: IBlkDef = {
            t: 'w',
            x: rightX + cell * 1 + margin, y: 0, z: z,
            cx: 1, cy: 1, cz: C,
        };
        blocks.push(lnAgg, lnResid, lnSigma, lnMu);
        z += C * cell + margin;
        return { lnAgg, lnResid, lnSigma, lnMu };
    }

    let ln1 = createLn(0);
    // loop through the blocks

    return {
        blocks,
        cell,
        idxObj,
        tokEmbedObj,
        posEmbedObj,
        residual0,
        ln1,
        height: z,
    };
}

export type IModelLayout = ReturnType<typeof genModelStructure>;
