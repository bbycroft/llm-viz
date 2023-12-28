import { ISharedRender } from "../llm/render/sharedRender";
import { roundUpTo } from "./math";

export interface IGLContext {
    gl: WebGL2RenderingContext;
    shaderManager: IShaderManager;
    ext: {
        colorBufferFloat: EXT_color_buffer_float | null;
        disjointTimerQuery: EXT_disjoint_timer_query_webgl2 | null;
    },
}

export interface EXT_disjoint_timer_query_webgl2 {
    TIME_ELAPSED_EXT: number;
}

export interface IProgram<T extends string = any> {
    name: string;
    program: WebGLProgram;
    vertShader: WebGLShader;
    fragShader: WebGLShader;
    vertSource: string;
    fragSource: string;
    ready: boolean;
    locs: Record<T, WebGLUniformLocation>;
    uboBindings: Record<string, number>;
}

export interface IShaderManager {
    gl: WebGL2RenderingContext;
    vertShaders: Map<string, WebGLShader>;
    fragShaders: Map<string, WebGLShader>;
    programs: IProgram[];
    unlinkedPrograms: IProgram[];
}

export function createShaderManager(gl: WebGL2RenderingContext) {
    return {
        gl,
        vertShaders: new Map(),
        fragShaders: new Map(),
        programs: [],
        unlinkedPrograms: [],
    };
}

export interface IShaderExtras {
    uboBindings: Record<string, number>;
}

export function createShaderProgram<T extends string>(manager: IShaderManager | IGLContext, name: string, vert: string, frag: string, uniformNames?: T[], extra?: IShaderExtras): IProgram<T> | null {
    if ('shaderManager' in manager) {
        manager = manager.shaderManager;
    }

    let gl = manager.gl;

    let program = gl.createProgram()!;

    function compileAndAttachShader(type: number, source: string, typeStr: string, map: Map<string, WebGLShader>) {
        let shader = map.get(source);
        if (!shader) {
            shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            map.set(source, shader);
        }
        gl.attachShader(program, shader);
        return shader;
    }

    let vertShader = compileAndAttachShader(gl.VERTEX_SHADER, vert, 'vert', manager.vertShaders);
    let fragShader = compileAndAttachShader(gl.FRAGMENT_SHADER, frag, 'frag', manager.fragShaders);

    let locs = {} as Record<T, WebGLUniformLocation>;

    if (uniformNames) {
        for (let name of uniformNames) {
            locs[name] = -1;
        }
    }

    let prog: IProgram<T> = {
        name,
        program,
        vertSource: vert,
        fragSource: frag,
        vertShader,
        fragShader,
        locs,
        uboBindings: extra?.uboBindings ?? {},
        ready: false,
    };

    manager.unlinkedPrograms.push(prog);

    return prog;
}


export function ensureShadersReady(manager: IShaderManager) {
    let gl = manager.gl;

    for (let prog of manager.unlinkedPrograms) {
        gl.linkProgram(prog.program);
    }

    for (let prog of manager.unlinkedPrograms) {
        let program = prog.program;

        if (gl.getProgramParameter(program, gl.LINK_STATUS)) {

            for (let name of Object.keys(prog.locs)) {
                let loc = gl.getUniformLocation(program, name);
                if (!loc) {
                    console.log(`uniform of ${prog.name} not found: ${name} (may just be unused)`);
                }
                prog.locs[name] = loc!;
            }
            prog.ready = true;

            for (let uboName of Object.keys(prog.uboBindings)) {
                let uboIndex = gl.getUniformBlockIndex(program, uboName);
                if (uboIndex < 0) {
                    console.log(`ubo of ${prog.name} not found: ${uboName} (may just be unused)`);
                }
                gl.uniformBlockBinding(program, uboIndex, prog.uboBindings[uboName]);
            }

        } else {

            let progInfoLog = gl.getProgramInfoLog(program);
            if (progInfoLog) {
                let prefix = `---- '${prog.name}' program info log ----`;
                console.log(`${prefix}\n` + gl.getProgramInfoLog(program)?.replace('\x00', '').trimEnd());
            }

            logShader(prog.vertShader, prog.name, 'vert');
            logShader(prog.fragShader, prog.name, 'frag');
        }
    }

    manager.programs.push(...manager.unlinkedPrograms);
    manager.unlinkedPrograms = [];

    function logShader(shader: WebGLShader, name: string, typeStr: string) {
        let infoLog = gl.getShaderInfoLog(shader);
        if (infoLog) {
            let prefix = `---- ${name} ${typeStr} shader info log ----`;
            console.log(`${prefix}\n` + infoLog.replace('\x00', '').trimEnd());
        }
    }
}

