import { NativeFunctions } from "./NativeBindings";
import { IRenderState } from "./render/modelRender";
import { createSyncObject, ISyncObject } from "./render/syncObjects";
import { nonNil } from "@/src/utils/basic";
import { Random } from "@/src/utils/random";
import { createBufferTex, writeToBufferTex, createRenderPhase, IBufferTex, runRenderPhase, readFromRenderPhase, arraysEqual, IRenderPhase, logArr, RenderPhaseStats } from "@/src/utils/renderPhases";
import { createShaderProgram, ensureShadersReady, IProgram, IShaderManager } from "@/src/utils/shader";
import { IGptModelConfig, ITensorSet } from "@/src/utils/tensor";

export interface IModelShape {
    B: number;
    vocabSize: number;
    nBlocks: number;
    C: number;
    nHeads: number;
    T: number;
    A: number;
}

export interface ILayerBuilder {
    gl: WebGL2RenderingContext;
    model: ITensorSet;
    shape: IModelShape;
    shaderManager: IShaderManager;
}


export interface IDataAndModel {
    data: ITensorSet;
    model: ITensorSet;
    native: NativeFunctions;
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

export function initModel(state: IRenderState, dataAndModel: IDataAndModel, B: number) {
    // let gptLayerTest = createGptModel(state.ctx.shaderManager, dataAndModel.model, dataAndModel.data.config.B!);
    // runModel(state, gptLayerTest, dataAndModel.data);
    // cleanupGptModel(state.gl, gptLayerTest);

    return createGptModel(state.ctx.shaderManager, dataAndModel.model, B);
}

export function setModelInputData(renderState: IRenderState, gptModel: IGpuGptModel, rand: Random) {
    let { gl } = renderState;
    let { inputTokens, shape: { B, T } } = gptModel;

    let buf = new Float32Array(B * T);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = rand.randint(0, 3);
    }

    buf.set([2, 1, 0, 1, 1, 2, 0, 0, 0, 0, 0]);

    gptModel.inputBuf = buf;
    gptModel.inputLen = 6;
    writeToBufferTex(gl, inputTokens, buf);
}

export function runModel(renderState: IRenderState, gptModel: IGpuGptModel, validationData?: ITensorSet) {
    let { ctx: { gl }, quadVao } = renderState;
    let {
        inputTokens,
        add,
        posEmbed,
        vocabEmbed,
        blocks,
        ln_f,
        lm_head,
        softmaxFinal,
        shape,
    } = gptModel;

    let { B, C, T, nBlocks } = shape;

    console.log(`---- running GPT model B=${B} C=${C} T=${T} layers=${nBlocks} ----`);

    let allValid = true;

    RenderPhaseStats.bindAndDrawCount = 0;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(quadVao);

    if (validationData) {
        let tIdx = validationData.idx; // (B, T)
        gptModel.inputBuf = tIdx.buffer;
        writeToBufferTex(gl, inputTokens, tIdx.buffer);
    }

    runRenderPhase(gl, vocabEmbed.phase);
    runRenderPhase(gl, posEmbed.phase);
    runRenderPhase(gl, add.addPhase);

    // gl.flush();
    validate('x', add.addPhase);

    for (let blockId = 0; blockId < blocks.length; blockId++) {
        let { ln_1, attn, ln_2, mlp } = blocks[blockId];

        gl.flush();
        runRenderPhase(gl, ln_1.aggPhase);
        runRenderPhase(gl, ln_1.applyPhase);
        runRenderPhase(gl, attn.qkvPhase);
        runRenderPhase(gl, attn.selfAttendPhase);
        runRenderPhase(gl, attn.attnMatrixAggPhase);
        runRenderPhase(gl, attn.attnMatrixSoftmaxPhase);
        runRenderPhase(gl, attn.scaledVectorsPhase);
        runRenderPhase(gl, attn.proj.linearPhase);
        gl.flush();
        runRenderPhase(gl, attn.add.addPhase);
        runRenderPhase(gl, ln_2.aggPhase);
        runRenderPhase(gl, ln_2.applyPhase);
        runRenderPhase(gl, mlp.fcLayer.linearPhase);
        runRenderPhase(gl, mlp.geluPhase);
        runRenderPhase(gl, mlp.projLayer.linearPhase);
        runRenderPhase(gl, mlp.addLayer.addPhase);

        gl.flush();
        validate(`block${blockId}`, mlp.addLayer.addPhase);
    }

    runRenderPhase(gl, ln_f.aggPhase);
    runRenderPhase(gl, ln_f.applyPhase);
    runRenderPhase(gl, lm_head.linearPhase);

    gl.flush();

    runRenderPhase(gl, softmaxFinal.aggPhase);
    runRenderPhase(gl, softmaxFinal.softmaxPhase);

    function validate(name: string, phase: IRenderPhase) {
        if (!validationData) {
            return;
        }
        let expected = validationData[name].toFloat32Array();
        let dataFromGpu = new Float32Array(expected.length);
        readFromRenderPhase(gl, phase, 0, dataFromGpu);
        let isEqual = arraysEqual(dataFromGpu, expected);
        if (!isEqual) {
            logArr('expected', expected);
            logArr('actual', dataFromGpu);
        }
        allValid = allValid && isEqual;
        console.log(name, isEqual);
    }

    if (validationData) {
        setTimeout(() => {
            validate('x', add.addPhase);

            for (let blockId = 0; blockId < blocks.length; blockId++) {
                validate(`block${blockId}`, blocks[blockId].mlp.addLayer.addPhase);
            }

            validate('lm_head', lm_head.linearPhase);

            validate('probs', softmaxFinal.softmaxPhase);

            if (!allValid) {
                console.error('VALIDATION FAILED');
            }
        }, 200);
    }

    if (!validationData) {
        gptModel.readbackSync = createSyncObject(renderState);
        gl.flush();
    }

    console.log(`---- done running GPT model drawCount = ${RenderPhaseStats.bindAndDrawCount} ----`);
}

