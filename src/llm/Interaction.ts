import { blockDimension, dimProps, findSubBlocks, splitGrid, splitGridForHighlight } from "./Annotations";
import { drawDataFlow, getBlockValueAtIdx } from "./components/DataFlow";
import { BlKDepSpecial, IBlkCellDep, IBlkDef } from "./GptModelLayout";
import { IProgramState } from "./Program";
import { clamp, isNotNil } from "@/src/utils/data";
import { Dim, Vec3, Vec4 } from "@/src/utils/vector";

export function runMouseHitTesting(state: IProgramState) {

    let mouse = state.mouse;

    let canvasSize = state.render.size;

    let ndcX = mouse.mousePos.x / canvasSize.x * 2 - 1;
    let ndcY = 1 - (mouse.mousePos.y / canvasSize.y * 2);

    let viewMtx = state.camera.viewMtx;
    let viewMtxInv = viewMtx.invert();
    let modelMtx = state.camera.modelMtx;
    let modelMtxInv = modelMtx.invert();

    function clipToWorld(v: Vec4) {
        let v2 = viewMtxInv.mulVec4(v);
        let v3 = modelMtxInv.mulVec4(v2);
        return v3.projToVec3();
    }

    let clipSpaceA = new Vec4(ndcX, ndcY, -1, 1);
    let clipSpaceB = new Vec4(ndcX, ndcY, 1, 1);

    let worldA = clipToWorld(clipSpaceA);
    let worldB = clipToWorld(clipSpaceB);
    let dir = worldB.sub(worldA).normalize();

    // state.display.lines.push(`dir: ${dir.toString()}`);

    // addLine2(state.render.lineRender, midWorld, midWorld.add(new Vec3(100,0,0)), { color: new Vec4(1, 0, 0, 1), thick: 10, mtx: new Mat4f() });

    let visibleCubes: [IBlkDef, IBlkDef][] = [];
    function addCube(c: IBlkDef, mainCube: IBlkDef) {
        if (c.subs) {
            for (let sub of c.subs) {
                addCube(sub, mainCube || c);
            }
        } else if (c.opacity > 0) {
            visibleCubes.push([c, mainCube]);
        }
    }
    for (let c of state.layout.cubes) {
        addCube(c, c);
    }

    let minT = 0.0;
    let minCube: [IBlkDef, IBlkDef] | null = null;

    for (let [c, main] of visibleCubes) {
        let tl = new Vec3(c.x, c.y, c.z);
        let br = new Vec3(c.x + c.dx, c.y + c.dy, c.z + c.dz);

        let t = rayAABBIntersect(tl, br, worldA, dir);

        // console.log('t:', t);

        if (t > 0 && (!minCube || t < minT)) {
            minT = t;
            minCube = [c, main];
        }
    }

    if (minCube) {
        let [c, main] = minCube;

        let tl = new Vec3(c.x, c.y, c.z);
        let pt = worldA.add(dir.mul(minT));

        let pt2 = new Vec3(
            clamp((pt.x - tl.x) / c.dx, 0, 1 - 0.1/c.cx),
            clamp((pt.y - tl.y) / c.dy, 0, 1 - 0.1/c.cy),
            clamp((pt.z - tl.z) / c.dz, 0, 1 - 0.1/c.cz));

        let pt3 = c.localMtx ? c.localMtx.mulVec3Proj(pt2) : pt2;

        // the main block's index (useful for showing correct info against)
        let ptIdx = new Vec3(
            Math.floor(pt3.x * c.cx),
            Math.floor(pt3.y * c.cy),
            Math.floor(pt3.z * c.cz),
        );

        state.display.hoverTarget = { mainCube: main, subCube: c, mainIdx: ptIdx };

        for (let label of state.layout.labels) {
            for (let c of label.cubes) {
                if (c === main) {
                    label.visible = 1.0;
                }
            }
        }

        blockDimension(state, state.layout, main, Dim.X, main.dimX, 1.0);
        blockDimension(state, state.layout, main, Dim.Y, main.dimY, 1.0);

        highlightCellUnderMouse(state, main, c, pt2);
        drawDependences(state, main, ptIdx);
        drawDataFlow(state, main, ptIdx);
    } else if (isNotNil(state.display.blkIdxHover)) {
        for (let idx of state.display.blkIdxHover) {
            let mainBlk = state.layout.cubes[idx];

            iterVisibleSubCubes(mainBlk, (c) => {
                c.highlight = 0.2;
            });
        }
    }

    if (isNotNil(state.display.dimHover)) {
        let blks = state.walkthrough.dimHighlightBlocks;
        for (let blk of blks ?? []) {
            if (blk.dimX === state.display.dimHover) {
                blockDimension(state, state.layout, blk, Dim.X, blk.dimX, 1.0);
            }
            if (blk.dimY === state.display.dimHover) {
                blockDimension(state, state.layout, blk, Dim.Y, blk.dimY, 1.0);
            }
        }
    }
}


export function iterVisibleSubCubes(c: IBlkDef, cb: (c: IBlkDef) => void) {
    if (c.subs) {
        for (let sub of c.subs) {
            iterVisibleSubCubes(sub, cb);
        }
    } else {
        cb(c);
    }
}

