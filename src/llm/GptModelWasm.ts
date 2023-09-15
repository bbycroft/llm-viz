import { IAddLayerLink, IAttentionLayerLink, IBlockLayerLink, IEmbedLayerLink, IGptModelLink, ILayerNormLayerLink, ILinearLayerLink, IMlpLayerLink, IModelShape, ISoftmaxLayerLink } from "./GptModel";
import { NativeFunctions, TensorType } from "./NativeBindings";
import { makeArray } from "@/src/utils/data";
import { createBufferTex as createBufferTex2, IBufferTex, writeToBufferTex } from "@/src/utils/renderPhases";
import { IGptModelConfig, ITensorSet, TensorF32 } from "@/src/utils/tensor";

function createBufferTex(gl: WebGL2RenderingContext, height: number, width: number, channels: number) {
    return createBufferTex2(gl, width, height, channels);
}

interface IWasmLayerBuilder {
    gl: WebGL2RenderingContext;
    shape: IModelShape;
}

export function createGpuModelForWasm(gl: WebGL2RenderingContext, config: IGptModelConfig): IGptModelLink {
    let B = 1;
    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let nBlocks = config.n_layer;
    let vocabSize = config.vocab_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    let shape: IModelShape = { B, C, nHeads, T, A, nBlocks, vocabSize };
    let layerBuilder: IWasmLayerBuilder = { gl, shape };

    let inputTokens = createBufferTex(gl, B * T, 1, 1);
    let softmaxFinal = createSoftmaxLayer(layerBuilder);

    return {
         gl,
         add: createAddLayer(layerBuilder),
         inputBuf: new Float32Array(),
         inputLen: 6,
         ln_f: createLayerNormLayer(layerBuilder),
         inputTokens,
         lm_head: createLinearLayer(layerBuilder, T, C, vocabSize),
         blocks: makeArray(nBlocks).map(() => createBlockLayer(layerBuilder)),
         output: softmaxFinal.output,
         posEmbed: createEmbedLayer(layerBuilder, inputTokens, T), // fix source?
         vocabEmbed: createEmbedLayer(layerBuilder, inputTokens, vocabSize),
         shape: shape,
         softmaxFinal,
         resultBuf: null,
         sortedBuf: null,
    };
}

function createAddLayer(builder: IWasmLayerBuilder): IAddLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        output: createBufferTex(gl, B * T, C, 1),
    };
}

function createEmbedLayer(builder: IWasmLayerBuilder, input: IBufferTex, size: number): IEmbedLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        weight: createBufferTex(gl, size, C, 1),
        output: createBufferTex(gl, B * T, C, 1),
    };
}

function createLinearLayer(builder: IWasmLayerBuilder, t: number, cIn: number, cOut: number): ILinearLayerLink {
    let { gl, shape: { B, T } } = builder;

    return {
        weight: createBufferTex(gl, cOut, cIn, 1),
        bias: createBufferTex(gl, cOut, 1, 1),
        output: createBufferTex(gl, B * T, cOut, 1),
    };
}

function createLayerNormLayer(builder: IWasmLayerBuilder): ILayerNormLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        normWeight: createBufferTex(gl, C, 1, 1),
        normBias: createBufferTex(gl, C, 1, 1),
        normAgg: createBufferTex(gl, B * T, 1, 2),
        output: createBufferTex(gl, B * T, C, 1),
    };
}

function createSoftmaxLayer(builder: IWasmLayerBuilder): ISoftmaxLayerLink {
    let { gl, shape: { B, T, vocabSize } } = builder;

    return {
        agg: createBufferTex(gl, B * T, 1, 2),
        output: createBufferTex(gl, B * T, vocabSize, 1),
    };
}

function createBlockLayer(builder: IWasmLayerBuilder): IBlockLayerLink {
    let mlp = createMlpLayer(builder);

    return {
        ln_1: createLayerNormLayer(builder),
        attn: createAttentionLayer(builder),
        ln_2: createLayerNormLayer(builder),
        mlp,
        output: mlp.output,
    };
}

