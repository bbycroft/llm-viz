import { IDataAndModel } from "./mainLoop";
import { nonNil } from "./utils/basic";
import { createBufferTex, writeToBufferTex, setProgramTexUniforms, createRenderPhase, IBufferTex } from "./utils/renderPhases";
import { createShaderProgram } from "./utils/shader";

export interface IModelShape {
    B: number;
    C: number;
    nHeads: number;
    T: number;
    A: number;
}

export interface ILayerBuilder {
    gl: WebGL2RenderingContext;
    dataAndModel: IDataAndModel;
    shape: IModelShape;
}

export const basicVertexShader = /*glsl*/`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0, 1);
}
`;

export function createGptLayer(gl: WebGL2RenderingContext, dataAndModel: IDataAndModel) {
    let model = dataAndModel.model;
    let head0Prefix = "transformer.h.0.attn.";

    let config = model.config;

    let B = dataAndModel.data.config.B!;
    let C = config.n_embd;
    let nHeads = config.n_head;
    let T = config.block_size;
    let A = C / nHeads; // n elements in each Q, K, V vector, i.e. what we project down to

    let modelShape = { B, C, nHeads, T, A, };

    // move the 1st dim to the end, i.e. the QKV split will be packed into RGB tex channels
    let tAttnWeight = model[head0Prefix + 'c_attn.weight'].view([3, nHeads, A, C]).permute(1, 2, 3, 0);
    let tAttnBias = model[head0Prefix + 'c_attn.bias'].view([3, nHeads, A]).permute(1, 2, 0);
    let tProjWeight = model[head0Prefix + 'c_proj.weight'];
    let tProjBias = model[head0Prefix + 'c_proj.bias'];

    // weights
    let qkvWeight         = createBufferTex(gl, C, nHeads * A, 3);
    let qkvBias           = createBufferTex(gl, 1, nHeads * A, 3);
    let projWeight        = createBufferTex(gl, C, C, 1);
    let projBias          = createBufferTex(gl, 1, C, 1);

    // inputs; buffers; outputs
    let residualInput     = createBufferTex(gl, C, B * T, 1);
    let qkvOutput         = createBufferTex(gl, A, B * nHeads * T, 4); // 4 channels required for color-renderable
    let attnMatrix        = createBufferTex(gl, T, B * nHeads * T, 1);
    let attnMatrixAgg     = createBufferTex(gl, 1, B * nHeads * T, 2);
    let attnMatrixSoftmax = createBufferTex(gl, T, B * nHeads * T, 1);
    let scaledVectors     = createBufferTex(gl, C, B * T, 1);
    let projOutput        = createBufferTex(gl, C, B * T, 1);

    writeToBufferTex(gl, qkvWeight, tAttnWeight.toFloat32Array());
    writeToBufferTex(gl, qkvBias, tAttnBias.toFloat32Array());
    writeToBufferTex(gl, projWeight, tProjWeight.toFloat32Array());
    writeToBufferTex(gl, projBias, tProjBias.toFloat32Array());

    let qkvProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

    let selfAttendProg = createShaderProgram(gl, basicVertexShader, /* glsl */`#version 300 es
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

    let attnMatrixAggProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

            // Pass 2 finds the sum (shifted by max)
            float a = 0.0;
            for (int i = 0; i <= tIdxY; i++) {
                float p = texelFetch(attnMatrix, ivec2(i, pos.y), 0).r;
                a += exp(p - m);
            }

            // Store sufficient information to compute/apply the softmax
            attnMatrixAgg = vec2(1.0 / a, m);
        }
    `);

    let attnMatrixSoftmaxProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

    let scaledVectorsProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

    let ln_1 = createLayerNorm(gl, dataAndModel, modelShape, 'transformer.h.0.ln_1', residualInput);

    let qkvPhase = createRenderPhase(gl, qkvProg, [qkvOutput], [ln_1.normOutput, qkvWeight, qkvBias], ['attnInput', 'qkvWeight', 'qkvBias']);
    let selfAttendPhase = createRenderPhase(gl, selfAttendProg, [attnMatrix], [qkvOutput], ['qkvOutput']);
    let attnMatrixAggPhase = createRenderPhase(gl, attnMatrixAggProg, [attnMatrixAgg], [attnMatrix], ['attnMatrix']);
    let attnMatrixSoftmaxPhase = createRenderPhase(gl, attnMatrixSoftmaxProg, [attnMatrixSoftmax], [attnMatrix, attnMatrixAgg], ['attnMatrix', 'attnMatrixAgg']); // Could skip?
    let scaledVectorsPhase = createRenderPhase(gl, scaledVectorsProg, [scaledVectors], [qkvOutput, attnMatrixSoftmax], ['qkvOutput', 'attnMatrixSoftmax']);
    let proj = createLinearLayer(gl, dataAndModel, modelShape, 'transformer.h.0.attn.c_proj', C, C, scaledVectors, residualInput);
    let ln_2 = createLayerNorm(gl, dataAndModel, modelShape, 'transformer.h.0.ln_2', proj.linearOutput);
    let mlp = createMLP(gl, dataAndModel, modelShape, 'transformer.h.0.mlp', ln_2.normOutput);

    return {
        residualInput,
        qkvPhase,
        selfAttendPhase,
        attnMatrixAggPhase,
        attnMatrixSoftmaxPhase,
        scaledVectorsPhase,
        proj,
        ln_1,
        ln_2,
        mlp,
    };
}

