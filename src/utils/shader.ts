
export interface IProgram<T extends string = ''> {
    program: WebGLProgram;
    vertShader: WebGLShader;
    fragShader: WebGLShader;
    vertSource: string;
    fragSource: string;
    locs: Record<T, WebGLUniformLocation>;
}

export function createShaderProgram<T extends string>(gl: WebGL2RenderingContext, name: string, vert: string, frag: string, uniformNames?: T[]): IProgram<T> | null {
    function compileShader(type: number, source: string, typeStr: string) {
        let shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.attachShader(program, shader);
        gl.compileShader(shader);
        let shaderInfoLog = gl.getShaderInfoLog(shader);
        if (shaderInfoLog) {
            let prefix = `---- '${name}' ${typeStr} shader info log ----`;
            console.log(`${prefix}\n` + shaderInfoLog.replace('\x00', '').trimEnd());
            return null;
        }
        return shader;
    }

    let program = gl.createProgram()!;
    let vertShader = compileShader(gl.VERTEX_SHADER, vert, 'vert');
    let fragShader = compileShader(gl.FRAGMENT_SHADER, frag, 'frag');
    if (!vertShader || !fragShader) {
        return null;
    }
    gl.linkProgram(program);

    let progInfoLog = gl.getProgramInfoLog(program);
    if (progInfoLog) {
        let prefix = `---- '${name}' program info log ----`;
        console.log(`${prefix}\n` + gl.getProgramInfoLog(program)?.replace('\x00', '').trimEnd());
        return null;
    }

    let locs = {} as Record<T, WebGLUniformLocation>;

    if (uniformNames) {
        for (let name of uniformNames) {
            let loc = gl.getUniformLocation(program, name);
            if (!loc) {
                console.log('uniform not found:', name, '(may just be unused)');
            }
            locs[name] = loc!;
        }
    }

    return {
        program,
        vertSource: vert,
        fragSource: frag,
        vertShader,
        fragShader,
        locs,
    };
}
