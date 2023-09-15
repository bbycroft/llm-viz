import { IRenderState } from "./modelRender";

export interface ISyncObject {
    sync: WebGLSync;
    isReady: boolean;
    startTime: number;
    elapsedMs: number;
}

/* To use a sync object, store it in the tree with a specific name. In subsequent frames, check if
   the sync object is ready. */
export function createSyncObject(render: IRenderState): ISyncObject {
    let gl = render.gl;
    let sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    let obj = { sync, isReady: false, startTime: performance.now(), elapsedMs: 0 };
    render.syncObjects.push(obj);
    return obj;
}