export interface IBindOpts {
    divisor?: number;
    locOffset?: number;
    bufOffset?: number;
}

export interface IFloatAttrib {
    name: string;
    size: number;
    nCols?: number; // for matrices
}

export function bindFloatAttribs(gl: WebGL2RenderingContext, buf: WebGLBuffer, opts: IBindOpts, attribs: IFloatAttrib[]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let locId = opts.locOffset || 0;
    let offset = opts.bufOffset || 0;
    let divisor = opts.divisor || 0;
    let byteStride = 0;
    for (let a of attribs) {
        byteStride += a.size * 4 * (a.nCols ?? 1);
    }
    for (let a of attribs) {
        for (let i = 0; i < (a.nCols ?? 1); i++) {
            gl.enableVertexAttribArray(locId);
            gl.vertexAttribPointer(locId, a.size, gl.FLOAT, false, byteStride, offset);
            gl.vertexAttribDivisor(locId, divisor);
            offset += a.size * 4;
            locId++;
        }
    }
    return byteStride;
}

/*
We store multiple buffers client-side, each one can grow independently, and each represents the
data drawn in a specific phase.  Then we can upload the data nicely packed.
We still have to do multiple draw calls, since each phase is made up of different renderers, but
just need a single WebGLBuffer with its vertexAttribs etc.
*/
export interface IFloatLocalBuffer {
    buf: Float32Array;
    strideFloats: number;
    strideBytes: number;
    capacityEls: number; // elements
    usedEls: number; // elements

    glOffsetEls: number;
}

export interface IFloatBuffer {
    target: number; // gl.ARRAY_BUFFER, gl.UNIFORM_BUFFER, etc
    localBufs: IFloatLocalBuffer[];
    buf: WebGLBuffer;
    strideFloats: number;
    strideBytes: number;

    glCapacityEls: number; // elements in the gl buffer. May lag capacityEls
    sharedRender?: ISharedRender;
}

export function createFloatBuffer(gl: WebGL2RenderingContext, target: number, buf: WebGLBuffer, capacityEls: number, strideBytes: number, sharedRender: ISharedRender | null): IFloatBuffer {
    let numPhases = sharedRender?.numPhases || 1;
    if (target === gl.UNIFORM_BUFFER) {
        let uboBlockOffsetAlign = Math.max(gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) ?? 0, 64);
        strideBytes = roundUpTo(strideBytes, uboBlockOffsetAlign);
    }

    let strideFloats = strideBytes / 4;
    gl.bindBuffer(target, buf);
    gl.bufferData(target, capacityEls * strideBytes, gl.DYNAMIC_DRAW);

    let localBufs: IFloatLocalBuffer[] = [];
    for (let i = 0; i < numPhases; i++) {
        localBufs.push({
            buf: new Float32Array(capacityEls * strideFloats),
            strideFloats,
            strideBytes,
            capacityEls,
            usedEls: 0,
            glOffsetEls: 0,
        });
    }

    return { target, buf, strideFloats, strideBytes, glCapacityEls: capacityEls, localBufs };
}

export function ensureFloatBufferSize(localBuf: IFloatLocalBuffer, countEls: number) {
    let newUsedEls = localBuf.usedEls + countEls;

    if (newUsedEls > localBuf.capacityEls) {
        while (newUsedEls > localBuf.capacityEls) {
            localBuf.capacityEls *= 2;
        }

        let newLocalBuf = new Float32Array(localBuf.capacityEls * localBuf.strideFloats);
        newLocalBuf.set(localBuf.buf);
        localBuf.buf = newLocalBuf;
    }
}

