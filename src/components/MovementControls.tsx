import React from "react";
import { IBlkDef, IBlkLabel, IGptLayerNormLayout, IGptModelLayout } from "../GptModelLayout";
import { useProgramState } from "../Sidebar";

export interface IMovementInfo {
    action: MovementAction | null;

    depth: number;
    activeTarget: number[]; // index maps to depth, which maps to the INavLevel tree
}

export enum MovementAction {
    Up,
    Down,
    Left,
    Right,
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

    // maybe can just use the children order? Well, can use that when constructing the tree
    childDir?: "row" | "col";
    left?: INavLevel;
    right?: INavLevel;
    up?: INavLevel;
    down?: INavLevel;
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

    let embeddings: INavLevel = {
        name: "Embedding",
        childDir: "col",
        children: [{
            name: "Input Tokens",
            children: [{
                name: "Token Indexes",
                block: model.idxObj,
            }],
        }, {
            name: "Embedding Matrices",
            childDir: "row",
            children: [{
                name: "Token Embeddings",
                block: model.tokEmbedObj,
            }, {
                name: "Input Embeddings",
                block: model.residual0,
            }, {
                name: "Position Embeddings",
                block: model.posEmbedObj,
            }],
        }]
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
        let heads: INavLevel = {
            name: "Heads",
            children: [], // We'll fill this in later
        };

        let projection: INavLevel = {
            name: "Projection",
            children: [],
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
        let fc2: INavLevel = {
            name: "MLP Projection",
        };
        let mlpResidual: INavLevel = {
            name: "MLP Residual",
            block: block.mlpResidual,
        };

        let mlp: INavLevel = {
            name: "MLP",
            children: [ln2, fc1, fc2, mlpResidual],
        };

        return {
            name: `Transformer ${i}`,
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
}

export const MovementControls: React.FC<{}> = () => {
    let progState = useProgramState();

   return <div>
        <button aria-label="Up">Up</button>
        <button aria-label="Down">Down</button>
        <button aria-label="Left">Left</button>
        <button aria-label="Right">Right</button>
        <button aria-label="Zoom In">Zoom In</button>
        <button aria-label="Zoom Out">Zoom Out</button>
        <button aria-label="Zoom Out">Zoom Extent</button>
    </div>;
};

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