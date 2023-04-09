import { IProgram } from "./shader";

export function logArr(name: string, arr: Float32Array, n = 15) {
    console.log(name, [...arr.subarray(0, n)].map(a => parseFloat(a.toFixed(3))));
}

export function arraysEqual(a: Float32Array, b: Float32Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > 1e-4) return false;
    }
    return true;
}

export function setProgramTexUniforms(gl: WebGL2RenderingContext, program: IProgram, names: string[]) {
    gl.useProgram(program.program);
    for (let i = 0; i < names.length; i++) {
        let loc = gl.getUniformLocation(program.program, names[i]);
        if (!loc) {
            console.log('uniform not found:', names[i], '(may just be unused)');
            continue;
        }
        gl.uniform1i(loc, i);
    }
}

export interface IBufferTex {
    width: number;
    height: number;
    channels: number;
    texture: WebGLTexture;
    localBuffer?: Float32Array;
}

// we transform from 1 set of textures to another set within a shader
// each buffer is a standard layer of the ML model
// note that the dest buffers must all be the same size, but the src buffers can be different sizes
export interface IRenderPhase {
    destBuffers: IBufferTex[];
    srcBuffers: IBufferTex[];
    fbo: WebGLFramebuffer;
    program: IProgram;
    uniformsSet: boolean;
    uniformNames?: string[];
}

export function createRenderPhase(gl: WebGL2RenderingContext, program: IProgram, dest: IBufferTex[], src: IBufferTex[], names?: string[]): IRenderPhase {
    if (names) {
        if (names.length !== src.length) {
            throw new Error(`Number of texture names (${names.length}) does not match number of src textures (${src.length})`);
        }
    }

    let fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    for (let i = 0; i < dest.length; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, dest[i].texture, 0);
    }

    gl.drawBuffers(dest.map((_, i) => gl.COLOR_ATTACHMENT0 + i));

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.log("createRenderPhase: framebuffer not complete: " + status);
    }

    return {
        destBuffers: dest,
        srcBuffers: src,
        fbo,
        program,
        uniformNames: names,
        uniformsSet: false,
    };
}

export let RenderPhaseStats = {
    bindAndDrawCount: 0,
};

export function runRenderPhase(gl: WebGL2RenderingContext, phase: IRenderPhase) {
    gl.useProgram(phase.program.program);

    if (!phase.uniformsSet) {
        phase.uniformNames && setProgramTexUniforms(gl, phase.program, phase.uniformNames!);
        phase.uniformsSet = true;
    }

    for (let i = 0; i < phase.srcBuffers.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, phase.srcBuffers[i].texture);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    // let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    // if (status !== gl.FRAMEBUFFER_COMPLETE) {
    //     console.log("runRenderPhase: framebuffer not complete: " + status);
    // }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    RenderPhaseStats.bindAndDrawCount += 1;
}

export function createBufferTex(gl: WebGL2RenderingContext, width: number, height: number, channels: number): IBufferTex {
    let texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let [format, iformat] = channelsToFormat(gl, channels);
    gl.texImage2D(gl.TEXTURE_2D, 0, iformat, width, height, 0, format, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
        width,
        height,
        texture,
        channels,
    };
}

export function writeToBufferTex(gl: WebGL2RenderingContext, buffer: IBufferTex, data: Float32Array) {
    if (data.length !== buffer.width * buffer.height * buffer.channels) {
        throw new Error('Data length does not match buffer size');
    }
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
    let [format] = channelsToFormat(gl, buffer.channels);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, buffer.width, buffer.height, format, gl.FLOAT, data);
}

export function readFromRenderPhase(gl: WebGL2RenderingContext, phase: IRenderPhase, index: number, out: Float32Array) {
    let buffer = phase.destBuffers[index];
    if (out.length !== buffer.width * buffer.height * buffer.channels) {
        throw new Error(`Data length does not match output size: expected ${buffer.width * buffer.height * buffer.channels}, got supplied buffer is ${out.length}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, phase.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
    let [format] = channelsToFormat(gl, buffer.channels);

    let altFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    let altType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);

    if (altType !== gl.FLOAT) {
        throw new Error(`Implementation does not support reading back float data. Got type ${GlType[altType] ?? altType}`);
    }

    if (altFormat !== format) {
        // Sometimes the implementation doesn't support reading back float data for the particular number of channels we're after
        // In this case, they typically support RGBA32F for channels < 4, so handle that case, and manually down-convert
        if (altFormat !== gl.RGBA) {
            throw new Error(`Implementation does not support reading back float data for ${buffer.channels} channels, or 4 channels. Got format ${GlFormat[altFormat] ?? altFormat}.`);
        }
        let temp = new Float32Array(buffer.width * buffer.height * 4);
        gl.readPixels(0, 0, buffer.width, buffer.height, altFormat, gl.FLOAT, temp);
        for (let c = 0; c < buffer.channels; c++) {
            for (let i = 0; i < out.length; i++) {
                out[i] = temp[i * 4 + c];
            }
        }
    } else {
        gl.readPixels(0, 0, buffer.width, buffer.height, format, gl.FLOAT, out);
    }
}

export function channelsToFormat(gl: WebGL2RenderingContext, channels: number): [GlFormat, GlInternalFormat] {
    switch (channels) {
        case 1: return [gl.RED, gl.R32F];
        case 2: return [gl.RG, gl.RG32F];
        case 3: return [gl.RGB, gl.RGB32F];
        case 4: return [gl.RGBA, gl.RGBA32F];
        default: throw new Error(`Invalid number of channels: ${channels}. Must be 1, 2, 3, or 4.`);
    }
}

export enum GlFormat {
    RED = 0x1903,
    RG = 0x8227,
    RGB = 0x1907,
    RGBA = 0x1908,
}

export enum GlInternalFormat {
    R32F = 0x822E,
    RG32F = 0x8230,
    RGB32F = 0x8815,
    RGBA32F = 0x8814,
}

export enum GlType {
    UNSIGNED_BYTE = 0x1401,
    FLOAT = 0x1406,
}