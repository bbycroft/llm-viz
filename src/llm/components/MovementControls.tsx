import { faArrowDown, faArrowLeft, faArrowRight, faArrowUp, faCircleDot, faExpand, faMagnifyingGlassMinus, faMagnifyingGlassPlus, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import React, { useState } from "react";
import { ICameraPos } from "../Camera";
import { getBlkDimensions, IBlkDef, IBlkLabel, IGptLayerNormLayout, IGptModelLayout } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { IRenderView } from "../render/modelRender";
import { useProgramState } from "../Sidebar";
import { clamp, isNotNil } from "@/src/utils/data";
import { lerp } from "@/src/utils/math";
import { useTouchEvents } from "@/src/utils/pointer";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import s from './MovementControls.module.scss';

export interface ICameraLerp {
    camInitial: ICameraPos;
    camFinal: ICameraPos;
    duration: number;
    t: number;
}

export interface IMovementInfo {
    action: MovementAction | null;
    actionHover: MovementAction | null;

    depth: number;
    target: number[]; // index maps to depth, which maps to the INavLevel tree

    cameraLerp: ICameraLerp | null;
}

export enum MovementAction {
    Up,
    Down,
    Left,
    Right,
    Focus,
    In,
    Out,
    Expand,
}

/*

depth 0: show everything (the entire model)

depth 1:
  - Embedding
  - Transformer 0
  - Transformer 1
  - ...
  - Transformer n
  - Output

depth 2:
  - input tokens
  - embedding matrices

  - self-attention (this pair each form residual loops)
  - mlp

  - ln_f
  - lm_head + softmax

depth 3:
  - top blocks
  - bottom blocks

  - ln1
  - heads
  - projection
  - residual_output block

  - ln2
  - mlp_fc
  - mlp_act
  - mlp_fc2
  - residual_output block

depth 4:
  - lnX blocks
  - mlp blocks
  - head0
  - head1
  - head2

depth 5:
  - self-attention blocks

let's see what our depths are
also have a sort of state machine for what to go between
the active target may be tighter than the depth says, so we can return to where we were


*/

export interface INavLevel {
    name?: string;
    label?: IBlkLabel;
    block?: IBlkDef;
    children?: INavLevel[];

    zoomLimit?: boolean; // if true, we won't zoom in further

    childDir?: "row" | "col";
    left?: INavLevel;
    right?: INavLevel;
    up?: INavLevel;
    down?: INavLevel;
}

export function getCurrentNavLevel(state: IProgramState, navLevels: INavLevel): { level: INavLevel, parent: INavLevel | null, depth: number, parents: INavLevel[] } | null {
    let target = state.movement.target;
    let targetDepth = state.movement.depth;

    let parents: INavLevel[] = [];
    let prevLevel = null;
    let currLevel = navLevels;

    // if we encounter an invalid index, we'll just return to the level above
    let depth = -1;
    for (let idx of target) {
        if (depth >= targetDepth) {
            break;
        }
        if (!currLevel || !currLevel.children) {
            break;
        }
        let nextChild = currLevel.children[idx] ?? null;
        if (!nextChild) {
            break;
        }

        parents.push(currLevel);
        prevLevel = currLevel;
        currLevel = currLevel.children[idx] ?? null;
        depth += 1;
    }

    return { level: currLevel, parent: prevLevel, depth, parents };
}

export function manageMovement(state: IProgramState, view: IRenderView) {
    let navLevels = constructNavLevels(state.layout);

    let current = getCurrentNavLevel(state, navLevels) ?? { level: navLevels, parent: null, depth: 0, parents: [] };
    let mvmt = state.movement;
    if (isNotNil(mvmt.action)) {

    }

    mvmt.depth = current.depth;

    if (isNotNil(mvmt.action)) {
        let prevLevel = current.level;
        let action = mvmt.action;
        mvmt.action = null;

        let setAtDepthAndTruncate = (depth: number, idx: number) => {
            if (mvmt.target.length <= depth) {
                mvmt.target.push(idx);
            }

            mvmt.target[depth] = idx;

            if (mvmt.target.length > depth + 1) {
                mvmt.target = state.movement.target.slice(0, depth + 1);
            }
        }

        let setChild = (child: INavLevel | undefined) => {
            if (child && current.parent) {
                let idx = current.parent.children!.indexOf(child);
                if (idx >= 0) {
                    setAtDepthAndTruncate(current.depth, idx);
                }
            }
        };

        if (action === MovementAction.Left) {
            setChild(current.level.left);
        }
        if (action === MovementAction.Right) {
            setChild(current.level.right);
        }
        if (action === MovementAction.Up) {
            setChild(current.level.up);
        }
        if (action === MovementAction.Down) {
            setChild(current.level.down);
        }
        if (action === MovementAction.In) {
            // choose the first child, unless there are already set values
            // (occurs if we've previously zoomed out)
            if (current.level.children) {
                while (mvmt.target.length <= current.depth + 1) {
                    mvmt.target.push(0);
                }
                mvmt.depth += 1;
            }
        }
        if (action === MovementAction.Out) {
            // don't actually delete the last element; just adjust the depth
            if (mvmt.depth > -1) {
                mvmt.depth -= 1;
            }
        }
        if (action === MovementAction.Expand) {
            mvmt.target = [];
            mvmt.depth = -1;
        }

        state.markDirty();

        current = getCurrentNavLevel(state, navLevels) ?? { level: navLevels, parent: null, depth: 0, parents: [] };

        if (current.level !== prevLevel || action === MovementAction.Focus) {
            // capture camera position and store as lerp start

            let zoomLevel = [...current.parents, current.level].find(a => a.zoomLimit) ?? current.level;

            let boxToViewMtx = state.camera.modelMtx;
            let bb = new BoundingBox3d();
            iterNavLevels(zoomLevel, (level) => {
                if (level.block) {
                    let pos = getBlkDimensions(level.block);
                    bb.addInPlace(boxToViewMtx.mulVec3Proj(pos.tl))
                        .addInPlace(boxToViewMtx.mulVec3Proj(pos.br));
                }
            });

            // want to get the entire cube in screen, but in leui of that, guess the zoom based on the size
            let zoomFactor = 110;
            let zoom = clamp(bb.size().len() / zoomFactor, 0.1, 20);

            let destAngle = new Vec3(289, 18.5, zoom);
            let destPos = bb.center();

            let camInitial: ICameraPos = { angle: state.camera.angle, center: state.camera.center };
            let camFinal: ICameraPos = { angle: destAngle, center: destPos };

            let lerpDist = Math.max(camFinal.angle.dist(camInitial.angle), camFinal.center.dist(camInitial.center));
            let duration = clamp(lerpDist * 1, 200, 2000); // Math.min(lerpDist * 0.1, 1.0);
            // compute camera target
            // lerp to target
            if (lerpDist > 0.01) {
                mvmt.cameraLerp = { camInitial, camFinal, duration, t: 0 };
            }
        }
        // if we're at a new depth, we need to reset the focus
    }

    if (current.level) {
        iterNavLevels(current.level, (level) => {
            if (level.block) {
                level.block.highlight = 0.2;
            }
        });

        for (let level of [current.level, ...current.parents])
        if (level.label) {
            level.label.visible = 1.0;
        }
    }

    if (mvmt.cameraLerp) {
        let lerp = mvmt.cameraLerp;
        lerp.t += view.dt;
        if (lerp.t >= lerp.duration) {
             mvmt.cameraLerp = null;
             lerp.t = lerp.duration;
        }
        let t = lerp.t / lerp.duration;
        state.camera.angle = lerp.camInitial.angle.lerp(lerp.camFinal.angle, t);
        state.camera.center = lerp.camInitial.center.lerp(lerp.camFinal.center, t);
        state.markDirty();
    }

    // state.display.lines.push('Level: ' + current.level?.name);
}

function constructNavLevels(model: IGptModelLayout) {

    function makeRow(children: INavLevel[]): void {
        for (let i = 0; i < children.length - 1; i++) {
            children[i].right = children[i + 1];
            children[i + 1].left = children[i];
        }
    }

    function makeCol(children: INavLevel[]): void {
        for (let i = 0; i < children.length - 1; i++) {
            children[i].down = children[i + 1];
            children[i + 1].up = children[i];
        }
    }

    let inputToks: INavLevel = {
        name: "Input Tokens",
        block: model.idxObj,
    }
    let tokenEmbeds: INavLevel = {
        name: "Token Embeddings",
        block: model.tokEmbedObj,
    };
    let inputEmbeds: INavLevel = {
        name: "Input Embeddings",
        block: model.residual0,
    };
    let posEmbeds: INavLevel = {
        name: "Position Embeddings",
        block: model.posEmbedObj,
    };

    makeRow([tokenEmbeds, inputEmbeds, posEmbeds]);
    makeCol([inputToks, tokenEmbeds]);
    makeCol([inputToks, posEmbeds]);
    makeCol([inputToks, inputEmbeds]); // this one wins for inputToks->down

    let embeddings: INavLevel = {
        name: "Embedding",
        label: model.embedLabel,
        zoomLimit: true,
        children: [inputToks, tokenEmbeds, inputEmbeds, posEmbeds],
    };

    function makeLayerNorm(name: string, ln: IGptLayerNormLayout): INavLevel {
        let agg: INavLevel = { name: "LN Agg", block: ln.lnAgg1 };
        let norm: INavLevel = { name: "LN Normalized", block: ln.lnResid };
        let bias: INavLevel = { name: "LN Bias", block: ln.lnSigma };
        let weight: INavLevel = { name: "LN Weight", block: ln.lnMu };
        makeCol([agg, norm]);
        makeRow([weight, bias, norm]);
        return {
            name: "Layer Norm",
            children: [agg, norm, bias, weight],
        };
    }

    let transformers: INavLevel[] = model.blocks.map((block, i) => {
        let ln1 = makeLayerNorm("LN1", block.ln1);

        function makeHead(head: IGptModelLayout['blocks'][0]['heads'][0], idx: number) {

            let qRow: INavLevel[] = [
                { name: "Q Bias", block: head.qBiasBlock },
                { name: "Q Weight", block: head.qWeightBlock },
                { name: "Q Vectors", block: head.qBlock },
            ];
            let kRow: INavLevel[] = [
                { name: "K Bias", block: head.kBiasBlock },
                { name: "K Weight", block: head.kWeightBlock },
                { name: "K Vectors", block: head.kBlock },
            ];

            let vRow: INavLevel[] = [
                { name: "V Bias", block: head.vBiasBlock },
                { name: "V Weight", block: head.vWeightBlock },
                { name: "V Vectors", block: head.vBlock },
            ];

            makeRow(qRow);
            makeRow(kRow);
            makeRow(vRow);

            let attnSm: INavLevel = { name: "Attention Softmax", block: head.attnMtxSm };
            let attnAgg1: INavLevel = { name: "Attention Agg 1", block: head.attnMtxAgg1 };
            let attnAgg2: INavLevel = { name: "Attention Agg 2", block: head.attnMtxAgg2 };
            let attn: INavLevel = { name: "Attention Matrix", block: head.attnMtx };
            let attnOut: INavLevel = { name: "Attention Output", block: head.vOutBlock };

            makeCol([qRow[0], kRow[0], vRow[0], attnSm]);
            makeCol([qRow[1], kRow[1], vRow[1], attnSm]);
            makeCol([qRow[2], kRow[2], vRow[2], attn, attnOut]);
            makeRow([attnSm, attnAgg1, attnAgg2, attn]);
            attnAgg1.up = vRow[1];
            attnAgg2.up = vRow[1];

            return {
                name: "Head " + idx,
                children: [...qRow, ...kRow, ...vRow, attnSm, attnAgg1, attnAgg2, attn, attnOut],
            };
        }

        let heads: INavLevel = {
            name: "Heads",
            childDir: "row",
            children: block.heads.map(makeHead).reverse(), // We'll fill this in later
        };

        let projection: INavLevel = {
            name: "Projection",
            children: [
                { name: "Projection Bias", block: block.projBias },
                { name: "Projection Weight", block: block.projWeight },
                { name: "Projection Output", block: block.attnOut },
            ],
        };

        let attnOutput: INavLevel = {
            name: "Self-Attention Output",
            block: block.attnResidual,
        };

        // forms a square
        makeCol([heads, projection]);
        makeCol([ln1, attnOutput]);
        makeRow([heads, ln1]);
        makeRow([projection, attnOutput]);

        let selfAttention: INavLevel = {
            name: "Self-Attention",
            label: block.selfAttendLabel,
            children: [ln1, heads, projection, attnOutput]
        };

        let ln2 = makeLayerNorm("LN2", block.ln2);
        let fc1: INavLevel = {
            name: "MLP FC", // and activation
            children: [
                { name: "FC Bias", block: block.mlpFcBias },
                { name: "FC Weight", block: block.mlpFcWeight },
                { name: "FC Output", block: block.mlpFc },
            ],
        };
        let act: INavLevel = {
            name: "MLP Activation",
            block: block.mlpAct,
        };
        let fc2: INavLevel = {
            name: "MLP Projection",
            children: [
                { name: "FC Bias", block: block.mlpProjBias },
                { name: "FC Weight", block: block.mlpProjWeight },
                { name: "FC Output", block: block.mlpResult },
            ]
        };
        let mlpResidual: INavLevel = {
            name: "MLP Residual",
            block: block.mlpResidual,
        };

        let mlp: INavLevel = {
            name: "MLP",
            label: block.mlpLabel,
            children: [ln2, fc1, act, fc2, mlpResidual],
        };

        return {
            name: `Transformer ${i}`,
            label: block.transformerLabel,
            childDir: "col",
            children: [selfAttention, mlp],
        };
    });

    let outputs: INavLevel = {

    };

    let topLevel: INavLevel = {
        name: "nanoGPT",
        childDir: "col",
        children: [embeddings, ...transformers, outputs],
    };

    function updateChildDirs(level: INavLevel) {
        if (!level.children) {
            return;
        }
        if (level.childDir === "col") {
            makeCol(level.children);
        } else if (level.childDir === "row") {
            makeRow(level.children);
        }
        level.childDir = undefined;
        level.children.forEach(updateChildDirs);
    }
    updateChildDirs(topLevel);

    return topLevel;
}

export const MovementControls: React.FC<{}> = () => {
    let [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
    let progState = useProgramState();

    // ensure we can handle these touch events locally
    useTouchEvents(controlsEl, 0, { alwaysSendDragEvent: true }, (ev) => ev.stopImmediatePropagation());

    function handleDir(ev: React.MouseEvent, action: MovementAction) {
        progState.movement.action = action;
        progState.markDirty();
    }

    function makeButton(action: MovementAction, icon: IconDefinition, isArrow: boolean = false) {
        return <button className={clsx(s.control, isArrow && s.arrow)} onClick={ev => handleDir(ev, action)}><FontAwesomeIcon icon={icon} /></button>;
    }

    return <div ref={setControlsEl} className={s.controls}>
        {makeButton(MovementAction.In, faMagnifyingGlassPlus)}
        {makeButton(MovementAction.Up, faArrowUp, true)}
        {makeButton(MovementAction.Out, faMagnifyingGlassMinus)}

        {makeButton(MovementAction.Left, faArrowLeft, true)}
        {makeButton(MovementAction.Focus, faCircleDot)}
        {makeButton(MovementAction.Right, faArrowRight, true)}

        <div />
        {makeButton(MovementAction.Down, faArrowDown, true)}
        {makeButton(MovementAction.Expand, faExpand)}
    </div>;
};

function iterNavLevels(level: INavLevel, f: (level: INavLevel) => void) {
    if (level.children) {
        level.children.forEach(child => iterNavLevels(child, f));
    }
    f(level);
}
/*
The movement controls are a good idea I think. What else do I need to get this to completion?

- Tidy up the DOM/css, make it fit on mobile well, being careful with screen real estate
- Improve drag controls around the screen, and also make it discoverable
- Improve attention for the guide, and finish remaining guides
- Embed within a personal webpage website
- Fix camera + bugs wrt guides
- Think about adding blurred lines behind the data-lines (effectively drop shadows)
    - But will require supporting nice big-width lines to get the glow effect working
    - Not 100% sure this is possible, but worth trying
-

*/