function createAttentionLayer(builder: IWasmLayerBuilder): IAttentionLayerLink {
    let { gl, shape: { B, T, C, nHeads, A } } = builder;

    let add = createAddLayer(builder);

    return {
        qkvWeight:         createBufferTex(gl, 3 * nHeads * A, C, 1),
        qkvBias:           createBufferTex(gl, 3 * nHeads * A, 1, 1),
        attnMatrix:        createBufferTex(gl, B * nHeads * T, T, 1),
        attnMatrixAgg:     createBufferTex(gl, B * nHeads * T, 1, 2),
        attnMatrixSoftmax: createBufferTex(gl, B * nHeads * T, T, 1),
        qkvOutput:         createBufferTex(gl, B * T, 3 * nHeads * A, 1),
        add: createAddLayer(builder),
        proj: createLinearLayer(builder, T, C, C),
        scaledVectors: createBufferTex(gl, B * T, nHeads * A, 1),
        output: add.output,
    };
}

function createMlpLayer(builder: IWasmLayerBuilder): IMlpLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    let add = createAddLayer(builder);

    return {
        fcLayer: createLinearLayer(builder, T, C, C * 4),
        mlpGelu: createBufferTex(gl, B * T, C * 4, 1),
        projLayer: createLinearLayer(builder, T, C * 4, C),
        addLayer: add,
        output: add.output,
    };
}

export interface IWasmGptModel {
    native: NativeFunctions;
    modelPtr: number;
    lastMemoryBuffer: ArrayBuffer | null; // need to check against this to see if our js copies of the buffers are still valid
    weightsDirty: boolean;
    intersDirty: boolean;
}

export function constructModel(model: ITensorSet, config: IGptModelConfig, native: NativeFunctions): IWasmGptModel {
    let nativeModel = native.createModel(config);

    copyFrom('transformer.wte.weight', TensorType.Wte);
    copyFrom('transformer.wpe.weight', TensorType.Wpe);
    copyFrom('lm_head.weight', TensorType.LmHeadW);
    copyWeightBias('transformer.ln_f', TensorType.LnFGamma, TensorType.LnFBeta);

    for (let i = 0; i < config.n_layer; i++) {
        let layerPrefix = `transformer.h.${i}`;

        copyWeightBias(layerPrefix + '.ln_1', TensorType.Ln1Gamma, TensorType.Ln1Beta, i);
        copyWeightBias(layerPrefix + '.ln_2', TensorType.Ln2Gamma, TensorType.Ln2Beta, i);

        copyWeightBias(layerPrefix + '.attn.c_attn', TensorType.AttnQkvW, TensorType.AttnQkvB, i);
        copyWeightBias(layerPrefix + '.attn.c_proj', TensorType.AttnProjW, TensorType.AttnProjB, i);

        copyWeightBias(layerPrefix + '.mlp.c_fc', TensorType.MlpW, TensorType.MlpB, i);
        copyWeightBias(layerPrefix + '.mlp.c_proj', TensorType.MlpProjW, TensorType.MlpProjB, i);
    }

    function copyWeightBias(prefix: string, weightType: TensorType, biasType: TensorType, idx: number = 0) {
        copyFrom(prefix + '.weight', weightType, idx);
        copyFrom(prefix + '.bias', biasType, idx);
    }

    function copyFrom(name: string, type: TensorType, idx: number = 0) {
        let m = model[name];
        if (!m) {
            console.log('ERROR: missing tensor name:', name)
        } else {
            native.getModelTensor(nativeModel, type, idx).copyFrom(model[name]);
        }
    }

    let inputTokens = native.getModelTensor(nativeModel, TensorType.InputTokens);

    inputTokens.buffer.set([2, 1, 0, 1, 1, 2, 0, 0, 0, 0, 0]);

    {
        let sw = performance.now();
        native.runModel(nativeModel);
        console.log('runModel', (performance.now() - sw).toFixed(2) + 'ms');
    }

    return {
        native: native,
        modelPtr: nativeModel,
        lastMemoryBuffer: null,
        weightsDirty: true,
        intersDirty: true,
    };
}