export function loopModelOutputToInput(renderState: IRenderState, model: IGpuGptModel) {
    let gl = model.gl;

    gl.useProgram(model.copyOutputToInput.copyPhase.program.program);
    gl.uniform1i(model.copyOutputToInput.copyPhase.program.locs['u_targetTIdx'], model.inputLen);
    runRenderPhase(gl, model.copyOutputToInput.copyPhase);

    model.inputLen++;
}

export function readModelResultsBackWhenReady(model: IGpuGptModel) {
    if (model.readbackSync && model.readbackSync.isReady) {
        console.log('sync is ready after', model.readbackSync.elapsedMs.toFixed(1), 'ms');
        readModelResultsBack(model);
        model.readbackSync = null;
    }
}

export function readModelResultsBack(model: IGpuGptModel) {

    let { gl, shape: { B, T, C, vocabSize } } = model;
    let size = B * T * vocabSize;

    if (!model.resultBuf || model.resultBuf.length !== size) {
        model.resultBuf = new Float32Array(size);
    }

    readFromRenderPhase(gl, model.softmaxFinal.softmaxPhase, 0, model.resultBuf);

    let sortedBuf = new Float32Array(T * vocabSize * 2);
    for (let t = 0; t < T; t++) {
        let options = [...model.resultBuf.slice(t * vocabSize, (t + 1) * vocabSize)].map((v, i) => ({ v, i }));
        options.sort((a, b) => b.v - a.v);
        for (let i = 0; i < options.length; i++) {
            sortedBuf[(t * vocabSize + i) * 2 + 0] = options[i].i;
            sortedBuf[(t * vocabSize + i) * 2 + 1] = options[i].v;
        }
    }
    model.sortedBuf = sortedBuf;
}

function cleanupGptModel(gl: WebGL2RenderingContext, model: IGpuGptModel) {
    // @TODO: need a way of collecting all resources:
    // - texture buffers
    // - render phases
}

export const basicVertexShader = /*glsl*/`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0, 1);
}
`;

export interface IEmbedLayerLink {
    weight: IBufferTex;
    output: IBufferTex;
}

export interface ILinearLayerLink {
    weight: IBufferTex;
    bias: IBufferTex | null;
    output: IBufferTex;
}

export interface ILayerNormLayerLink {
    normAgg: IBufferTex;
    normWeight: IBufferTex;
    normBias: IBufferTex;
    output: IBufferTex;
}

export interface ISoftmaxLayerLink {
    agg: IBufferTex;
    output: IBufferTex;
}

export interface IAddLayerLink {
    output: IBufferTex;
}

export interface IBlockLayerLink {
    output: IBufferTex;
    ln_1: ILayerNormLayerLink;
    ln_2: ILayerNormLayerLink;
    attn: IAttentionLayerLink;
    mlp: IMlpLayerLink;
}

