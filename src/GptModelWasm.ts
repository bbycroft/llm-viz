import { IAddLayerLink, IEmbedLayerLink, IGptModelLink, ILayerNormLayerLink, ILinearLayerLink, IModelShape, ISoftmaxLayerLink } from "./GptModel";
import { createBufferTex } from "./utils/renderPhases";
import { IGptModelConfig } from "./utils/tensor";


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

    return {
         gl,
         add: createAddLayer(layerBuilder),
         inputBuf: new Float32Array(),
         inputLen: 6,
         ln_f: createLayerNormLayer(layerBuilder),
         inputTokens: createBufferTex(gl, B * C, 1, 1),
         lm_head: createLinearLayer(layerBuilder, T, C, vocabSize),
         blocks: [],
         output: createBufferTex(gl, 1, 1, 1),
         posEmbed: createEmbedLayer(layerBuilder, T),
         vocabEmbed: createEmbedLayer(layerBuilder, vocabSize),
         shape: shape,
         softmaxFinal: createSoftmaxLayer(layerBuilder),
         resultBuf: null,
         sortedBuf: null,
    };
}

function createAddLayer(builder: IWasmLayerBuilder): IAddLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        output: createBufferTex(gl, C, B * T, 1),
    };
}

function createEmbedLayer(builder: IWasmLayerBuilder, size: number): IEmbedLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        weight: createBufferTex(gl, 1, 1, 1),
        input: createBufferTex(gl, 1, 1, 1),
        output: createBufferTex(gl, 1, 1, 1),
    };
}

function createLinearLayer(builder: IWasmLayerBuilder, t: number, cIn: number, cOut: number): ILinearLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        weight: createBufferTex(gl, 1, 1, 1),
        bias: createBufferTex(gl, 1, 1, 1),
        output: createBufferTex(gl, 1, 1, 1),
    };
}

function createLayerNormLayer(builder: IWasmLayerBuilder): ILayerNormLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        normAgg: createBufferTex(gl, 1, 1, 1),
        normBias: createBufferTex(gl, C, 1, 1),
        normWeight: createBufferTex(gl, C, 1, 1),
        output: createBufferTex(gl, C, T, 1),
    };
}

function createSoftmaxLayer(builder: IWasmLayerBuilder): ISoftmaxLayerLink {
    let { gl, shape: { B, T, C } } = builder;

    return {
        agg: createBufferTex(gl, 1, 1, 1),
        output: createBufferTex(gl, 1, 1, 1),
    };
}