export function createLayerNorm(gl: WebGL2RenderingContext, dataAndModel: IDataAndModel, shape: IModelShape, layerPrefix: string, input: IBufferTex) {
    let { B, T, C } = shape;
    let model = dataAndModel.model;

    let tWeight = model[layerPrefix + '.weight'];
    let tBias = model[layerPrefix + '.bias'];

    // weights
    let normWeight = createBufferTex(gl, 1, C, 1); // (C) (1)
    let normBias   = createBufferTex(gl, 1, C, 1); // (C) (1)

    // operating memory
    let normAgg    = createBufferTex(gl, 1, B * T, 2); // (B, T) (1) [2]
    let normOutput = createBufferTex(gl, C, B * T, 1); // (B, T) (C)

    writeToBufferTex(gl, normWeight, tWeight.toFloat32Array());
    writeToBufferTex(gl, normBias, tBias.toFloat32Array());

    let normEps = 1e-5;

    let normAggProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

    let normApply = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
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

    let normAggPhase = createRenderPhase(gl, normAggProg, [normAgg], [input], ['normInput']);
    let normApplyPhase = createRenderPhase(gl, normApply, [normOutput],
        [input, normAgg, normWeight, normBias],
        ['normInput', 'normAgg', 'normWeight', 'normBias']);

    return {
        normAggPhase,
        normApplyPhase,
        normOutput,
    };
}

export function createMLP(gl: WebGL2RenderingContext, dataAndModel: IDataAndModel, shape: IModelShape, layerPrefix: string, input: IBufferTex) {
    let { B, T, C } = shape;

    // operating memory
    let mlpGelu = createBufferTex(gl, C * 4, B * T, 1); // (B, T) (4C)

    let fcLayer = createLinearLayer(gl, dataAndModel, shape, layerPrefix + '.c_fc', C, C * 4, input);

    let geluProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D geluInput;  // (B, T) (C * 4)
        out float geluOutput; // (B, T) (C * 4)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);
            float x = texelFetch(geluInput, pos, 0).r;
            geluOutput = x * 0.5 * (1.0 + tanh(sqrt(2.0 / 3.14159265358) * (x + 0.044715 * x * x * x)));
        }
    `)!;

    let geluPhase = createRenderPhase(gl, geluProg, [mlpGelu], [fcLayer.linearOutput], ['geluInput']);

    let projLayer = createLinearLayer(gl, dataAndModel, shape, layerPrefix + '.c_proj', C * 4, C, mlpGelu);

    return {
        fcLayer,
        geluPhase,
        projLayer,
    };
}

export function createLinearLayer(gl: WebGL2RenderingContext, dataAndModel: IDataAndModel, shape: IModelShape, layerPrefix: string, nIn: number, nOut: number, input: IBufferTex, residual?: IBufferTex) {
    let { B, T } = shape;
    let model = dataAndModel.model;

    let tWeight = model[layerPrefix + '.weight'];
    let tBias = model[layerPrefix + '.bias'];

    // weights
    let linearWeight = createBufferTex(gl, nIn, nOut, 1); // (nOut) (nIn)
    let linearBias   = createBufferTex(gl, 1, nOut, 1); // (nOut) (1)

    // operating memory
    let linearOutput = createBufferTex(gl, nOut, B * T, 1); // (B, T) (nOut)

    writeToBufferTex(gl, linearWeight, tWeight.toFloat32Array());
    writeToBufferTex(gl, linearBias, tBias.toFloat32Array());

    let linearProg = createShaderProgram(gl, basicVertexShader, /*glsl*/`#version 300 es
        precision highp float;          //    y     x
        uniform sampler2D linearInput;  // (B, T) (nIn)
        uniform sampler2D linearWeight; // (nOut) (nIn)
        uniform sampler2D linearBias;   // (nOut) (1)
        ${residual ? 'uniform sampler2D linearResidual;' : ''}
        out float linearOutput;         // (B, T) (nOut)

        void main() {
            ivec2 pos = ivec2(gl_FragCoord.xy);

            float res = texelFetch(linearBias, ivec2(0, pos.x), 0).r;
            for (int i = 0; i < ${nIn}; i++) {
                float x = texelFetch(linearInput, ivec2(i, pos.y), 0).r;
                float w = texelFetch(linearWeight, ivec2(i, pos.x), 0).r;
                res += x * w;
            }

            ${residual ? 'res += texelFetch(linearResidual, pos, 0).r;' : ''}
            linearOutput = res;
        }
    `)!;

    let linearPhase = createRenderPhase(gl, linearProg, [linearOutput],
        [input, linearWeight, linearBias, residual].filter(nonNil),
        ['linearInput', 'linearWeight', 'linearBias', residual ? 'linearResidual' : null].filter(nonNil));

    return {
        linearPhase,
        linearOutput,
    };
}
