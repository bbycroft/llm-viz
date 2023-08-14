
async function getWebGpuAdaptor() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
    }

    let adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });

    if (!adapter) {
        throw new Error("WebGPU adapter not available");
    }

    let device = await adapter.requestDevice();

    if (!device) {
        throw new Error("WebGPU device not available");
    }

    return device;
}

export async function initWebGpu() {

    let device: GPUDevice;

    try {
        device = await getWebGpuAdaptor();
    } catch (e) {
        console.log("WebGPU not supported:", e);
        return;
    }

    try {
        await verifyWebGpuDevice(device);
        console.log("✅ WebGPU supported, and a simple compute shader verified");
    } catch (e) {
        console.log("❌ WebGPU compute error:", e);
        return;
    }
}

async function verifyWebGpuDevice(device: GPUDevice) {
    let size = 512;

    let code = `
        @group(0) @binding(0)
        var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(
            @builtin(global_invocation_id) global_id: vec3u,
            @builtin(local_invocation_id) local_id: vec3u,
        ) {
            let idx = global_id.x;
            if (idx >= ${size / 4}) {
                return;
            }
            output[global_id.x] = f32(idx) * 1000. + f32(local_id.x);
        }
    `;

    let shaderModule = device.createShaderModule({ code: code });

    let output = device.createBuffer({ size: size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    let stagingBuffer = device.createBuffer({ size: size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    let bgLayout = device.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" },
        }],
    });

    let pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bgLayout],
    });

    let bindGroup = device.createBindGroup({
        layout: bgLayout,
        entries: [{
            binding: 0,
            resource: { buffer: output },
        }],
    });

    let pipeline = device.createComputePipeline({
        compute: {
            entryPoint: "main",
            module: shaderModule,
        },
        layout: pipelineLayout,
    });

    let commandEncoder = device.createCommandEncoder();

    {
        let passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(size / 64);
        passEncoder.end();
    }

    commandEncoder.copyBufferToBuffer(output, 0, stagingBuffer, 0, size);

    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ, 0, size);

    let copyArrayBuffer = stagingBuffer.getMappedRange(0, size);
    let data = copyArrayBuffer.slice(0);
    stagingBuffer.unmap();

    let dataArr = new Float32Array(data);
    if (dataArr[2] !== 2002 || dataArr[127] !== 127063) {
        throw new Error("WebGPU compute error");
    }
}

