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
    let byteStride = 0;
    for (let a of attribs) {
        byteStride += a.size * 4 * (a.nCols ?? 1);
    }
    for (let a of attribs) {
        for (let i = 0; i < (a.nCols ?? 1); i++) {
            gl.enableVertexAttribArray(locId);
            gl.vertexAttribPointer(locId, a.size, gl.FLOAT, false, byteStride, offset);
            offset += a.size * 4;
            locId++;
        }

    }
    return byteStride;
}

export interface IFloatBuffer {
    target: number; // gl.ARRAY_BUFFER, gl.UNIFORM_BUFFER, etc
    buf: WebGLBuffer;
    localBuf: Float32Array;
    strideFloats: number;
    strideBytes: number;
    capacityEls: number; // elements
    usedEls: number; // elements

    glCapacityEls: number; // elements in the gl buffer. May lag capacityEls
}

export function createFloatBuffer(gl: WebGL2RenderingContext, target: number, buf: WebGLBuffer, capacityEls: number, strideBytes: number): IFloatBuffer {
    if (target === gl.UNIFORM_BUFFER) {
        let uboBlockOffsetAlign = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT);
        strideBytes = roundUpTo(strideBytes, uboBlockOffsetAlign);
    }

    let strideFloats = strideBytes / 4;
    gl.bindBuffer(target, buf);
    gl.bufferData(target, capacityEls * strideBytes, gl.DYNAMIC_DRAW);
    let localBuf = new Float32Array(capacityEls * strideFloats);
    return { target, buf, localBuf, strideFloats, strideBytes, capacityEls, usedEls: 0, glCapacityEls: capacityEls };
}

export function ensureFloatBufferSize(bufMap: IFloatBuffer, countEls: number) {
    let newUsedEls = bufMap.usedEls + countEls;

    if (newUsedEls > bufMap.capacityEls) {
        let newCapacityEls = bufMap.capacityEls * 2;
        while (newUsedEls > newCapacityEls) {
            newCapacityEls *= 2;
        }

        let newLocalBuf = new Float32Array(newCapacityEls * bufMap.strideFloats);
        newLocalBuf.set(bufMap.localBuf);

        bufMap.capacityEls = newCapacityEls;
        bufMap.localBuf = newLocalBuf;
    }
}

export function uploadFloatBuffer(gl: WebGL2RenderingContext, bufMap: IFloatBuffer) {
    gl.bindBuffer(bufMap.target, bufMap.buf);

    if (bufMap.capacityEls > bufMap.glCapacityEls) {
        gl.bufferData(bufMap.target, bufMap.capacityEls * bufMap.strideBytes, gl.DYNAMIC_DRAW);
        bufMap.glCapacityEls = bufMap.capacityEls;
    }

    gl.bufferSubData(bufMap.target, 0, bufMap.localBuf.subarray(0, bufMap.usedEls * bufMap.strideFloats).buffer);
}

export function resetFloatBufferMap(bufMap: IFloatBuffer) {
    bufMap.usedEls = 0;
}

export interface IElementBuffer {
    buf: WebGLBuffer;
    localBuf: Uint32Array;

    capacityVerts: number;
    usedVerts: number;

    glCapacityVerts: number; // verts in the gl buffer. May lag capacityVerts
}

export function createElementBuffer(gl: WebGL2RenderingContext, buf: WebGLBuffer, capacityVerts: number): IElementBuffer {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, capacityVerts * 4, gl.DYNAMIC_DRAW);
    let localBuf = new Uint32Array(capacityVerts);
    return { buf, localBuf, capacityVerts, usedVerts: 0, glCapacityVerts: capacityVerts };
}

export function ensureElementBufferSize(bufMap: IElementBuffer, countVerts: number) {
    let newUsedVerts = bufMap.usedVerts + countVerts;

    if (newUsedVerts > bufMap.capacityVerts) {
        let newCapacityVerts = bufMap.capacityVerts * 2;
        while (newUsedVerts > newCapacityVerts) {
            newCapacityVerts *= 2;
        }

        let newLocalBuf = new Uint32Array(newCapacityVerts);
        newLocalBuf.set(bufMap.localBuf);

        bufMap.capacityVerts = newCapacityVerts;
        bufMap.localBuf = newLocalBuf;
    }
}

export function uploadElementBuffer(gl: WebGL2RenderingContext, bufMap: IElementBuffer) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufMap.buf);

    if (bufMap.capacityVerts > bufMap.glCapacityVerts) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bufMap.capacityVerts * 4, gl.DYNAMIC_DRAW);
        bufMap.glCapacityVerts = bufMap.capacityVerts;
    }

    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, bufMap.localBuf.subarray(0, bufMap.usedVerts).buffer);
}

export function resetElementBufferMap(bufMap: IElementBuffer) {
    bufMap.usedVerts = 0;
}