export function highlightCellUnderMouse(state: IProgramState, mainBlk: IBlkDef, blk: IBlkDef, pt2: Vec3) {

    iterVisibleSubCubes(mainBlk, (c) => {
        c.highlight = 0.1;
    });

    // currently broken otherwise :(
    if (blk === mainBlk) {
        let ptLocalIdx = new Vec3(
            pt2.x * blk.cx * blk.dx / mainBlk.dx,
            pt2.y * blk.cy * blk.dy / mainBlk.dy,
            pt2.z * blk.cz * blk.dz / mainBlk.dz,
        );
        // need to choose a primary axis (if it makes sense! usually the T axis)
        // we then highlight that access a little bit
        // probably need to do that in the GptModelLayout? It's not a super well-defined idea
        let midX = splitGrid(state.layout, blk, Dim.X, ptLocalIdx.x, 0);
        if (midX) {
            midX.highlight = 0.15;
            let midY = splitGrid(state.layout, midX, Dim.Y, ptLocalIdx.y, 0);
            if (midY) {
                let midZ = splitGrid(state.layout, midY, Dim.Z, ptLocalIdx.z, 0);
                if (midZ) {
                    midZ.highlight = 0.6;
                }
            }
        }
    }
}

export function getDepSrcIdx(dep: IBlkCellDep, destIdx: Vec3) {
    let mtx = dep.srcIdxMtx;
    let hasXDot = mtx.g(0, 3) !== 0;
    let hasYDot = mtx.g(1, 3) !== 0;
    let srcIdx4 = mtx.mulVec4(Vec4.fromVec3(destIdx, 0));
    let srcIdx = new Vec3(srcIdx4.x, srcIdx4.y, srcIdx4.z);
    let dotDim = hasXDot ? Dim.Y : Dim.X;
    return { srcIdx, dotDim, otherDim: dotDim === Dim.X ? Dim.Y : Dim.X, isDot: hasXDot || hasYDot };
}

export function getDepDotLen(blk: IBlkDef, destIdx: Vec3): number | null {
    if (!blk.deps?.dot) {
        return null;
    }
    let dotLen: number | null = null;
    let triLimit = blk.deps.dot.find(d => d.src.deps?.lowerTri);
    if (triLimit) {
        let { srcIdx, dotDim } = getDepSrcIdx(triLimit, destIdx);
        dotLen = srcIdx.getAt(dotDim);
    }
    return dotLen;
}

export function drawDependences(state: IProgramState, blk: IBlkDef, idx: Vec3) {
    let layout = state.layout;
    let deps = blk.deps;
    if (!deps) {
        return;
    }

    function drawDep(dep: IBlkCellDep, destIdx: Vec3, dotLen?: number | null) {
        let { srcIdx, dotDim, otherDim, isDot } = getDepSrcIdx(dep, destIdx);

        if (blk.deps?.special === BlKDepSpecial.InputEmbed && dep.src === state.layout.tokEmbedObj) {
            let tokenIdx = getBlockValueAtIdx(state.layout.idxObj, new Vec3(destIdx.x, 0, destIdx.z));
            isDot = false;
            srcIdx.setAt(Dim.X, tokenIdx ?? 0);
        }

        if (isDot) {
            if (dep.src.deps?.lowerTri) {
                dotLen = dotLen ?? srcIdx.getAt(dotDim);
            }

            let sub = splitGridForHighlight(layout, dep.src, dotDim, srcIdx.getAt(dotDim));

            if (sub && isNotNil(dotLen)) {
                // only highlight up to dotLen
                splitGrid(layout, sub, otherDim, dotLen, 0);
                for (let parts of findSubBlocks(sub, otherDim, null, dotLen)) {
                    parts.highlight = 0.5;
                }
            } else {

                if (sub) sub.highlight = 0.5;
            }
        } else {
            let sub = splitGridForHighlight(layout, dep.src, Dim.X, srcIdx.x);
            if (!sub) return;
            sub = splitGridForHighlight(layout, sub, Dim.Y, srcIdx.y);
            if (!sub) return;
            sub = splitGridForHighlight(layout, sub, Dim.Z, srcIdx.z);
            if (sub) sub.highlight = 0.5;
        }
    }

    if (deps.dot) {
        let dotLen = getDepDotLen(blk, idx);
        // let i = 0;
        for (let dep of deps.dot) {
            // if (i > 0) {
                drawDep(dep, idx, dotLen);
            // }
            // i++;
        }
    }
    if (deps.add) {
        for (let dep of deps.add) {
            drawDep(dep, idx);
        }
    }


}

function rayAABBIntersect(tl: Vec3, br: Vec3, rayOrigin: Vec3, rayDir: Vec3) {
    let tx1 = (tl.x - rayOrigin.x) / rayDir.x;
    let tx2 = (br.x - rayOrigin.x) / rayDir.x;

    let tmin = Math.min(tx1, tx2);
    let tmax = Math.max(tx1, tx2);

    let ty1 = (tl.y - rayOrigin.y) / rayDir.y;
    let ty2 = (br.y - rayOrigin.y) / rayDir.y;

    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));

    let tz1 = (tl.z - rayOrigin.z) / rayDir.z;
    let tz2 = (br.z - rayOrigin.z) / rayDir.z;

    tmin = Math.max(tmin, Math.min(tz1, tz2));
    tmax = Math.min(tmax, Math.max(tz1, tz2));

    return tmax >= tmin ? tmin : -1;
}