export function uploadFloatBuffer(gl: WebGL2RenderingContext, bufMap: IFloatBuffer) {
    gl.bindBuffer(bufMap.target, bufMap.buf);

    let totalUsed = 0;
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        let localBuf = bufMap.localBufs[i];
        totalUsed += localBuf.usedEls;
    }

    if (totalUsed > bufMap.glCapacityEls) {
        while (totalUsed > bufMap.glCapacityEls) {
            bufMap.glCapacityEls *= 2;
        }
        gl.bufferData(bufMap.target, bufMap.glCapacityEls * bufMap.strideBytes, gl.DYNAMIC_DRAW);
    }

    let offsetEls = 0;
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        let localBuf = bufMap.localBufs[i];
        localBuf.glOffsetEls = offsetEls;
        if (localBuf.usedEls > 0) {
            gl.bufferSubData(bufMap.target, offsetEls * bufMap.strideBytes, localBuf.buf.subarray(0, localBuf.usedEls * localBuf.strideFloats));
        }
        offsetEls += localBuf.usedEls;
    }
}

export function resetFloatBufferMap(bufMap: IFloatBuffer) {
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        bufMap.localBufs[i].usedEls = 0;
    }
}

export interface IELementLocalBuffer {
    buf: Uint32Array;
    capacityVerts: number;
    usedVerts: number

    glOffsetBytes: number;
}

export interface IElementBuffer {
    buf: WebGLBuffer;
    localBufs: IELementLocalBuffer[];
    glCapacityVerts: number; // verts in the gl buffer. May lag capacityVerts
}

export function createElementBuffer(gl: WebGL2RenderingContext, buf: WebGLBuffer, capacityVerts: number, sharedRender: ISharedRender | null): IElementBuffer {
    let numPhases = sharedRender?.numPhases || 1;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, capacityVerts * 4, gl.DYNAMIC_DRAW);

    let localBufs: IELementLocalBuffer[] = [];
    for (let i = 0; i < numPhases; i++) {
        localBufs.push({
            buf: new Uint32Array(capacityVerts),
            capacityVerts,
            usedVerts: 0,
            glOffsetBytes: 0,
        });
    }

    return { buf, glCapacityVerts: capacityVerts, localBufs };
}

export function ensureElementBufferSize(localBuf: IELementLocalBuffer, countVerts: number) {
    let newUsedVerts = localBuf.usedVerts + countVerts;

    if (newUsedVerts > localBuf.capacityVerts) {
        let newCapacityVerts = localBuf.capacityVerts * 2;
        while (newUsedVerts > newCapacityVerts) {
            newCapacityVerts *= 2;
        }

        let newLocalBuf = new Uint32Array(newCapacityVerts);
        newLocalBuf.set(localBuf.buf);

        localBuf.capacityVerts = newCapacityVerts;
        localBuf.buf = newLocalBuf;
    }
}

export function uploadElementBuffer(gl: WebGL2RenderingContext, bufMap: IElementBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufMap.buf);

    let totalUsed = 0;
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        let localBuf = bufMap.localBufs[i];
        totalUsed += localBuf.usedVerts;
    }

    if (totalUsed > bufMap.glCapacityVerts) {
        while (totalUsed > bufMap.glCapacityVerts) {
            bufMap.glCapacityVerts *= 2;
        }
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bufMap.glCapacityVerts * 4, gl.DYNAMIC_DRAW);
    }

    let offsetIndex = 0;
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        let localBuf = bufMap.localBufs[i];
        localBuf.glOffsetBytes = offsetIndex * 4;
        let srcBuf = localBuf.buf.subarray(0, localBuf.usedVerts);
        if (localBuf.usedVerts > 0) {
            gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offsetIndex * 4, srcBuf);
        }
        offsetIndex += localBuf.usedVerts;
    }
}

export function resetElementBufferMap(bufMap: IElementBuffer) {
    for (let i = 0; i < bufMap.localBufs.length; i++) {
        bufMap.localBufs[i].usedVerts = 0;
    }
}
