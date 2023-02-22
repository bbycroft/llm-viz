
export interface IProgram {
    program: WebGLProgram;
    vertShader: WebGLShader;
    fragShader: WebGLShader;
    vertSource: string;
    fragSource: string;
}

export function createShaderProgram(gl: WebGL2RenderingContext, vert: string, frag: string): IProgram | null {
    function compileShader(type: number, source: string) {
        let shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.attachShader(program, shader);
        gl.compileShader(shader);
        let shaderInfoLog = gl.getShaderInfoLog(shader);
        if (shaderInfoLog) {
            console.log(shaderInfoLog);
            return null;
        }
        return shader;
    }

    let program = gl.createProgram()!;
    let vertShader = compileShader(gl.VERTEX_SHADER, vert);
    let fragShader = compileShader(gl.FRAGMENT_SHADER, frag);
    if (!vertShader || !fragShader) {
        return null;
    }
    gl.linkProgram(program);

    let progInfoLog = gl.getProgramInfoLog(program);
    if (progInfoLog) {
        console.log(gl.getProgramInfoLog(program));
        return null;
    }

    return {
        program,
        vertSource: vert,
        fragSource: frag,
        vertShader,
        fragShader,
    };
}
