import { AffineMat2d } from "../utils/AffineMat2d";
import { getOrAddToMap, hasFlag } from "../utils/data";
import { BoundingBox3d, Vec3 } from "../utils/vector";
import { ICanvasState, IComp } from "./CpuModel";


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


export function shouldRenderComp(comp: IComp, cvs: ICanvasState): readonly [renderComp: boolean, renderPorts: boolean, renderSubSchematic: boolean] {
    let compBb = cvs.mtx.mulBb(comp.bb);

    if (!compBb.intersects(new BoundingBox3d(new Vec3(), cvs.size))) {
        return [false, false, false];
    }

    let size = compBb.size();
    let area = size.x * size.y;

    let pxPerGrid = 1 / cvs.scale;

    let renderPorts = pxPerGrid > 4 || area > 50 * 50;
    let renderSubSchematic = pxPerGrid > 15 && area > 170 * 170;

    return [true, renderPorts, renderSubSchematic];
}


export function shouldRenderSubSchematic(comp: IComp, cvs: ICanvasState) {

    // based on width/height of the component in viewport
    // and also whether the comp is actually visible in the viewport

    let tl = cvs.mtx.mulVec3(comp.pos);
    let br = cvs.mtx.mulVec3(comp.pos.add(comp.size));
    let size = br.sub(tl);
    let area = size.x * size.y;

    let pxPerGrid = 1 / cvs.scale;

    if (pxPerGrid < 10) {
        return false;
    }


    if (area < 150 * 150) {
        return false;
    }

    let compBb = new BoundingBox3d(tl, br);

    let viewBb = cvs.region;

    if (!compBb.intersects(viewBb)) {
        return false;
    }

    return true;
}


export function scaleFromMtx(mtx: AffineMat2d) {
    // if we're zoomed out enough, wires/lines etc shrink
    // but otherwise, they stay the same size independent of zoom
    return Math.min(0.2, 1.0 / mtx.a);
}

export function constructSubCanvasState(cvs: ICanvasState, subMtx: AffineMat2d, comp: IComp) {
    let innerMtx = cvs.mtx.mul(subMtx.inv());
    let newMtx = cvs.mtx.mul(subMtx);

    let subCvs: ICanvasState = {
        ...cvs,
        mtx: newMtx,
        scale: scaleFromMtx(newMtx),
        region: innerMtx.mulBb(comp.bb),
    };

    return subCvs;
}