export function stepWasmModel(wasmModel: IWasmGptModel, jsModel: IGptModelLink) {
    let { native, modelPtr } = wasmModel;
    let { shape: { B, T, vocabSize } } = jsModel;

    let tIdx = jsModel.inputLen - 1;

    if (!jsModel.sortedBuf || tIdx >= T - 1) {
        return;
    }

    let inputTokensTensor = native.getModelTensor(modelPtr, TensorType.InputTokens);
    for (let b = 0; b < B; b++) {
        let topSortedIdx = jsModel.sortedBuf![b * T * vocabSize * 2 + tIdx * vocabSize * 2 + 0];
        // let topSortedValue = jsModel.sortedBuf![b * T * 2 + tIdx * 2 + 1];
        inputTokensTensor.buffer[b * T + tIdx + 1] = topSortedIdx;
    }

    jsModel.inputLen += 1;

    native.runModel(modelPtr);

    wasmModel.intersDirty = true;

    syncWasmDataWithJsAndGpu(wasmModel, jsModel);
}

export function syncWasmDataWithJsAndGpu(wasmModel: IWasmGptModel, jsModel: IGptModelLink) {
    let needsSync = wasmModel.weightsDirty || wasmModel.intersDirty;

    if (wasmModel.lastMemoryBuffer !== wasmModel.native.memory.buffer) {
        wasmModel.lastMemoryBuffer = wasmModel.native.memory.buffer;
        needsSync = true;
    }

    if (needsSync) {
        readLocalBuffersFromWasm(wasmModel, jsModel, wasmModel.intersDirty, wasmModel.weightsDirty);
        wasmModel.weightsDirty = false;
        wasmModel.intersDirty = false;
    }
}

