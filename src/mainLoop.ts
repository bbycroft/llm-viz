import { createGptLayer } from "./GptModel";
import { IRenderState as IRenderState } from "./modelRender";
import { arraysEqual, readFromRenderPhase, runRenderPhase, writeToBufferTex } from "./utils/renderPhases";
import { ITensorSet } from "./utils/tensor";

export interface IDataAndModel {
    data: ITensorSet;
    model: ITensorSet;
}

export type IModelState = ReturnType<typeof initModel>;

/* TODO: think about how to handle working computation buffers.

For each layer, we're typically abe to re-use the working memory buffers (provided they're the same dims, or smaller).
But the layers each have different weights.
However, for debugging etc, we also want to keep all the working buffers around.
We also want to re-use programs and shader objects where possible. Can just do a string compare on the shader source.
Baking in the constants remains a good idea I think, since the div/mod's can be flattened since they're often powers of 2 (& constant).

Also have the issue of passing input/output buffers between stages, where we can often re-use those buffers
(not always, e.g. layerNorm). However, the (B, T, C) buffers can sometimes allow for a ping-pong process.

We might as well build the nested structure of the real model, with each chunk having create + execute methods.
*/

export function initModel(renderState: IRenderState, dataAndModel: IDataAndModel) {

    let gptLayer = createGptLayer(renderState.gl, dataAndModel);
    let modelState = {
        gptLayer,
        dataAndModel,
    }
    return modelState;
}

export function runModel(renderState: IRenderState, modelState: IModelState) {
    let { gl, quadVao } = renderState;
    let {
        gptLayer: {
            inputTokens,
            add,
            posEmbed,
            vocabEmbed,
            blocks,
            ln_f,
            lm_head,
        },
        dataAndModel,
    } = modelState;

    console.log('---- running model ----');

    let config = dataAndModel.model.config;
    let B = dataAndModel.data.config.B!;
    let C = config.n_embd;
    let T = config.block_size;

    let tIdx = dataAndModel.data.idx; // (B, T)
    let tLmHead = dataAndModel.data.lm_head; // (B, T, V)

    gl.bindVertexArray(quadVao);

    writeToBufferTex(gl, inputTokens, tIdx.buffer);

    runRenderPhase(gl, vocabEmbed.phase);
    runRenderPhase(gl, posEmbed.phase);
    runRenderPhase(gl, add.addPhase);

    for (let blockId = 0; blockId < blocks.length; blockId++) {
        let { ln_1, attn, ln_2, mlp } = blocks[blockId];

        runRenderPhase(gl, ln_1.normAggPhase);
        runRenderPhase(gl, ln_1.normApplyPhase);
        runRenderPhase(gl, attn.qkvPhase);
        runRenderPhase(gl, attn.selfAttendPhase);
        runRenderPhase(gl, attn.attnMatrixAggPhase);
        runRenderPhase(gl, attn.attnMatrixSoftmaxPhase);
        runRenderPhase(gl, attn.scaledVectorsPhase);
        runRenderPhase(gl, attn.proj.linearPhase);
        runRenderPhase(gl, ln_2.normAggPhase);
        runRenderPhase(gl, ln_2.normApplyPhase);
        runRenderPhase(gl, mlp.fcLayer.linearPhase);
        runRenderPhase(gl, mlp.geluPhase);
        runRenderPhase(gl, mlp.projLayer.linearPhase);

        let tBlockRes = dataAndModel.data[`block${blockId}`];
        let blockOutput = new Float32Array(B * T * C);
        readFromRenderPhase(gl, mlp.projLayer.linearPhase, 0, blockOutput);
        console.log(`block${blockId}Equal`, arraysEqual(blockOutput, tBlockRes.toFloat32Array()));
    }

    runRenderPhase(gl, ln_f.normAggPhase);
    runRenderPhase(gl, ln_f.normApplyPhase);
    runRenderPhase(gl, lm_head.linearPhase);

    let lmHead = new Float32Array(B * T * config.vocab_size);
    readFromRenderPhase(gl, lm_head.linearPhase, 0, lmHead);
    console.log('lmHeadEqual', arraysEqual(lmHead, tLmHead.toFloat32Array()));
}

function computeMeanStdDev(data: Float32Array) {

    // Use the Welford algorithm to compute the mean and variance

    let mean = 0;
    let M2 = 0;
    for (let i = 0; i < data.length; i++) {
        let x = data[i];
        let delta = x - mean;
        mean += delta / (i + 1);
        M2 += delta * (x - mean);
    }

    return {
        mean,
        stdDev: Math.sqrt(M2 / data.length + 1e-5),
    };
}