export interface IAttentionLayerLink {
    qkvWeight: IBufferTex;
    qkvBias: IBufferTex;
    qkvOutput: IBufferTex;
    attnMatrix: IBufferTex;
    attnMatrixAgg: IBufferTex;
    attnMatrixSoftmax: IBufferTex;
    scaledVectors: IBufferTex;
    proj: ILinearLayerLink;
    add: IAddLayerLink;
    output: IBufferTex;
}

export interface IMlpLayerLink {
    fcLayer: ILinearLayerLink;
    mlpGelu: IBufferTex;
    projLayer: ILinearLayerLink;
    addLayer: IAddLayerLink;
    output: IBufferTex;
}

export interface IGptModelLink {
    gl: WebGL2RenderingContext;
    inputBuf: Float32Array;
    inputTokens: IBufferTex;
    vocabEmbed: IEmbedLayerLink;
    posEmbed: IEmbedLayerLink;
    add: IAddLayerLink;
    blocks: IBlockLayerLink[],
    ln_f: ILayerNormLayerLink;
    lm_head: ILinearLayerLink;
    softmaxFinal: ISoftmaxLayerLink;
    shape: IModelShape;
    output: IBufferTex;
    resultBuf: Float32Array | null;
    sortedBuf: Float32Array | null;
    inputLen: number;
}

export interface IGpuGptModel extends IGptModelLink {
    vocabEmbed: IGpuEmbeddingLayer;
    posEmbed: IGpuEmbeddingLayer;
    add: IGpuAddLayer;
    ln_f: IGpuLayerNormLayer;
    lm_head: IGpuLinearLayer;
    softmaxFinal: IGpuSoftmaxLayer;
    blocks: IGpuGptBlockLayer[];

    copyOutputToInput: { copyPhase: IRenderPhase };
    readbackSync: ISyncObject | null;
}

export function createGptModel(shaderManager: IShaderManager, model: ITensorSet, B: number): IGpuGptModel {
    let gl = shaderManager.gl;
    let prefix = 'transformer';

    let config = model.config;

    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let nBlocks = config.n_layer;
    let vocabSize = config.vocab_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    let shape: IModelShape = { B, C, nHeads, T, A, nBlocks, vocabSize };
    let layerBuilder: ILayerBuilder = { gl, model, shape, shaderManager };

    let inputBuf = new Float32Array(B * T);
    let inputTokens = createBufferTex(gl, 1, B * T, 1);

    // not ideal to have to create one for each batch, but works for now
    let posArr = new Float32Array(B * T);
    for (let i = 0; i < B; i++) {
        for (let j = 0; j < T; j++) {
            posArr[i * T + j] = j;
        }
    }
    let pos = createBufferTex(gl, 1, B * T, 1);
    writeToBufferTex(gl, pos, posArr);

    let vocabEmbed = createEmbeddingLayer(layerBuilder, prefix + '.wte', vocabSize, C, inputTokens);
    let posEmbed = createEmbeddingLayer(layerBuilder, prefix + '.wpe', T, C, pos);
    let add = createAddLayer(layerBuilder, vocabEmbed.output, posEmbed.output); // add has shape (C, B * T)

    let blocks = [];
    let x = add.output;
    for (let i = 0; i < nBlocks; i++) {
        let block = createBlockLayer(layerBuilder, prefix + '.h.' + i, x);
        blocks.push(block);
        x = block.output;
    }

    let ln_f = createLayerNorm(layerBuilder, prefix + '.ln_f', x);
    let lm_head = createLinearLayer(layerBuilder, 'lm_head', C, vocabSize, ln_f.output, undefined, false);

    let softmaxFinal = createSoftmaxLayer(layerBuilder, lm_head.output);

    let copyOutputToInput = createCopyOutputToInputLayer(layerBuilder, softmaxFinal.output, inputTokens);

    ensureShadersReady(shaderManager);

    return {
        gl,
        inputBuf,
        inputTokens,
        vocabEmbed,
        posEmbed,
        add,
        blocks,
        ln_f,
        lm_head,
        shape,
        softmaxFinal,
        copyOutputToInput,
        output: softmaxFinal.output,
        inputLen: 6,
        resultBuf: null as Float32Array | null,
        sortedBuf: null as Float32Array | null,
        readbackSync: null as ISyncObject | null,
    };
}

export interface IGpuGptBlockLayer extends IBlockLayerLink {
    ln_1: IGpuLayerNormLayer;
    ln_2: IGpuLayerNormLayer;
    attn: IGpuAttnLayer;
    mlp: IGpuMlpLayer;
}

