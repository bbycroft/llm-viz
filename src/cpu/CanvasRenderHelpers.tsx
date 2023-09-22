import { AffineMat2d } from "../utils/AffineMat2d";
import { getOrAddToMap } from "../utils/data";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { IComp } from "./CpuModel";
import { ICompDef, ISubLayoutArgs } from "./comps/CompBuilder";

export interface ICanvasGridState {
    tileCanvases: Map<string, HTMLCanvasElement>;
}

export function drawGrid(mtx: AffineMat2d, ctx: CanvasRenderingContext2D, gridState: ICanvasGridState, fillStyle = '#aaa') {

    let cvsSize = new Vec3(ctx.canvas.width, ctx.canvas.height);
    let tl = mtx.mulVec3Inv(new Vec3());
    let br = mtx.mulVec3Inv(cvsSize);

    // draw grid

    // we create a tile canvas for the 1-cell grid. We'll draw it such that ??
    let gridCvs = getOrAddToMap(gridState.tileCanvases, 'grid1', () => document.createElement('canvas')!);
    let gridSize = 64;
    gridCvs.width = gridSize;
    gridCvs.height = gridSize;
    let gridCtx = gridCvs.getContext('2d')!;
    gridCtx.save();
    gridCtx.clearRect(0, 0, gridCvs.width, gridCvs.height);
    gridCtx.beginPath();
    let r = 2.0;
    gridCtx.moveTo(gridSize/2, gridSize/2);
    gridCtx.arc(gridSize/2, gridSize/2, r, 0, 2 * Math.PI);
    gridCtx.fillStyle = fillStyle;
    gridCtx.fill();
    gridCtx.restore();

    let gridPattern = ctx.createPattern(gridCvs, 'repeat')!;
    function drawGridAtScale(scale: number) {
        ctx.save();
        ctx.fillStyle = gridPattern;
        let scaleFactor = 1 / gridSize * scale;
        ctx.translate(0.5, 0.5);
        ctx.scale(scaleFactor, scaleFactor);
        let tl2 = tl.sub(new Vec3(0.5, 0.5)).mul(1 / scaleFactor);
        let br2 = br.sub(new Vec3(0.5, 0.5)).mul(1 / scaleFactor);
        ctx.fillRect(tl2.x, tl2.y, br2.x - tl2.x, br2.y - tl2.y);
        ctx.restore();
    }
    drawGridAtScale(1);
}

