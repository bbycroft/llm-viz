
export async function loadNativeBindings() {

    let resp = await fetch('/native.wasm');
    // load wasm file and return the module

    let importObject = {
        env: {
            memory: new WebAssembly.Memory({ initial: 1, maximum: 20 }), //{ initial: 1, maximum: 1 }),
        },
        odin_env: {
            write: (fd: number, ptr: number, len: number) => {
                let mem = new Uint8Array(importObject.env.memory.buffer, ptr, len);
                console.log('ODIN:', new TextDecoder().decode(mem));
            },
            time_now: () => {
                return Date.now() * 1e6;
            },
            exp: Math.exp,
        },
        odin_dom: {
            init_event_raw: (ptr: number) => {
                console.log('ODIN: init_event_raw', ptr);
            },
        },
    };

    let module = await WebAssembly.instantiateStreaming(resp, importObject);

    let exports = module.instance.exports as unknown as INativeExports;
    let initRes = exports.init_allocator();
    let res = exports.add_numbers(4, 5);
    let sin = exports.sinf_custom(0.25);

    console.log(module);
    console.log(initRes, res, sin);

    checkNativeFns(exports);
}

interface INativeExports {
    init_allocator: () => number;
    add_numbers: (a: number, b: number) => number;
    sinf_custom: (a: number) => number;
    cosf_custom: (a: number) => number;
}

function checkNativeFns(exports: INativeExports) {
     checkFn((f) => [Math.sin(f), exports.sinf_custom(f)], 'sinf');
     checkFn((f) => [Math.cos(f), exports.cosf_custom(f)], 'cosf');
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
        }
        if (relError > maxRelError) {
            maxRelError = relError;
            maxRelErrorVal = arr0[0];
        }
    }

    console.log(`${name}: max abs error: ${maxAbsError}, max rel error: ${maxRelError} (at ${maxRelErrorVal})`);
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