function createBlockLayer(layerBuilder: ILayerBuilder, prefix: string, input: IBufferTex): IGpuGptBlockLayer {
    let ln_1 = createLayerNorm(layerBuilder, prefix + '.ln_1', input);
    let attn = createAttnLayer(layerBuilder, prefix + '.attn', ln_1.output, input);
    let ln_2 = createLayerNorm(layerBuilder, prefix + '.ln_2', attn.output);
    let mlp = createMLP(layerBuilder, prefix + '.mlp', ln_2.output, attn.output);

    return {
        attn,
        ln_1,
        ln_2,
        mlp,
        output: mlp.output,
    };
}

export interface IGpuAttnLayer extends IAttentionLayerLink {
    qkvPhase: IRenderPhase;
    selfAttendPhase: IRenderPhase;
    attnMatrixAggPhase: IRenderPhase;
    attnMatrixSoftmaxPhase: IRenderPhase;
    scaledVectorsPhase: IRenderPhase;
    proj: IGpuLinearLayer;
    add: IGpuAddLayer;
}

function createAttnLayer(layerBuilder: ILayerBuilder, prefix: string, input: IBufferTex, residual: IBufferTex): IGpuAttnLayer {
    let { gl, model, shape: { B, T, C, nHeads, A }, shaderManager } = layerBuilder;

    // move the 1st dim to the end, i.e. the QKV split will be packed into RGB tex channels
    let tAttnWeight = model[prefix + '.c_attn.weight'].view([3, nHeads, A, C]).permute(1, 2, 3, 0);
    let tAttnBias = model[prefix + '.c_attn.bias'].view([3, nHeads, A]).permute(1, 2, 0);

    // weights
    let qkvWeight         = createBufferTex(gl, C, nHeads * A, 3);
    let qkvBias           = createBufferTex(gl, 1, nHeads * A, 3);

    // inputs; buffers; outputs
    let qkvOutput         = createBufferTex(gl, A, B * nHeads * T, 4); // 4 channels required for color-renderable
    let attnMatrix        = createBufferTex(gl, T, B * nHeads * T, 1);
    let attnMatrixAgg     = createBufferTex(gl, 1, B * nHeads * T, 2);
    let attnMatrixSoftmax = createBufferTex(gl, T, B * nHeads * T, 1);
    let scaledVectors     = createBufferTex(gl, nHeads * A, B * T, 1);

    writeToBufferTex(gl, qkvWeight, tAttnWeight.toFloat32Array());
    writeToBufferTex(gl, qkvBias, tAttnBias.toFloat32Array());

    let qkvProg = createShaderProgram(shaderManager, 'qkv', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D attnInput; // (B, T)         (C)
        uniform sampler2D qkvWeight; // (nHeads, A)    (C) [3]
        uniform sampler2D qkvBias;   // (nHeads, A)    (1) [3]
        out vec4 qkvOutput;          // (B, nHeads, T) (A)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            int headIdx = pos.y / ${T};
            int tIdx = pos.y % ${T};
            int bIdx = headIdx / ${nHeads};
            headIdx = headIdx % ${nHeads};

            vec3 a = texelFetch(qkvBias, ivec2(0, headIdx * ${A} + pos.x), 0).rgb;
            for (int i = 0; i < ${C}; i++) {
                float inVal = texelFetch(attnInput, ivec2(i, tIdx + bIdx * ${T}    ), 0).r;
                vec3 qkvW   = texelFetch(qkvWeight,  ivec2(i, headIdx * ${A} + pos.x), 0).rgb;
                a += inVal * qkvW;
            }

            qkvOutput = vec4(a, 1);
        }
    `);

    let selfAttendProg = createShaderProgram(shaderManager, 'selfAttend', basicVertexShader, /* glsl */`#version 300 es
        precision highp float;
        uniform sampler2D qkvOutput; // (B, nHeads, T) (A)
        out float attnMatrix;        // (B, nHeads, T) (T)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int tIdxK = pos.x;
            int tIdxQ = pos.y % ${T};
            int yOffset = pos.y - tIdxQ;

            if (tIdxK > tIdxQ) { // # forward attention only
                discard;
            }

            float a = 0.0;
            for (int i = 0; i < ${A}; i++) {
                float q = texelFetch(qkvOutput, ivec2(i, yOffset + tIdxQ), 0).r;
                float k = texelFetch(qkvOutput, ivec2(i, yOffset + tIdxK), 0).g;
                a += q * k;
            }

            attnMatrix = a / sqrt(float(${A}));
        }
    `);

    let attnMatrixAggProg = createShaderProgram(shaderManager, 'attnMatrixAgg', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D attnMatrix; // (B, nHeads, T) (T)
        out vec2 attnMatrixAgg;       // (B, nHeads, T) (1) [2]

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int tIdxY = pos.y % ${T};

            // Pass 1 finds the max
            float m = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float p = texelFetch(attnMatrix, ivec2(i, pos.y), 0).r;
                m = max(m, p);
            }

            // Pass 2 finds the exp sum (shifted by max)
            float a = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float p = texelFetch(attnMatrix, ivec2(i, pos.y), 0).r;
                a += exp(p - m);
            }

            // Store sufficient information to compute/apply the softmax
            attnMatrixAgg = vec2(1.0 / a, m);
        }
    `);

    let attnMatrixSoftmaxProg = createShaderProgram(shaderManager, 'attnMatrixSoftmax', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D attnMatrix;    // (B, nHeads, T) (T)
        uniform sampler2D attnMatrixAgg; // (B, nHeads, T) (1) [2]
        out float attnMatrixSoftmax;     // (B, nHeads, T) (T)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int tIdxX = pos.x;
            int tIdxY = pos.y % ${T};

            if (tIdxX > tIdxY) { // # forward attention only
                attnMatrixSoftmax = 0.0;
                discard;
            }

            vec2 agg = texelFetch(attnMatrixAgg, ivec2(0, pos.y), 0).rg;
            float expSumInv = agg.r;
            float maxVal = agg.g;

            float p = texelFetch(attnMatrix, pos, 0).r;
            attnMatrixSoftmax = exp(p - maxVal) * expSumInv;
        }
    `);

    let scaledVectorsProg = createShaderProgram(shaderManager, 'scaledVectors', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D qkvOutput;         // (B, nHeads, T) (A)
        uniform sampler2D attnMatrixSoftmax; // (B, nHeads, T) (T)
        out float scaledVectors;             // (B, T)         (A * nHeads)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int aIdx = pos.x % ${A};
            int headIdx = pos.x / ${A};

            int tIdxY = pos.y % ${T};
            int bIdx = pos.y / ${T};

            int yOffset = bIdx * ${T} * ${nHeads} + headIdx * ${T};

            float res = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float sm = texelFetch(attnMatrixSoftmax, ivec2(i, yOffset + tIdxY), 0).r;
                float v = texelFetch(qkvOutput, ivec2(aIdx, yOffset + i), 0).b;
                res += sm * v;
            }

            scaledVectors = res;
        }
    `);

    if (!qkvProg || !selfAttendProg || !attnMatrixAggProg || !attnMatrixSoftmaxProg || !scaledVectorsProg) {
        throw new Error("Failed to create shader program");
    }

    let qkvPhase = createRenderPhase(gl, qkvProg, [qkvOutput], [input, qkvWeight, qkvBias], ['attnInput', 'qkvWeight', 'qkvBias']);
    let selfAttendPhase = createRenderPhase(gl, selfAttendProg, [attnMatrix], [qkvOutput], ['qkvOutput']);
    let attnMatrixAggPhase = createRenderPhase(gl, attnMatrixAggProg, [attnMatrixAgg], [attnMatrix], ['attnMatrix']);
    let attnMatrixSoftmaxPhase = createRenderPhase(gl, attnMatrixSoftmaxProg, [attnMatrixSoftmax], [attnMatrix, attnMatrixAgg], ['attnMatrix', 'attnMatrixAgg']); // Could skip?
    let scaledVectorsPhase = createRenderPhase(gl, scaledVectorsProg, [scaledVectors], [qkvOutput, attnMatrixSoftmax], ['qkvOutput', 'attnMatrixSoftmax']);
    let proj = createLinearLayer(layerBuilder, prefix + '.c_proj', C, C, scaledVectors);
    let add = createAddLayer(layerBuilder, proj.output, residual);

    return {
        qkvWeight,
        qkvBias,
        qkvOutput,
        attnMatrix,
        attnMatrixAgg,
        attnMatrixSoftmax,
        scaledVectors,
        qkvPhase,
        selfAttendPhase,
        attnMatrixAggPhase,
        attnMatrixSoftmaxPhase,
        scaledVectorsPhase,
        proj,
        add,
        output: add.output,
    };
}

