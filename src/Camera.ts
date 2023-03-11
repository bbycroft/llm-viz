import { Mat4f } from "./utils/matrix";
import { Vec3 } from "./utils/vector";

export interface ICamera {
    center: Vec3;
    angle: Vec3; // x = degrees about z axis, y = degrees above the x-y plane; z = zoom

    centerDesired?: Vec3;
    // separated into rotation & zoom since they behave differently, and we want to control them separately
    // probably should just split out the zoom into a separate variable
    angleRotDesired?: Vec3;
    angleZDesired?: number;

    transition: {
        angleRotVel?: Vec3;
        centerVel?: Vec3;
        angleZVel?: number;
    }
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

export function cameraMoveToDesired(camera: ICamera, dt: number) {

    // This is making me nauseous. Gonna do jump-to instead of smooth transition for now.

    // We'll use the velocity to check if we've applied the desired value, so we know when to
    // modify the main camera

    if (camera.centerDesired && (!camera.transition.centerVel || camera.transition.centerVel.dist(camera.centerDesired) < 0.01)) {
        camera.center = camera.centerDesired;
        camera.transition.centerVel = camera.centerDesired;
        camera.centerDesired = undefined;
    } else if (!camera.centerDesired) {
        camera.transition.centerVel = undefined;
    }

    if (camera.angleZDesired && (!camera.transition.angleZVel || Math.abs(camera.transition.angleZVel - camera.angleZDesired) < 0.01)) {
        camera.angle.z = camera.angleZDesired;
        camera.transition.angleZVel = camera.angleZDesired;
        camera.angleZDesired = undefined;
    } else if (!camera.angleZDesired) {
        camera.transition.angleZVel = undefined;
    }

    if (camera.angleRotDesired && (!camera.transition.angleRotVel || camera.transition.angleRotVel.dist(camera.angleRotDesired) < 0.01)) {
        camera.angle.x = camera.angleRotDesired.x;
        camera.angle.y = camera.angleRotDesired.y;
        camera.transition.angleRotVel = camera.angleRotDesired;
        camera.angleRotDesired = undefined;
    } else if (!camera.angleRotDesired) {
        camera.transition.angleRotVel = undefined;
    }

    /*
    if (camera.centerDesired) {
        let { pos, vel } = applySpringStep(
            camera.center,
            camera.centerDesired,
            camera.transition.centerVel,
            dt, { tension: 1, mass: 1 / 40, extra: 1 });

        camera.transition.centerVel = vel;
        camera.center = pos;

        camera.centerDesired = undefined;
    } else {
        camera.transition.centerVel = undefined;
    }

    if (camera.angleZDesired) {
        let { pos, vel } = applySpringStep(
            new Vec3(camera.angle.z),
            new Vec3(camera.angleZDesired),
            camera.transition.angleZVel ? new Vec3(camera.transition.angleZVel) : undefined,
            dt, { tension: 1, mass: 1 / 40 });

        camera.angle.z = pos.x;
        camera.transition.angleZVel = vel.x;
        camera.angleZDesired = undefined;
    } else {
        camera.transition.angleZVel = undefined;
    }

    if (camera.angleRotDesired) {
        // need to account for the discontinuity at 0/360
        // how? probably just need to add/subtract 360 when the difference is > 180
        let desiredX = camera.angleRotDesired.x;
        while (desiredX - camera.angle.x > 180) {
            desiredX -= 360;
        }
        while (desiredX - camera.angle.x < -180) {
            desiredX += 360;
        }

        let { pos, vel } = applySpringStep(
            new Vec3(camera.angle.x, camera.angle.y),
            new Vec3(desiredX, camera.angleRotDesired.y),
            camera.transition.angleRotVel,
            dt, { tension: 1, mass: 1 / 40 });

        camera.transition.angleRotVel = vel;
        camera.angle.x = pos.x;
        camera.angle.y = pos.y;

        camera.angleRotDesired = undefined;
    }
    */
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
