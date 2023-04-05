package main

import "core:math"

GptModel :: struct {
    gptConfig: GptConfig,

    wte: Tensor,
    wpe: Tensor,

    inputTokens: Tensor,
    inputTokenEmbed: Tensor, // not really needed, but helps sometimes
    inputEmbed: Tensor,

    layers: []GptLayer,

}

GptLayer :: struct {
    attn: GptAttention,
    mlp: GptMlp,
}

LayerNorm :: struct {
    gamma: Tensor,
    beta: Tensor,
    normalized: Tensor,
}

GptAttention :: struct {
    layerNorm: LayerNorm,

    qkvW: Tensor,
    qkvB: Tensor,
    projW: Tensor,
    projB: Tensor,

    qkv: Tensor, // the order here is [head0 q, head0 k, head0 v,
                 //                    head1 q, head1 k, head1 v, ...]
                 // just so that the heads are close together in memory
                 // Does this work with the qkvW/qkvB? Particularly for batching?

    attn: Tensor,
    attnSm: Tensor, // softmax
    vOut: Tensor,
    proj: Tensor,

    residual: Tensor,
}

GptMlp :: struct {
    layerNorm: LayerNorm,
    mlpW: Tensor,
    mlpB: Tensor,
    projW: Tensor,
    projB: Tensor,

    mlp: Tensor,
    act: Tensor,

    proj: Tensor,
    residual: Tensor,
}

Embedding :: struct {
    size: int,
    C: int,
    w: Tensor,
}

GptConfig :: struct {
    B: int,
    T: int,
    C: int,
    A: int, // attention size
    n_heads: int,
    n_layers: int,
    n_vocab: int,
}

Tensor :: struct {
    data: []f32,
    shape: []int,
    stride: []int,
}


run_model :: proc(model: ^GptModel) {


    run_input_embedding(model)



    layerInput := &model.inputEmbed
    for i := 0; i < model.gptConfig.n_layers; i += 1 {
        run_layer(model, &model.layers[i], layerInput)
        layerInput = &model.layers[i].mlp.residual
    }


}

run_input_embedding :: proc(model: ^GptModel) {
    B := model.gptConfig.B
    T := model.gptConfig.T
    C := model.gptConfig.C

    // embed tokens
    inputTok := model.inputTokens.data
    tokEmbed := model.inputTokenEmbed.data
    inputEmbed := model.inputEmbed.data
    wte := model.wte.data
    wpe := model.wpe.data

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            tokIdx := int(inputTok[b * T + t])
            cStride := b * T * C + t * C
            for c := 0; c < C; c += 1 {
                tokEmbedV := wte[tokIdx * C + c]
                posEmbedV := wpe[t * C + c]

                tokEmbed[cStride + c] = tokEmbedV
                inputEmbed[cStride + c] = tokEmbedV + posEmbedV
            }
        }
    }
}

run_layer :: proc(model: ^GptModel, layer: ^GptLayer, input: ^Tensor) {
    run_attention(model, &layer.attn, input)
    run_mlp(model, &layer.mlp, &layer.attn.residual)
}

run_attention :: proc(model: ^GptModel, attention: ^GptAttention, input: ^Tensor) {
    B := model.gptConfig.B
    T := model.gptConfig.T
    C := model.gptConfig.C
    A := model.gptConfig.A
    n_heads := model.gptConfig.n_heads

    run_layer_norm(model, &attention.layerNorm, input)

    run_matrix_mul(model, input, &attention.qkvW, &attention.qkvB, &attention.qkv, T, C, C * 3)

    qkv := attention.qkv.data
    attn := attention.attn.data
    attnSm := attention.attnSm.data
    vOut := attention.vOut.data

    // now to create the attention matrix
    // will avoid reshaping by being careful with indices/strides
    attnScale: f32 = 1.0 / math.sqrt(f32(A))

    for b := 0; b < B; b += 1 {
        for h := 0; h < n_heads; h += 1 {
            for t := 0; t < T; t += 1 {
                cStride := b * T * C + t * C

                headStride := b * T * C * n_heads + t * C * n_heads + h * C
                attnStride := b * T * T * n_heads + t * T * n_heads + h * T

                maxDot: f32 = math.inf_f32(-1)
                for t2 := 0; t2 < t; t2 += 1 {
                    cStride2 := b * T * C + t2 * C

                    qkDot: f32 = 0.0
                    for a := 0; a < A; a += 1 {
                        q := qkv[cStride + a]
                        k := qkv[cStride2 + A + a]
                        qkDot += q * k
                    }
                    qkDot *= attnScale

                    maxDot = math.max(maxDot, qkDot)

                    attn[attnStride + t2] = qkDot
                }

                // calc the sum of exp(a - maxDot) for the softmax
                sumExp: f32 = 0.0
                for t2 := 0; t2 < t; t2 += 1 {
                    sumExp += math.exp(attn[attnStride + t2] - maxDot)
                }

                sumExpInv: f32 = 1.0 / sumExp

                for t2 := 0; t2 < t; t2 += 1 {
                    attnSm[attnStride + t2] = math.exp(attn[attnStride + t2] - maxDot) * sumExpInv
                }

                // now to calc the output
                for a := 0; a < A; a += 1 {
                    v: f32 = 0.0
                    for t2 := 0; t2 < t; t2 += 1 {
                        cStride2 := b * T * C + t2 * C + A * 2
                        v += attnSm[attnStride + t2] * qkv[cStride2 + a]
                    }
                    vOut[headStride + a] = v
                }
            }
        }
    }

    run_matrix_mul(model, &attention.vOut, &attention.projW, &attention.projB, &attention.proj, T, C, C)
    run_residual_add(model, input, &attention.proj, &attention.residual, T, C)
}