export interface IGpuMlpLayer extends IMlpLayerLink {
    fcLayer: IGpuLinearLayer;
    geluPhase: IRenderPhase;
    projLayer: IGpuLinearLayer;
    addLayer: IGpuAddLayer;
}

function createMLP(layerBuilder: ILayerBuilder, prefix: string, input: IBufferTex, residual: IBufferTex): IGpuMlpLayer {
    let { gl, shape: { B, T, C }, shaderManager } = layerBuilder;

    // operating memory
    let mlpGelu = createBufferTex(gl, C * 4, B * T, 1); // (B, T) (4C)

    let geluProg = createShaderProgram(shaderManager, 'mlpGelu', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D geluInput;  // (B, T) (C * 4)
        out float geluOutput; // (B, T) (C * 4)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            float x = texelFetch(geluInput, pos, 0).r;
            geluOutput = x * 0.5 * (1.0 + tanh(sqrt(2.0 / 3.14159265358) * (x + 0.044715 * x * x * x)));
        }
    `)!;

    let fcLayer = createLinearLayer(layerBuilder, prefix + '.c_fc', C, C * 4, input);
    let geluPhase = createRenderPhase(gl, geluProg, [mlpGelu], [fcLayer.output], ['geluInput']);
    let projLayer = createLinearLayer(layerBuilder, prefix + '.c_proj', C * 4, C, mlpGelu);
    let addLayer = createAddLayer(layerBuilder, projLayer.output, residual);

    return {
        fcLayer,
        mlpGelu,
        geluPhase,
        projLayer,
        addLayer,
        output: addLayer.output,
    };
}

export interface IGpuLayerNormLayer extends ILayerNormLayerLink {
    aggPhase: IRenderPhase;
    applyPhase: IRenderPhase;
}

function createLayerNorm(layerBuilder: ILayerBuilder, layerPrefix: string, input: IBufferTex): IGpuLayerNormLayer {
    let { gl, model, shape: { B, T, C }, shaderManager } = layerBuilder;

    let tWeight = model[layerPrefix + '.weight'];
    let tBias = model[layerPrefix + '.bias'];

    // weights
    let normWeight = createBufferTex(gl, 1, C, 1); // (C) (1)
    let normBias   = createBufferTex(gl, 1, C, 1); // (C) (1)

    // operating memory
    let normAgg = createBufferTex(gl, 1, B * T, 2); // (B, T) (1) [2]
    let output  = createBufferTex(gl, C, B * T, 1); // (B, T) (C)

    writeToBufferTex(gl, normWeight, tWeight.toFloat32Array());
    writeToBufferTex(gl, normBias, tBias.toFloat32Array());

    let normEps = 1e-5;

    let normAggProg = createShaderProgram(shaderManager, 'normAgg', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D normInput; // (B, T) (C)
        out vec2 normAgg;            // (B, T) (1) [2]

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            // Use Welford's algorithm to compute mean and variance
            float mean = 0.0;
            float M2 = 0.0;
            for (int i = 0; i < ${C}; i++) {
                float x = texelFetch(normInput, ivec2(i, pos.y), 0).r;
                float delta = x - mean;
                mean += delta / float(i + 1);
                M2 += delta * (x - mean);
            }

            normAgg = vec2(mean, 1.0 / sqrt(M2 / float(${C}) + ${normEps}));
        }
    `)!;

    let normApply = createShaderProgram(shaderManager, 'normApply', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D normInput;  // (B, T) (C)
        uniform sampler2D normAgg;    // (B, T) (1) [2]
        uniform sampler2D normWeight; // (C)    (1)
        uniform sampler2D normBias;   // (C)    (1)
        out float normOutput;         // (B, T) (C)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            vec2 agg = texelFetch(normAgg, ivec2(0, pos.y), 0).rg;
            float mean = agg.r;
            float stdInv = agg.g;

            float x = texelFetch(normInput, pos, 0).r;

            float weight = texelFetch(normWeight, ivec2(0, pos.x), 0).r;
            float bias   = texelFetch(normBias,   ivec2(0, pos.x), 0).r;

            normOutput = (x - mean) * stdInv * weight + bias;
        }
    `)!;

    let aggPhase = createRenderPhase(gl, normAggProg, [normAgg], [input], ['normInput']);
    let applyPhase = createRenderPhase(gl, normApply, [output],
        [input, normAgg, normWeight, normBias],
        ['normInput', 'normAgg', 'normWeight', 'normBias']);

    return {
        normAgg,
        normWeight,
        normBias,
        aggPhase,
        applyPhase,
        output,
    };
}


export interface IGpuLinearLayer extends ILinearLayerLink {
    linearPhase: IRenderPhase;
}

function createLinearLayer(layerBuilder: ILayerBuilder, prefix: string, nIn: number, nOut: number, input: IBufferTex, residual?: IBufferTex, bias?: boolean): IGpuLinearLayer {
    let { gl, model, shape: { B, T }, shaderManager } = layerBuilder;

    bias = bias ?? true;

    let tWeight = model[prefix + '.weight'];
    let tBias = bias ? model[prefix + '.bias'] : null;

    // weights
    let linearWeight = createBufferTex(gl, nIn, nOut, 1); // (nOut) (nIn)
    let linearBias   = bias ? createBufferTex(gl, 1, nOut, 1) : null; // (nOut) (1)

    // operating memory
    let output = createBufferTex(gl, nOut, B * T, 1); // (B, T) (nOut)

    writeToBufferTex(gl, linearWeight, tWeight.buffer);
    tBias && linearBias && writeToBufferTex(gl, linearBias, tBias.buffer);

    let linearProg = createShaderProgram(shaderManager, 'linear', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;          //    y     x
        uniform sampler2D linearInput;  // (B, T) (nIn)
        uniform sampler2D linearWeight; // (nOut) (nIn)
        ${bias ? 'uniform sampler2D linearBias;' : ''}   // (nOut) (1)
        ${residual ? 'uniform sampler2D linearResidual;' : ''}
        out float linearOutput;         // (B, T) (nOut)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            float res = ${bias ? 'texelFetch(linearBias, ivec2(0, pos.x), 0).r' : '0.0'};
            for (int i = 0; i < ${nIn}; i++) {
                float x = texelFetch(linearInput, ivec2(i, pos.y), 0).r;
                float w = texelFetch(linearWeight, ivec2(i, pos.x), 0).r;
                res += x * w;
            }

            ${residual ? 'res += texelFetch(linearResidual, pos, 0).r;' : ''}
            linearOutput = res;
        }
    `)!;

    let linearPhase = createRenderPhase(gl, linearProg, [output],
        [input, linearWeight, linearBias, residual].filter(nonNil),
        ['linearInput', 'linearWeight', bias ? 'linearBias' : null, residual ? 'linearResidual' : null].filter(nonNil));

    return {
        weight: linearWeight,
        bias: linearBias,
        linearPhase,
        output,
    };
}

