import { Mat4f } from "@/src/utils/matrix";
import { IGLContext } from "@/src/utils/shader";

export const UboBindings = {
    ModelView: 0,
    Block: 1,
    BlockAccess: 2,
    blur: 3,
};


export enum RenderPhase {
    Opaque,
    Arrows,
    Overlay,
    Overlay2D,
}

const NumRenderPhases = 4;

export type ISharedRender = {
    gl: WebGL2RenderingContext;
    modelViewUbo: WebGLBuffer;
    modelViewBuf: Float32Array;

    activePhase: RenderPhase;
    numPhases: number;
}

export function initSharedRender(ctx: IGLContext): ISharedRender {
    let gl = ctx.gl;

    let modelViewUbo = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, modelViewUbo);
    gl.bufferData(gl.UNIFORM_BUFFER, 2 * 16 * 4, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, UboBindings.ModelView, modelViewUbo);
    let modelViewBuf = new Float32Array(2 * 16);

    return { gl, modelViewUbo, modelViewBuf, activePhase: RenderPhase.Opaque, numPhases: NumRenderPhases };
}

export function writeModelViewUbo(sharedRender: ISharedRender, modelMtx: Mat4f, viewMtx: Mat4f) {
    let { gl, modelViewUbo, modelViewBuf } = sharedRender;

    modelViewBuf.set(modelMtx, 0);
    modelViewBuf.set(viewMtx, 16);

    gl.bindBuffer(gl.UNIFORM_BUFFER, modelViewUbo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, modelViewBuf);
}

export const modelViewUboText = /*glsl*/`
    layout(std140) uniform ModelViewUbo {
        uniform mat4 u_model;
        uniform mat4 u_view;
    };`;
