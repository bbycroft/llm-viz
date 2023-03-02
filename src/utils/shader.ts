
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

export function createShaderProgram<T extends string>(manager: IShaderManager | IGLContext, name: string, vert: string, frag: string, uniformNames?: T[]): IProgram<T> | null {
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
