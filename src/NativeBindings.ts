
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
        },
        odin_dom: {
            init_event_raw: (ptr: number) => {
                console.log('ODIN: init_event_raw', ptr);
            },
        }
    };

    let module = await WebAssembly.instantiateStreaming(resp, importObject);

    let initRes = (module.instance.exports as any).init_allocator();

    let res = (module.instance.exports as any).add_numbers(4, 5);

    console.log(module);
    console.log(initRes, res);

}
