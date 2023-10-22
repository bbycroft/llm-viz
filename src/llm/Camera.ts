import { IModelLayout } from "./GptModelLayout";
import { IProgramState } from "./Program";
import { Mat4f } from "@/src/utils/matrix";
import { BoundingBox3d, Vec3 } from "@/src/utils/vector";
import { IRenderView } from "./render/modelRender";
import { clamp } from "../utils/data";

export interface ICamera {
    camPos: Vec3;
    camPosModel: Vec3;
    lookAtMtx: Mat4f;
    viewMtx: Mat4f;
    modelMtx: Mat4f;
    center: Vec3;
    angle: Vec3; // x = degrees about z axis, y = degrees above the x-y plane; z = zoom

    centerDesired?: Vec3;
    // separated into rotation & zoom since they behave differently, and we want to control them separately
    // probably should just split out the zoom into a separate variable
    angleDesired?: Vec3;
    angleZDesired?: number;

    desiredCamera?: ICameraPos;
    desiredCameraTransition?: {
        t: number;
        initialPos: ICameraPos;
        targetPos: ICameraPos;
    },

    transition: {
        centerT?: number;
        angleT?: number;
        angleZT?: number;

        centerInit?: Vec3;
        angleInit?: Vec3;
        angleZInit?: number;
    }
}

export interface ICameraPos {
    center: Vec3;
    angle: Vec3;
}


export function cameraToMatrixView(camera: ICamera) {
    while (camera.angle.x < 0) camera.angle.x += 360;
    while (camera.angle.x > 360) camera.angle.x -= 360;

    let camZoom = camera.angle.z;
    let angleX = camera.angle.x * Math.PI / 180;
    let angleY = camera.angle.y * Math.PI / 180;

    let dist = 200 * camZoom;
    let camZ = dist * Math.sin(angleY);
    let camX = dist * Math.cos(angleY) * Math.cos(angleX);
    let camY = dist * Math.cos(angleY) * Math.sin(angleX);

    let camLookat = camera.center;
    let camPos = new Vec3(camX, camY, camZ).add(camLookat);

    return {
        lookAt: Mat4f.fromLookAt(camPos, camLookat, new Vec3(0, 0, 1)),
        camPos,
    };
}

export function genModelViewMatrices(state: IProgramState, layout: IModelLayout, modelOffset: Vec3 = Vec3.zero) {
    let { camera } = state;

    let bb = new BoundingBox3d();
    for (let c of layout.cubes) {
        let tl = new Vec3(c.x, c.y, c.z).add(modelOffset);
        let br = new Vec3(c.x + c.dx, c.y + c.dy, c.z + c.dz).add(modelOffset);
        bb.addInPlace(tl);
        bb.addInPlace(br);
    }
    let localDist = bb.size().len();

    let { lookAt, camPos } = cameraToMatrixView(camera);
    let dist = 200 * camera.angle.z;

    // let persp = Mat4f.fromPersp(40, state.render.size.x / state.render.size.y, dist / 100, localDist + Math.max(dist * 2, 100000));
    let persp = Mat4f.fromPersp(40, state.render.size.x / state.render.size.y, 100, 10000000);
    let viewMtx = persp.mul(lookAt);
    let modelMtx = new Mat4f();
    modelMtx[0] = 1.0;
    modelMtx[5] = 0.0;
    modelMtx[6] = -1.0;
    modelMtx[9] = -1.0;
    modelMtx[10] = 0.0;

    state.camera.modelMtx = modelMtx;
    state.camera.viewMtx = viewMtx;
    state.camera.camPos = camPos;
    state.camera.camPosModel = modelMtx.invert().mulVec3Affine(camPos);
    state.camera.lookAtMtx = lookAt;
}

export function camScaleToScreen(state: IProgramState, modelPt: Vec3) {
    let camDist = state.camera.camPosModel.dist(modelPt);
    return camDist / state.render.size.y * 5.0;
}

export function cameraMoveToDesired(camera: ICamera, dt: number) {

    // This is making me nauseous. Gonna do jump-to instead of smooth transition for now.

    // We'll use the velocity to check if we've applied the desired value, so we know when to
    // modify the main camera
    let duration = 1000 * 1;

    if (camera.centerDesired && camera.transition.centerT === undefined) {
        camera.transition.centerInit = camera.center;
        camera.transition.centerT = 0.0;
    }
    if (camera.transition.centerT !== undefined) {
        camera.transition.centerT += dt / duration;
        if (camera.transition.centerT > 1.0) {
            camera.transition.centerT = undefined;
            camera.transition.centerInit = undefined;
            camera.centerDesired = undefined;
        } else if (camera.transition.centerInit && camera.centerDesired) {
            camera.center = camera.transition.centerInit!.lerp(camera.centerDesired!, camera.transition.centerT);
        }
    }

    if (camera.angleDesired && camera.transition.angleT === undefined) {
        camera.transition.angleInit = camera.angle;
        camera.transition.angleT = 0.0;
    }
    if (camera.transition.angleT !== undefined) {
        camera.transition.angleT += dt / duration;
        if (camera.transition.angleT > 1.0) {
            camera.transition.angleT = undefined;
            camera.transition.angleInit = undefined;
            camera.angleDesired = undefined;
        } else if (camera.transition.angleInit && camera.angleDesired) {
            camera.angle = camera.transition.angleInit!.lerp(camera.angleDesired!, camera.transition.angleT);
        }
    }
}

export function updateCamera(state: IProgramState, view: IRenderView) {

    let transition = state.camera.desiredCameraTransition;

    if (transition) {
        if (transition.t < 1) {
            transition.t = clamp(transition.t + view.dt / 1000 * 1.5, 0, 1);
            let src = transition.initialPos;
            let dest = transition.targetPos;

            state.camera.angle = src.angle.lerp(dest.angle, transition.t);
            state.camera.center = src.center.lerp(dest.center, transition.t);
            view.markDirty();
        } else {
            state.camera.desiredCameraTransition = undefined;
        }
    }

    // take a frame before we start moving the camera
    if (state.camera.desiredCamera) {
        state.camera.desiredCameraTransition = {
            t: 0,
            initialPos: {
                center: state.camera.center,
                angle: state.camera.angle,
            },
            targetPos: state.camera.desiredCamera,
        }
        state.camera.desiredCamera = undefined;
        view.markDirty();
    }
}


export interface ISpringConfig {
    tension: number;
    mass: number;
    friction?: number;
    extra?: number;
}

export function applySpringStep(pos: Vec3, target: Vec3, vel: Vec3 | null | undefined, dt: number, config: ISpringConfig) {
    // default to critically damped
    let friction = config.friction ?? 2 * Math.sqrt(config.mass * config.tension);
    let dtS = dt / 1000;
    vel = vel ?? new Vec3();
    let dist = pos.sub(target);
    let springExtra = dist.lenSq() === 0.0 ? new Vec3() : dist.normalize().mul(config.extra ?? 0);
    let springF = (dist.add(springExtra)).mul(-config.tension);
    let dampF = vel.mul(-friction);
    let accel = springF.add(dampF).mul(1.0 / config.mass);

    vel = vel.add(accel.mul(dtS));
    pos = pos.add(vel.mul(dtS));
    return { pos, vel };
}