export interface IGpuEmbeddingLayer extends IEmbedLayerLink {
    phase: IRenderPhase;
}

function createEmbeddingLayer(layerBuilder: ILayerBuilder, prefix: string, nEmbed: number, nDims: number, input: IBufferTex): IGpuEmbeddingLayer {
    let { gl, model, shape: { B, T }, shaderManager } = layerBuilder;

    let tWeight = model[prefix + '.weight'];

    // weights
    let weight = createBufferTex(gl, nDims, nEmbed, 1); // (nEmbed) (nDims)

    // operating memory
    let output = createBufferTex(gl, nDims, B * T, 1); // (B, T) (nDims)

    writeToBufferTex(gl, weight, tWeight.buffer);

    let embedProg = createShaderProgram(shaderManager, 'embed', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;          //    y     x
        uniform sampler2D embedInput;  // (B, T)   (1)
        uniform sampler2D embedWeight; // (nEmbed) (nDims)
        out float embedOutput;         // (B, T)   (nDims)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            int y = int(texelFetch(embedInput, ivec2(0, pos.y), 0).r);
            float res = texelFetch(embedWeight, ivec2(pos.x, y), 0).r;

            embedOutput = res;
        }
    `)!;

    let phase = createRenderPhase(gl, embedProg, [output], [input, weight], ['embedInput', 'embedWeight']);

    return {
        weight,
        phase,
        output,
    };
}

export interface IGpuAddLayer extends IAddLayerLink {
    addPhase: IRenderPhase;
}

function createAddLayer(layerBuilder: ILayerBuilder, inputA: IBufferTex, inputB: IBufferTex): IGpuAddLayer {
    let { gl, shape: { B, T, C }, shaderManager } = layerBuilder;

    // operating memory
    let output = createBufferTex(gl, C, B * T, 1); // (B, T) (C)

    let addProg = createShaderProgram(shaderManager, 'add', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;     //    y    x
        uniform sampler2D inputA;  // (B, T) (C)
        uniform sampler2D inputB;  // (B, T) (C)
        out float addOutput;       // (B, T) (C)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            float a = texelFetch(inputA, pos, 0).r;
            float b = texelFetch(inputB, pos, 0).r;
            addOutput = a + b;
        }
    `)!;

    let addPhase = createRenderPhase(gl, addProg, [output], [inputA, inputB], ['inputA', 'inputB']);

    return {
        addPhase,
        output,
    };
}

