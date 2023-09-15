//+build linux, windows

package main

import "core:os"
import "core:fmt"
import "core:mem"
import "core:encoding/json"
import "core:encoding/base64"

main :: proc() {
    // test_me_malloc()
    // return

    fmt.set_user_formatters(new(map[typeid]fmt.User_Formatter))
    fmt.register_user_formatter(type_info_of(Tensor).id, tensor_formatter)

    modelWeights, err0 := load_tensors_and_config("public/gpt-nano-sort-model.json")
    partials, err1 := load_tensors_and_config("public/gpt-nano-sort-t0-partials.json")

    if err0 != nil || err1 != nil {
        fmt.println("Error loading model")
        return
    }

    model := create_model_from_data(modelWeights, partials.config.B)

    run_model(&model, &partials)

    model2 := create_model_from_empty(partials.config)

    run_model(&model2, nil)
}

load_tensors_and_config :: proc(file_path: string) -> (TensorsAndConfig, Error) {
    bytes, err0 := file_to_byte_arr(file_path)
    if err0 != nil {
        fmt.println("Error loading file")
        return {}, Error.LoadFailed
    }

    parser := json.make_parser(data=bytes, parse_integers=true)

    val, err1 := json.parse_value(&parser)

    if err1 != nil {
        fmt.println("Error parsing json")
        return {}, Error.LoadFailed
    }

    config := GptConfig{}
    tensorMap := make(map[string]Tensor)

    for key, tensorVal in val.(json.Object) {

        tensorObj := tensorVal.(json.Object)

        if key == "config" {

            read_int_or_default :: proc(obj: json.Object, key: string, default: int) -> int {
                if val, ok := obj[key]; ok {
                    return int(val.(json.Integer))
                }
                return default
            }

            config.C = read_int_or_default(tensorObj, "n_embd", 0)
            config.n_layers = read_int_or_default(tensorObj, "n_layer", 0)
            config.n_vocab = read_int_or_default(tensorObj, "vocab_size", 0)
            config.n_heads = read_int_or_default(tensorObj, "n_head", 0)
            config.T = read_int_or_default(tensorObj, "block_size", 0)
            config.B = read_int_or_default(tensorObj, "B", 0)

            config.A = config.C / config.n_heads
            continue
        }

        if !("data" in tensorObj && "shape" in tensorObj && "dtype" in tensorObj) {
            fmt.println("Invalid tensor object: missing data, shape, or dtype fields");
            continue
        }

        dataStr := tensorObj["data"].(json.String)
        shape := tensorObj["shape"].(json.Array)
        dtype := tensorObj["dtype"].(json.String)

        dataBytes := base64.decode(dataStr)

        dataF32 := mem.slice_ptr(cast(^f32)&dataBytes[0], len(dataBytes) / 4)

        shapeArr := make([]int, len(shape))
        strideArr := make([]int, len(shape))
        for v, idx in shape {
            shapeArr[idx] = int(v.(json.Integer))
        }

        stride := 1
        for i := len(shapeArr) - 1; i >= 0; i -= 1 {
            strideArr[i] = stride
            stride *= shapeArr[i]
        }

        tensor := Tensor{ data=dataF32, shape=shapeArr, stride=strideArr }

        tensorMap[key] = tensor
    }

    // for k, v in tensorMap {
    //     fmt.println("key:", k, "    shape:", v.shape, "stride:", v.stride)
    // }

    // fmt.println("config:", config)

    return TensorsAndConfig{ config=config, tensors=tensorMap }, nil
}

Error :: enum {
    None,
    LoadFailed,
}

when ODIN_OS == .Linux || ODIN_OS == .Windows {

file_to_byte_arr :: proc(file_path: string) -> ([]byte, Error) {

    file, err := os.open(file_path, os.O_RDONLY)
    if err != os.ERROR_NONE {
        return nil, Error.LoadFailed
    }
    defer os.close(file)

    file_size, err1 := os.file_size(file)
    if err != os.ERROR_NONE {
        return nil, Error.LoadFailed
    }

    file_bytes := make([]byte, file_size)
    os.read_full(file, file_bytes)

    return file_bytes, nil
}

} else {
    file_to_byte_arr :: proc(file_path: string) -> ([]byte, Error) {
        return nil, Error.LoadFailed
    }
}


tensor_formatter :: proc "odin" (fi: ^fmt.Info, arg: any, verb: rune) -> bool {
    tensor := arg.(Tensor)
    fmt.wprintf(fi.writer, "Tensor<%v>", tensor.shape)

    return true
}
