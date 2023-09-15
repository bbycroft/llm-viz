package main

import "core:math"
import "core:runtime"
import "core:fmt"
import "core:time"
// import "core:debug"

GptModel :: struct {
    gptConfig: GptConfig,

    wte: Tensor,
    wpe: Tensor,

    inputTokens: Tensor,
    inputTokenEmbed: Tensor, // not really needed, but helps sometimes
    inputEmbed: Tensor,

    layers: []GptLayer,

    ln_f: LayerNorm,

    lmHeadW: Tensor,

    logits: Tensor,
    logitsSmAgg: Tensor,
    logitsSm: Tensor, // softmax
}

GptLayer :: struct {
    attn: GptAttention,
    mlp: GptMlp,
}

LayerNorm :: struct {
    gamma: Tensor,
    beta: Tensor,
    agg: Tensor,
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
    attnSmAgg: Tensor,
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


tprintJoin :: proc(args: ..any) -> string {
    return fmt.tprint(args=args, sep="")
}

create_tensor :: proc(shape: []int, data: []f32 = nil) -> Tensor {
    size := 1
    shapeCopy := make([]int, len(shape))

    // runtime.print_string("shape: ")
    // runtime.print_int(len(shape))
    // runtime.print_string(", ")
    // runtime.print_int(len(shapeCopy))
    // runtime.print_string(" [")
    // for i := 0; i < len(shape); i += 1 {
    //     runtime.print_int(shape[i])
    //     if i < len(shape) - 1 do runtime.print_string(", ")
    // }
    // runtime.print_string("]\n")

    for i := 0; i < len(shape); i += 1 {
        size *= shape[i]
        shapeCopy[i] = shape[i]
    }

    stride := 1
    strides := make([]int, len(shape))
    for i := len(shape) - 1; i >= 0; i -= 1 {
        strides[i] = stride
        stride *= shape[i]
    }

    data := data

    if data == nil {
        data = make([]f32, size)
    } else {
        if len(data) != size {
            panic("data size does not match shape")
        }
    }

    return Tensor{
        data = data,
        shape = shapeCopy,
        stride = strides,
    }
}

TensorsAndConfig :: struct {
    config: GptConfig,
    tensors: map[string]Tensor,
}

create_model_from_data :: proc(tensors: TensorsAndConfig, b_override: int) -> GptModel {
    gptConfig := tensors.config
    B := b_override > 0 ? b_override : gptConfig.B
    gptConfig.B = B

    T := gptConfig.T
    C := gptConfig.C
    A := gptConfig.A
    n_heads := gptConfig.n_heads
    n_layers := gptConfig.n_layers
    n_vocab := gptConfig.n_vocab

    model: GptModel = {
        gptConfig = gptConfig,
        wte = tensors.tensors["transformer.wte.weight"],
        wpe = tensors.tensors["transformer.wpe.weight"],
        lmHeadW = tensors.tensors["lm_head.weight"],
        layers = make([]GptLayer, n_layers),

        inputTokens = create_tensor([]int{B, T}),
        inputTokenEmbed = create_tensor([]int{B, T, C}),
        inputEmbed = create_tensor([]int{B, T, C}),

        ln_f = create_layer_norm(gptConfig, tensors, "transformer.ln_f."),

        logits = create_tensor([]int{B, T, n_vocab}),
        logitsSm = create_tensor([]int{B, T, n_vocab}),
        logitsSmAgg = create_tensor([]int{B, T, 2}),
    }

    // fmt.printf("model: %#v\n", model)

    for i := 0; i < n_layers; i += 1 {
        model.layers[i] = create_layer(gptConfig, tensors, tprintJoin("transformer.h.", i, ".")) 
    }

    create_layer :: proc(gptConfig: GptConfig, tensors: TensorsAndConfig, prefix: string) -> GptLayer {
        attn := create_attention(gptConfig, tensors, tprintJoin(prefix, "attn."))
        mlp := create_mlp(gptConfig, tensors, tprintJoin(prefix, "mlp."))

        attn.layerNorm = create_layer_norm(gptConfig, tensors, tprintJoin(prefix, "ln_1."))
        mlp.layerNorm = create_layer_norm(gptConfig, tensors, tprintJoin(prefix, "ln_2."))

        return GptLayer{ attn, mlp }
    }

    create_attention :: proc(gptConfig: GptConfig, tensors: TensorsAndConfig, prefix: string) -> GptAttention {
        B := gptConfig.B
        T := gptConfig.T
        C := gptConfig.C
        A := gptConfig.A
        n_heads := gptConfig.n_heads

        attn := GptAttention{
            qkvW = tensors.tensors[tprintJoin(prefix, "c_attn.weight")],
            qkvB = tensors.tensors[tprintJoin(prefix, "c_attn.bias")],
            projW = tensors.tensors[tprintJoin(prefix, "c_proj.weight")],
            projB = tensors.tensors[tprintJoin(prefix, "c_proj.bias")],

            attn = create_tensor([]int{B, n_heads, T, T}),
            attnSm = create_tensor([]int{B, n_heads, T, T}),
            attnSmAgg = create_tensor([]int{B, n_heads, T, 2}),
            proj = create_tensor([]int{B, T, C}),
            residual = create_tensor([]int{B, T, C}),
            qkv = create_tensor([]int{B, T, 3 * n_heads * A}),
            vOut = create_tensor([]int{B, T, n_heads * A}),
        }

        return attn
    }

    create_mlp :: proc(gptConfig: GptConfig, tensors: TensorsAndConfig, prefix: string) -> GptMlp {
        B := gptConfig.B
        T := gptConfig.T
        C := gptConfig.C

        mlp := GptMlp{
            mlpW = tensors.tensors[tprintJoin(prefix, "c_fc.weight")],
            mlpB = tensors.tensors[tprintJoin(prefix, "c_fc.bias")],
            projW = tensors.tensors[tprintJoin(prefix, "c_proj.weight")],
            projB = tensors.tensors[tprintJoin(prefix, "c_proj.bias")],

            mlp = create_tensor([]int{B, T, C * 4}),
            act = create_tensor([]int{B, T, C * 4}),
            proj = create_tensor([]int{B, T, C}),
            residual = create_tensor([]int{B, T, C}),
        }

        return mlp
    }

    create_layer_norm :: proc(gptConfig: GptConfig, tensors: TensorsAndConfig, prefix: string) -> LayerNorm {
        B := gptConfig.B
        T := gptConfig.T
        C := gptConfig.C

        ln := LayerNorm{
            gamma = tensors.tensors[tprintJoin(prefix, "weight")],
            beta = tensors.tensors[tprintJoin(prefix, "bias")],
            agg = create_tensor([]int{B, T, 2}),
            normalized = create_tensor([]int{B, T, C}),
        }

        return ln
    }

    return model
}

create_model_from_empty :: proc(gptConfig: GptConfig) -> GptModel {
    B := gptConfig.B
    T := gptConfig.T
    C := gptConfig.C
    A := gptConfig.A
    n_heads := gptConfig.n_heads
    n_layers := gptConfig.n_layers
    n_vocab := gptConfig.n_vocab

    model: GptModel = {
        gptConfig = gptConfig,
        wte = create_tensor([]int{n_vocab, C}),
        wpe = create_tensor([]int{T, C}),
        lmHeadW = create_tensor([]int{n_vocab, C}),
        layers = make([]GptLayer, n_layers),

        inputTokens = create_tensor([]int{B, T}),
        inputTokenEmbed = create_tensor([]int{B, T, C}),
        inputEmbed = create_tensor([]int{B, T, C}),

        ln_f = create_layer_norm(gptConfig),

        logits = create_tensor([]int{B, T, n_vocab}),
        logitsSmAgg = create_tensor([]int{B, T, 2}),
        logitsSm = create_tensor([]int{B, T, n_vocab}),
    }

    for i := 0; i < n_layers; i += 1 {
        model.layers[i] = create_layer(gptConfig)
    }

    create_layer :: proc(gptConfig: GptConfig) -> GptLayer {
        B := gptConfig.B
        T := gptConfig.T
        C := gptConfig.C
        A := gptConfig.A
        n_heads := gptConfig.n_heads

        attn := GptAttention {
            qkvW = create_tensor([]int{3 * n_heads * A, C}),
            qkvB = create_tensor([]int{3 * n_heads * A}),
            projW = create_tensor([]int{C, n_heads * A}),
            projB = create_tensor([]int{C}),

            qkv = create_tensor([]int{B, T, 3 * n_heads * A}),
            attn = create_tensor([]int{B, n_heads, T, T}),
            attnSm = create_tensor([]int{B, n_heads, T, T}),
            attnSmAgg = create_tensor([]int{B, n_heads, T, 2}),
            vOut = create_tensor([]int{B, T, n_heads * A}),
            proj = create_tensor([]int{B, T, C}),
            residual = create_tensor([]int{B, T, C}),
            layerNorm = create_layer_norm(gptConfig),
        }

        mlp := GptMlp {
            mlpW = create_tensor([]int{C * 4, C}),
            mlpB = create_tensor([]int{C * 4}),
            projW = create_tensor([]int{C, C * 4}),
            projB = create_tensor([]int{C}),

            mlp = create_tensor([]int{B, T, C * 4}),
            act = create_tensor([]int{B, T, C * 4}),
            proj = create_tensor([]int{B, T, C}),
            residual = create_tensor([]int{B, T, C}),
            layerNorm = create_layer_norm(gptConfig),
        }

        return GptLayer{ attn, mlp }
    }

    create_layer_norm :: proc(gptConfig: GptConfig) -> LayerNorm {
        B := gptConfig.B
        T := gptConfig.T
        C := gptConfig.C

        ln := LayerNorm{
            gamma = create_tensor([]int{C}),
            beta = create_tensor([]int{C}),
            agg = create_tensor([]int{B, T, 2}),
            normalized = create_tensor([]int{B, T, C}),
        }

        return ln
    }

    return model
}

GptModelTarget :: enum {
    // weights
    Wte,
    Wpe,
    LmHeadW,
    AttnQkvW,
    AttnQkvB,
    AttnProjW,
    AttnProjB,
    MlpW,
    MlpB,
    MlpProjW,
    MlpProjB,
    Ln1Gamma,
    Ln1Beta,
    Ln2Gamma,
    Ln2Beta,
    LnFGamma,
    LnFBeta,

    // intermediate values
    InputTokens,
    InputTokenEmbed,
    InputEmbed,

    // per-layer (requires layer index)

    Ln1Agg,
    Ln1Norm,
    AttnQkv,
    Attn,
    AttnSmAgg,
    AttnSm,
    AttnVOut,
    AttnProj,
    AttnResidual,

    Ln2Agg,
    Ln2Norm,
    MlpMlp,
    MlpAct,
    MlpProj,
    MlpResidual,

    LnFAgg,
    LnFNorm,
    Logits,
    LogitsSmAgg,
    LogitsSm,
}

get_model_tensor :: proc(model: ^GptModel, target: GptModelTarget, index: int) -> (^Tensor) {
    layer := &model.layers[index]
    switch target {
    case .Wte: return &model.wte
    case .Wpe: return &model.wpe
    case .LmHeadW: return &model.lmHeadW
    case .AttnQkvW: return &layer.attn.qkvW
    case .AttnQkvB: return &layer.attn.qkvB
    case .AttnProjW: return &layer.attn.projW
    case .AttnProjB: return &layer.attn.projB
    case .MlpW: return &layer.mlp.mlpW
    case .MlpB: return &layer.mlp.mlpB
    case .MlpProjW: return &layer.mlp.projW
    case .MlpProjB: return &layer.mlp.projB
    case .Ln1Gamma: return &layer.attn.layerNorm.gamma
    case .Ln1Beta: return &layer.attn.layerNorm.beta
    case .Ln2Gamma: return &layer.mlp.layerNorm.gamma
    case .Ln2Beta: return &layer.mlp.layerNorm.beta
    case .LnFGamma: return &model.ln_f.gamma
    case .LnFBeta: return &model.ln_f.beta
     
    case .InputTokens: return &model.inputTokens
    case .InputTokenEmbed: return &model.inputTokenEmbed
    case .InputEmbed: return &model.inputEmbed
    case .Ln1Agg: return &layer.attn.layerNorm.agg
    case .Ln1Norm: return &layer.attn.layerNorm.normalized
    case .AttnQkv: return &layer.attn.qkv
    case .Attn: return &layer.attn.attn
    case .AttnSmAgg: return &layer.attn.attnSmAgg
    case .AttnSm: return &layer.attn.attnSm
    case .AttnVOut: return &layer.attn.vOut
    case .AttnProj: return &layer.attn.proj
    case .AttnResidual: return &layer.attn.residual
    case .Ln2Agg: return &layer.mlp.layerNorm.agg
    case .Ln2Norm: return &layer.mlp.layerNorm.normalized
    case .MlpMlp: return &layer.mlp.mlp
    case .MlpAct: return &layer.mlp.act
    case .MlpProj: return &layer.mlp.proj
    case .MlpResidual: return &layer.mlp.residual
    case .LnFAgg: return &model.ln_f.agg
    case .LnFNorm: return &model.ln_f.normalized
    case .Logits: return &model.logits
    case .LogitsSmAgg: return &model.logitsSmAgg
    case .LogitsSm: return &model.logitsSm
    }
    return nil
}

tensor_get_data_ptr :: proc(t: ^Tensor) -> rawptr {
    return &t.data[0]
}

check_tensor :: proc(name: string, a: Tensor, b: Tensor) {
    when true {
        return
    } else {
    fmt.printf("CHECK %s\n", name)
    if len(a.data) != len(b.data) {
        fmt.printf("CHECK %v: size mismatch: %v != %v (%v, %v)\n", name, len(a.data), len(b.data), a, b)
    }
    for i := 0; i < len(a.data); i += 1 {
        delta := math.abs(a.data[i] - b.data[i])
        if delta > 1e-5 {
            fmt.printf("CHECK %v: mismatch at idx %v: %v != %v (delta = %e), (%v, %v)\n", name, i, a.data[i], b.data[i], delta, a, b)
            break
        }
    }
}
}

run_model :: proc(model: ^GptModel, partials: ^TensorsAndConfig) {
    // start_time := time.now()
    T := model.gptConfig.T
    C := model.gptConfig.C
    n_vocab := model.gptConfig.n_vocab


    if partials != nil {
        inputIdx := partials.tensors["idx"]
        for i := 0; i < len(model.inputTokens.data); i += 1 {
            model.inputTokens.data[i] = inputIdx.data[i]
        }
    }

    run_input_embedding(model)

    layerInput := &model.inputEmbed
    for i := 0; i < model.gptConfig.n_layers; i += 1 {
        run_layer(model, &model.layers[i], i, layerInput, partials)
        layerInput = &model.layers[i].mlp.residual
        // blkName := tprintJoin("block", i)
        // check_tensor(tprintJoin(blkName, "_output"), layerInput^, partials.tensors[blkName])
    }

    run_layer_norm(model, &model.ln_f, layerInput)
    run_matrix_mul(model, &model.ln_f.normalized, &model.lmHeadW, nil, &model.logits, T, C, n_vocab)
    run_softmax(model, &model.logits, &model.logitsSm, &model.logitsSmAgg, T, n_vocab)

    // check_tensor("logitsSm", model.logitsSm, partials.tensors["probs"])

    // elapsed := time.duration_milliseconds(time.since(start_time))
    // fmt.printf("run_model took %f ms\n", elapsed)
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

run_layer :: proc(model: ^GptModel, layer: ^GptLayer, layerIdx: int, input: ^Tensor, partials: ^TensorsAndConfig) {
    run_attention(model, &layer.attn, layerIdx, input, partials)
    run_mlp(model, &layer.mlp, layerIdx, &layer.attn.residual, partials)
}

run_attention :: proc(model: ^GptModel, attention: ^GptAttention, layerIdx: int, input: ^Tensor, partials: ^TensorsAndConfig) {
    B := model.gptConfig.B
    T := model.gptConfig.T
    C := model.gptConfig.C
    A := model.gptConfig.A
    n_heads := model.gptConfig.n_heads

    run_layer_norm(model, &attention.layerNorm, input)

    run_matrix_mul(model, &attention.layerNorm.normalized, &attention.qkvW, &attention.qkvB, &attention.qkv, T, C, C * 3)

    qkv := attention.qkv.data
    attn := attention.attn.data
    attnSmAgg := attention.attnSmAgg.data
    attnSm := attention.attnSm.data
    vOut := attention.vOut.data

    // now to create the attention matrix
    // will avoid reshaping by being careful with indices/strides
    attnScale: f32 = 1.0 / math.sqrt(f32(A))

    for b := 0; b < B; b += 1 {
        for h := 0; h < n_heads; h += 1 {
            for t := 0; t < T; t += 1 {
                qStride := b * T * C * 3 + t * C * 3 + h * A

                attnStride := b * n_heads * T * T + h * T * T + t * T

                maxDot: f32 = math.inf_f32(-1)
                for t2 := 0; t2 <= t; t2 += 1 {
                    kStride := b * T * C * 3 + t2 * C * 3 + h * A + C

                    qkDot: f32 = 0.0
                    for a := 0; a < A; a += 1 {
                        // fmt.printf("At b=%d, h=%d, t=%d, t2=%d, a=%d, qPos=%d, kPos=%d\n", b, h, t, t2, a, qStride + a, kStride + a)
                        q := qkv[qStride + a]
                        k := qkv[kStride + a]
                        qkDot += q * k
                    }
                    qkDot *= attnScale

                    maxDot = math.max(maxDot, qkDot)

                    attn[attnStride + t2] = qkDot
                }
                for t2 := t + 1; t2 < T; t2 += 1 {
                    attn[attnStride + t2] = 0.0; //math.inf_f32(-1)
                }

                // calc the sum of exp(a - maxDot) for the softmax
                sumExp: f32 = 0.0
                for t2 := 0; t2 <= t; t2 += 1 {
                    sumExp += fast_exp(attn[attnStride + t2] - maxDot)
                }

                sumExpInv: f32 = 1.0 / sumExp

                attnSmAggStride := b * n_heads * T + h * T + t

                attnSmAgg[attnSmAggStride + 0] = maxDot
                attnSmAgg[attnSmAggStride + 1] = sumExp

                for t2 := 0; t2 <= t; t2 += 1 {
                    attnSm[attnStride + t2] = fast_exp(attn[attnStride + t2] - maxDot) * sumExpInv
                }

                vOutStride := b * T * C + t * C + h * A

                // now to calc the output
                for a := 0; a < A; a += 1 {
                    v: f32 = 0.0
                    for t2 := 0; t2 <= t; t2 += 1 {
                        vStride := b * T * C * 3 + t2 * C * 3 + h * A + C * 2
                        v += attnSm[attnStride + t2] * qkv[vStride + a]
                    }
                    vOut[vOutStride + a] = v
                }
            }
        }
    }

    run_matrix_mul(model, &attention.vOut, &attention.projW, &attention.projB, &attention.proj, T, C, C)
    run_residual_add(model, input, &attention.proj, &attention.residual, T, C)
}

run_mlp :: proc(model: ^GptModel, mlp: ^GptMlp, layerIdx: int, input: ^Tensor, partials: ^TensorsAndConfig) {
    T := model.gptConfig.T
    C := model.gptConfig.C

    run_layer_norm(model, &mlp.layerNorm, input)
    run_matrix_mul(model, &mlp.layerNorm.normalized, &mlp.mlpW, &mlp.mlpB, &mlp.mlp, T, C, C * 4)
    run_gelu_activation(model, &mlp.mlp, &mlp.act, T, C * 4)
    run_matrix_mul(model, &mlp.act, &mlp.projW, &mlp.projB, &mlp.proj, T, C * 4, C)
    run_residual_add(model, input, &mlp.proj, &mlp.residual, T, C)
}

run_matrix_mul :: proc(model: ^GptModel, input: ^Tensor, w: ^Tensor, b: ^Tensor, output: ^Tensor, T: int, C: int, C2: int) {
    B := model.gptConfig.B

    inputData := input.data
    wData := w.data
    bData: []f32 = {0.0}
    outputData := output.data
    bDataMul := 0

    if (b != nil) {
        bData = b.data
        bDataMul = 1
    }

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C
            c2Stride := b * T * C2 + t * C2

            for c2 := 0; c2 < C2; c2 += 1 {
                sum: f32 = bData[c2 * bDataMul]
                for c := 0; c < C; c += 1 {
                    sum += wData[c2 * C + c] * inputData[cStride + c]
                }
                outputData[c2Stride + c2] = sum
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
                y: f32 = x * 0.5 * (1.0 + fast_tanh(math.sqrt(f32(2.0) / math.PI) * (x + f32(0.044715) * x * x * x)))
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
    agg := layerNorm.agg.data
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

            stdDev: f32 = math.sqrt(M2 / f32(C) + 1e-5)
            stdDevInv: f32 = 1.0 / stdDev

            agg[b * T + t * 2 + 0] = mean
            agg[b * T + t * 2 + 1] = stdDev

            for c := 0; c < C; c += 1 {
                normalized[cStride + c] = (inputData[cStride + c] - mean) * stdDevInv * gamma[c] + beta[c]
            }
        }
    }
}

run_softmax :: proc(model: ^GptModel, input: ^Tensor, output: ^Tensor, agg: ^Tensor, T: int, C: int) {
    B := model.gptConfig.B

    inputData := input.data
    aggData := agg.data
    outputData := output.data

    for b := 0; b < B; b += 1 {
        for t := 0; t < T; t += 1 {
            cStride := b * T * C + t * C

            max: f32 = 0.0
            for c := 0; c < C; c += 1 {
                max = math.max(max, inputData[cStride + c])
            }

            sumExp: f32 = 0.0
            for c := 0; c < C; c += 1 {
                sumExp += fast_exp(inputData[cStride + c] - max)
            }
            sumExpInv: f32 = 1.0 / sumExp

            aggData[b * T + t * 2 + 0] = max
            aggData[b * T + t * 2 + 1] = sumExp

            for c := 0; c < C; c += 1 {
                outputData[cStride + c] = fast_exp(inputData[cStride + c] - max) * sumExpInv
            }
        }
    }
}

fast_exp :: expf
fast_tanh :: tanhf