export interface IGpuSoftmaxLayer extends ISoftmaxLayerLink {
    bufs: IBufferTex[];
    progs: IProgram[];
    phases: IRenderPhase[];
    aggPhase: IRenderPhase;
    softmaxPhase: IRenderPhase;
}

function createSoftmaxLayer(layerBuilder: ILayerBuilder, input: IBufferTex): IGpuSoftmaxLayer {
    let { gl, shape: { B, T, C, vocabSize }, shaderManager } = layerBuilder;

    // operating memory
    let agg    = createBufferTex(gl,         1, B * T, 2);
    let output = createBufferTex(gl, vocabSize, B * T, 1);

    let softmaxAggProg = createShaderProgram(shaderManager, 'softmaxAgg', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;       //    y      x
        uniform sampler2D smInput;   // (B, T) (nVocab)
        out vec2 smAgg;              // (B)    (nVocab) [2]

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int tIdxY = pos.y % ${T};

            // Pass 1 finds the max
            float m = 0.0;
            for (int i = 0; i < ${vocabSize}; i++) {
                float p = texelFetch(smInput, ivec2(i, pos.y), 0).r;
                m = max(m, p);
            }

            // Pass 2 finds the exp sum (shifted by max)
            float a = 0.0;
            for (int i = 0; i < ${vocabSize}; i++) {
                float p = texelFetch(smInput, ivec2(i, pos.y), 0).r;
                a += exp(p - m);
            }

            // Store sufficient information to compute/apply the softmax
            smAgg = vec2(1.0 / a, m);
        }
    `)!;

    let softmaxProg = createShaderProgram(shaderManager, 'softmax', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D smInput;    // (B, T) (nVocab)
        uniform sampler2D smAgg;      // (B)    (nVocab) [2]
        out float smOutput;           // (B, T) (nVocab)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            int tIdxX = pos.x;
            int tIdxY = pos.y % ${T};

            vec2 agg = texelFetch(smAgg, ivec2(0, pos.y), 0).rg;
            float expSumInv = agg.r;
            float maxVal = agg.g;

            float p = texelFetch(smInput, pos, 0).r;
            smOutput = exp(p - maxVal) * expSumInv;
        }
    `)!;

    let aggPhase = createRenderPhase(gl, softmaxAggProg, [agg], [input], ['smInput']);
    let softmaxPhase = createRenderPhase(gl, softmaxProg, [output], [input, agg], ['smInput', 'smAgg']);

    return {
        bufs: [agg, output],
        progs: [softmaxAggProg, softmaxProg],
        phases: [aggPhase, softmaxPhase],
        agg,
        aggPhase,
        softmaxPhase,
        output,
    };
}

function createCopyOutputToInputLayer(layerBuilder: ILayerBuilder, prevOutput: IBufferTex, currInput: IBufferTex) {
    let { gl, shape: { T, vocabSize }, shaderManager } = layerBuilder;

    let copyProg = createShaderProgram(shaderManager, 'copy', basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;         //    y    x
        uniform sampler2D prevOutput;  // (B, T) (n_vocab)
        uniform int u_targetTIdx;
        out float currInput;           // (B, T) (1)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            int tIdx = pos.y % ${T};

            if (tIdx != u_targetTIdx) {
                discard;
            }

            int maxVocabI = 0;
            float maxVocabP = 0.0;
            for (int i = 0; i < ${vocabSize}; i++) {
                float p = texelFetch(prevOutput, ivec2(i, pos.y), 0).r;
                if (p > maxVocabP) {
                    maxVocabP = p;
                    maxVocabI = i;
                }
            }

            currInput = float(maxVocabI);
        }
    `)!;

    let copyPhase = createRenderPhase(gl, copyProg, [currInput], [prevOutput], ['prevOutput']);

    return {
        copyPhase,
    };
}
