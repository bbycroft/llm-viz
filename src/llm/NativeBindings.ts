import { IGptModelConfig, TensorF32 } from "@/src/utils/tensor";

export async function loadNativeBindings() {

    let resp = await fetch('/native.wasm');
    // load wasm file and return the module

    let lineStr = "";

    let memory = new WebAssembly.Memory({ initial: 1, maximum: 256 });

    let importObject = {
        env: {
            memory,
        },
        odin_env: {
            write: (fd: number, ptr: number, len: number) => {
                let mem = new Uint8Array(importObject.env.memory.buffer, ptr, len);
                let strPart = new TextDecoder().decode(mem);
                let lines = strPart.split('\n');
                for (let i = 0; i < lines.length - 1; i++) {
                    console.log(lineStr + lines[i]);
                    lineStr = "";
                }
                lineStr += lines[lines.length - 1];
            },
            time_now: () => {
                return BigInt(Date.now()) * BigInt(1e6);
            },
        },
        odin_dom: {
            init_event_raw: (ptr: number) => {
                console.log('ODIN: init_event_raw', ptr);
            },
        },
    };

    let wasmModule = await WebAssembly.instantiateStreaming(resp, importObject);

    let exports = wasmModule.instance.exports as unknown as INativeExports;
    exports.init_allocator(exports.__heap_base);
    // let res = exports.add_numbers(4, 5);
    // let sin = exports.sinf_custom(0.25);

    // console.log(module);
    // console.log(initRes, res, sin);

    let nativeFuncs = new NativeFunctions(wasmModule, exports, memory);

    // checkNativeFns(exports);

    return nativeFuncs;
}

interface INativeExports {
    __heap_base: number;
    init_allocator: (heapBase: number) => number;
    add_numbers: (a: number, b: number) => number;
    sinf_custom: (a: number) => number;
    cosf_custom: (a: number) => number;
    expf_custom: (a: number) => number;
    wasm_create_model: (B: number, T: number, C: number, n_layers: number, n_heads: number, n_vocab: number) => number;
    wasm_run_model: (model: number) => number;
    wasm_get_model_tensor: (model: number, tensor: number, index: number) => number;
}

export class NativeFunctions {

    viewBuf: ArrayBuffer;
    int32View: Int32Array;
    ptrView: Uint32Array;

    constructor(
        public module: WebAssembly.WebAssemblyInstantiatedSource,
        public exports: INativeExports,
        public memory: WebAssembly.Memory,
    ) {

        this.viewBuf = memory.buffer;
        this.int32View = new Int32Array(memory.buffer);
        this.ptrView = new Uint32Array(memory.buffer);
    }

    createModel(config: IGptModelConfig) {
        let model = this.exports.wasm_create_model(config.B ?? 1, config.block_size, config.n_embd, config.n_layer, config.n_head, config.vocab_size)
        return model;
    }

    runModel(model: number) {
        this.exports.wasm_run_model(model);
    }

    getModelTensor(model: number, tensor: TensorType, index: number = 0) {
        let ptr = this.exports.wasm_get_model_tensor(model, tensor, index);
        this.checkViews();
        let bufNElem = this.int32View[ptr / 4];
        let ndimsSize = this.int32View[ptr / 4 + 1];
        let dataPtr = this.ptrView[ptr / 4 + 2];
        let shapeArrPtr = this.ptrView[ptr / 4 + 3];
        let strideArrPtr = this.ptrView[ptr / 4 + 4];

        let shape = new Int32Array(this.memory.buffer, shapeArrPtr, ndimsSize);
        let stride = new Int32Array(this.memory.buffer, strideArrPtr, ndimsSize);
        let data = new Float32Array(this.memory.buffer, dataPtr, bufNElem);

        return new TensorF32([...shape], data, [...stride]);
    }

    checkViews() {
        if (this.viewBuf === this.memory.buffer) {
            return;
        }

        this.viewBuf = this.memory.buffer;
        this.int32View = new Int32Array(this.memory.buffer);
        this.ptrView = new Uint32Array(this.memory.buffer);
    }
}

export enum TensorType {
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

function checkNativeFns(exports: INativeExports) {
     checkFn((f) => [Math.sin(f), exports.sinf_custom(f)], 'sinf');
     checkFn((f) => [Math.cos(f), exports.cosf_custom(f)], 'cosf');
     checkFn((f) => [Math.exp(f), exports.expf_custom(f)], 'expf');
}

function createTestValues() {
    let actualTestValues: number[] = [];

    for (let vals in testValues) {
        // we'll use a range of 100 values either side of each test value
        let start = testValues[vals];
        let startI = floatAsInt(start);
        for (let i = 0; i < 100; i++) {
            let f = intAsFloat(startI + i);
            actualTestValues.push(f);
            let f2 = intAsFloat(startI - i);
            i > 0 && actualTestValues.push(f2);
        }
    }

    for (let i = 0; i < 10000; i++) {
        actualTestValues.push(-10 + Math.random() * 20);
    }

    for (let i = 0; i < 10000; i++) {
        actualTestValues.push(-Math.PI / 4 + Math.random() * Math.PI / 2);
    }

    return actualTestValues;
}

function checkFn(testFn: (f: number) => [number, number], name: string) {
    let actualTestValues = createTestValues();

    let arr0 = new Float32Array(1);
    let arr1 = new Float32Array(1);
    let arr2 = new Float32Array(1);
    let maxAbsError = 0;
    let maxAbsErrorVal = 0;
    let maxRelError = 0;
    let maxRelErrorVal = 0;
    for (let i = 0; i < actualTestValues.length; i++) {
        arr0[0] = actualTestValues[i];

        let res = testFn(arr0[0]);

        arr1[0] = res[0];
        arr2[0] = res[1];

        let absError = Math.abs(arr1[0] - arr2[0]);
        let relError = absError / Math.abs(arr1[0]);

        if (absError > maxAbsError) {
            maxAbsError = absError;
            maxAbsErrorVal = arr0[0];
        }
        if (relError > maxRelError) {
            maxRelError = relError;
            maxRelErrorVal = arr0[0];
        }
    }

    console.log(`${name}: max abs error: ${maxAbsError} (at ${maxAbsErrorVal}), max rel error: ${maxRelError} (at ${maxRelErrorVal})`);
}

function floatAsInt(f: number) {
    let buf = new ArrayBuffer(4);
    let view = new DataView(buf);
    view.setFloat32(0, f, true);
    return view.getInt32(0, true);
}

function intAsFloat(i: number) {
    let buf = new ArrayBuffer(4);
    let view = new DataView(buf);
    view.setInt32(0, i, true);
    return view.getFloat32(0, true);
}

const pi = Math.PI;
const piOver2 = pi / 2;
const piOver4 = pi / 4;
const twoPi = 2 * pi;
const threePiOver2 = 3 * pi / 2;

const testValues = [
  -10, -pi, -piOver2, -piOver4, -1e-7, -1e-6, 0, 1e-6, 1e-7, piOver4, piOver2, pi, threePiOver2, twoPi, 10
];

