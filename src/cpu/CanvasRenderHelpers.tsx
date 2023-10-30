import { AffineMat2d } from "../utils/AffineMat2d";
import { getOrAddToMap, hasFlag } from "../utils/data";
import { BoundingBox3d, Vec3 } from "../utils/vector";


export enum FontType {
    None = 0,
    Default = 1,
    Mono = 2,
    Italic = 4,
}

export function makeCanvasFont(fontSize: number, fontType: FontType = FontType.Default) {
    let baseType = fontType & (FontType.Default | FontType.Mono);
    let str = hasFlag(fontType, FontType.Italic) ? 'italic ' : '';
    switch (baseType) {
        case FontType.Default:
            str += `${fontSize}px Arial`;
            break;
        case FontType.Mono:
            str += `${fontSize}px monospace`;
            break;
    }
    return str;
}

export interface ICanvasGridState {
    tileCanvases: Map<string, HTMLCanvasElement>;
    region: BoundingBox3d;
}

export function drawGrid(mtx: AffineMat2d, ctx: CanvasRenderingContext2D, gridState: ICanvasGridState, fillStyle = '#aaa', special: boolean = false) {
    let tl = mtx.mulVec3Inv(gridState.region.min);
    let br = mtx.mulVec3Inv(gridState.region.max);

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