run_mlp :: proc(model: ^GptModel, mlp: ^GptMlp, input: ^Tensor) {
    T := model.gptConfig.T
    C := model.gptConfig.C

    run_layer_norm(model, &mlp.layerNorm, input)
    run_matrix_mul(model, input, &mlp.mlpW, &mlp.mlpB, &mlp.mlp, T, C, C * 4)
    run_gelu_activation(model, &mlp.mlp, &mlp.act, T, C * 4)
    run_matrix_mul(model, &mlp.act, &mlp.projW, &mlp.projB, &mlp.proj, T, C * 4, C)
    run_residual_add(model, input, &mlp.proj, &mlp.residual, T, C)
}

run_matrix_mul :: proc(model: ^GptModel, input: ^Tensor, w: ^Tensor, b: ^Tensor, output: ^Tensor, T: int, C: int, C2: int) {
    B := model.gptConfig.B

    inputData := input.data
    wData := w.data
    bData := b.data
    outputData := output.data

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C
            c2Stride := b * T * C2 + t * C2

            for c2 := 0; c2 < C2; c2 += 1 {
                sum: f32 = 0.0
                for c := 0; c < C; c += 1 {
                    sum += inputData[cStride + c] * wData[c * C2 + c2]
                }
                outputData[c2Stride + c2] = sum + bData[c2]
            }
        }
    }
}

run_gelu_activation :: proc(model: ^GptModel, input: ^Tensor, output: ^Tensor, T: int, C: int) {
    B := model.gptConfig.B

    inputData := input.data
    outputData := output.data

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C

            for c := 0; c < C; c += 1 {
                x: f32 = inputData[cStride + c]
                y: f32 = x * 0.5 * (1.0 + math.tanh(math.sqrt(f32(2.0) / math.PI) * (x + f32(0.044715) * x * x * x)))
                outputData[cStride + c] = y
            }
        }
    }
}

run_residual_add :: proc(model: ^GptModel, input: ^Tensor, residual: ^Tensor, output: ^Tensor, T: int, C: int) {
    B := model.gptConfig.B

    inputData := input.data
    residualData := residual.data
    outputData := output.data

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C

            for c := 0; c < C; c += 1 {
                outputData[cStride + c] = inputData[cStride + c] + residualData[cStride + c]
            }
        }
    }
}

run_layer_norm :: proc(model: ^GptModel, layerNorm: ^LayerNorm, input: ^Tensor) {
    B := model.gptConfig.B
    T := model.gptConfig.T
    C := model.gptConfig.C

    gamma := layerNorm.gamma.data
    beta := layerNorm.beta.data
    normalized := layerNorm.normalized.data
    inputData := input.data
    
    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C

            // Welford's algorithm
            mean: f32 = 0.0
            M2: f32 = 0.0
            for c := 0; c < C; c += 1 {
                x: f32 = inputData[cStride + c]
                delta: f32 = x - mean
                mean += delta / f32(c + 1)
                M2 += delta * (x - mean)
            }

            stdDevInv: f32 = 1.0 / math.sqrt(M2 / f32(C) + 1e-5)

            for c := 0; c < C; c += 1 {
                normalized[cStride + c] = (inputData[cStride + c] - mean) * stdDevInv * gamma[c] + beta[c]
            }
        }
    }

}