function readLocalBuffersFromWasm(wasmModel: IWasmGptModel, jsModel: IGptModelLink, writeIntersToGpu: boolean = false, writeWeightsToGpu: boolean = false) {
    readFromWasmToBufferTex(TensorType.Wte, 0, jsModel.vocabEmbed.weight, true);
    readFromWasmToBufferTex(TensorType.Wpe, 0, jsModel.posEmbed.weight, true);

    readFromWasmToBufferTex(TensorType.InputTokens, 0, jsModel.inputTokens);
    readFromWasmToBufferTex(TensorType.InputEmbed, 0, jsModel.add.output);

    for (let i = 0; i < jsModel.blocks.length; i++) {
        let block = jsModel.blocks[i];

        readFromWasmToBufferTex(TensorType.Ln1Gamma, i, block.ln_1.normWeight, true);
        readFromWasmToBufferTex(TensorType.Ln1Beta, i, block.ln_1.normBias, true);
        readFromWasmToBufferTex(TensorType.Ln1Agg, i, block.ln_1.normAgg);
        readFromWasmToBufferTex(TensorType.Ln1Norm, i, block.ln_1.output);

        readFromWasmToBufferTex(TensorType.AttnQkvW, i, block.attn.qkvWeight, true);
        readFromWasmToBufferTex(TensorType.AttnQkvB, i, block.attn.qkvBias, true);

        readFromWasmToBufferTex(TensorType.AttnQkv, i, block.attn.qkvOutput);
        readFromWasmToBufferTex(TensorType.Attn, i, block.attn.attnMatrix);
        // @TODO: attn agg (which we don't have buffers for yet in wasm)
        readFromWasmToBufferTex(TensorType.AttnSmAgg, i, block.attn.attnMatrixAgg);
        readFromWasmToBufferTex(TensorType.AttnSm, i, block.attn.attnMatrixSoftmax);
        readFromWasmToBufferTex(TensorType.AttnVOut, i, block.attn.scaledVectors);

        readFromWasmToBufferTex(TensorType.AttnProjW, i, block.attn.proj.weight, true);
        readFromWasmToBufferTex(TensorType.AttnProjB, i, block.attn.proj.bias!, true);

        readFromWasmToBufferTex(TensorType.AttnProj, i, block.attn.proj.output);
        readFromWasmToBufferTex(TensorType.AttnResidual, i, block.attn.output);

        readFromWasmToBufferTex(TensorType.Ln2Gamma, i, block.ln_2.normWeight, true);
        readFromWasmToBufferTex(TensorType.Ln2Beta, i, block.ln_2.normBias, true);
        readFromWasmToBufferTex(TensorType.Ln2Agg, i, block.ln_2.normAgg);
        readFromWasmToBufferTex(TensorType.Ln2Norm, i, block.ln_2.output);

        readFromWasmToBufferTex(TensorType.MlpW, i, block.mlp.fcLayer.weight, true);
        readFromWasmToBufferTex(TensorType.MlpB, i, block.mlp.fcLayer.bias!, true);
        readFromWasmToBufferTex(TensorType.MlpProjW, i, block.mlp.projLayer.weight, true);
        readFromWasmToBufferTex(TensorType.MlpProjB, i, block.mlp.projLayer.bias!, true);

        readFromWasmToBufferTex(TensorType.MlpMlp, i, block.mlp.fcLayer.output);
        readFromWasmToBufferTex(TensorType.MlpAct, i, block.mlp.mlpGelu);
        readFromWasmToBufferTex(TensorType.MlpProj, i, block.mlp.projLayer.output);
        readFromWasmToBufferTex(TensorType.MlpResidual, i, block.mlp.addLayer.output);
    }

    readFromWasmToBufferTex(TensorType.LnFGamma, 0, jsModel.ln_f.normWeight, true);
    readFromWasmToBufferTex(TensorType.LnFBeta, 0, jsModel.ln_f.normBias, true);
    readFromWasmToBufferTex(TensorType.LnFAgg, 0, jsModel.ln_f.normAgg);
    readFromWasmToBufferTex(TensorType.LnFNorm, 0, jsModel.ln_f.output);

    readFromWasmToBufferTex(TensorType.LmHeadW, 0, jsModel.lm_head.weight, true);

    readFromWasmToBufferTex(TensorType.Logits, 0, jsModel.lm_head.output);
    readFromWasmToBufferTex(TensorType.LogitsSmAgg, 0, jsModel.softmaxFinal.agg);
    readFromWasmToBufferTex(TensorType.LogitsSm, 0, jsModel.softmaxFinal.output);


    let { T, vocabSize } = jsModel.shape;
    let resultBuf = jsModel.softmaxFinal.output.localBuffer!;
    let sortedBuf = new Float32Array(resultBuf.length * 2);
    for (let t = 0; t < T; t++) {
        let options = [...resultBuf.slice(t * vocabSize, (t + 1) * vocabSize)].map((v, i) => ({ v, i }));
        options.sort((a, b) => b.v - a.v);
        for (let i = 0; i < options.length; i++) {
            sortedBuf[(t * vocabSize + i) * 2 + 0] = options[i].i;
            sortedBuf[(t * vocabSize + i) * 2 + 1] = options[i].v;
        }
    }
    jsModel.sortedBuf = sortedBuf;

    function readFromWasmToBufferTex(type: TensorType, idx: number, tex: IBufferTex, isWeight?: boolean) {
        let t = wasmModel.native.getModelTensor(wasmModel.modelPtr, type, idx);
        readToBufferTex(`${TensorType[type]}${idx}`, t, tex);
        let writeToGpu = isWeight ? writeWeightsToGpu : writeIntersToGpu;
        if (writeToGpu) {
            writeToBufferTex(jsModel.gl, tex, tex.localBuffer!);
        }
    }

    function readToBufferTex(name: string, t: TensorF32, tex: IBufferTex) {
        let texSize = tex.height * tex.width * tex.channels;
        if (t.buffer.length !== texSize) {
            throw new Error(`readToBufferTex: buffer size mismatch for ${name}. ` +
            `bufferTex: ${texSize} [h: ${tex.height}, w: ${tex.width}, c: ${tex.channels}], ` +
            `wasmBuffer:  ${t.buffer.length} [${t.shape.join(', ')}]`);
        }
        tex.localBuffer = t.buffer;
    }

}

/*

Mini plan: init wasm side, with our model config.

init gpu side with the above,
link k


*/

// export function
