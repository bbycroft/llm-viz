import React, { useState, useCallback } from "react";
import { IProgramState } from "./Program";
import { useProgramState } from "./Sidebar";
import { clamp } from "@/src/utils/data";
import { useGlobalDrag, useTouchEvents } from "@/src/utils/pointer";
import { Vec3 } from "@/src/utils/vector";
import s from './LayerView.module.scss';

export const CanvasEventSurface: React.FC<{
    children?: React.ReactNode;
}> = ({ children }) => {
    let [eventSurfaceEl, setEventSurfaceEl] = useState<HTMLDivElement | null>(null);
    let progState = useProgramState();

    let updateRenderState = useCallback((fn: (ps: IProgramState) => void) => {
        fn(progState);
        progState.markDirty();
    }, [progState]);

    function pan(initial: { camAngle: Vec3, camTarget: Vec3 }, dx: number, dy: number) {
        let camAngle = initial.camAngle;
        let target = initial.camTarget.clone();
        target.z = target.z + dy * 0.1 * camAngle.z; // @TODO: clamp to the bounding box of the model
        let sideMul = Math.sin(camAngle.x * Math.PI / 180) > 0 ? 1 : -1;
        target.x = target.x + sideMul * dx * 0.1 * camAngle.z;

        updateRenderState(ps => {
            ps.camera.center = target;
        });
    }

    function rotate(initial: { camAngle: Vec3, camTarget: Vec3 }, dx: number, dy: number) {
        let camAngle = initial.camAngle.clone();
        let degPerPixel = 0.5;
        camAngle.x = camAngle.x - dx * degPerPixel;
        camAngle.y = clamp(camAngle.y + dy * degPerPixel, -87, 87);
        updateRenderState(ps => {
            ps.camera.angle = camAngle;
        });
    }

    function zoom(initial: { camAngle: Vec3, camTarget: Vec3 }, dy: number) {
        let camAngle = initial.camAngle.clone();
        camAngle.z = clamp(camAngle.z / dy, 0.1, 100000);
        updateRenderState(ps => {
            ps.camera.angle = camAngle;
        });
    }

    let [dragStart, setDragStart] = useGlobalDrag<{ camAngle: Vec3, camTarget: Vec3 }>(function handleMove(ev, ds) {
        let dx = ev.clientX - ds.clientX;
        let dy = ev.clientY - ds.clientY;

        if (!ds.shiftKey && !(ds.button === 1 || ds.button === 2)) {
            pan(ds.data, dx, dy);
        } else {
            rotate(ds.data, dx, dy);
        }

        ev.preventDefault();
    });

    useTouchEvents(eventSurfaceEl, { camAngle: progState.camera.angle, camTarget: progState.camera.center }, { alwaysSendDragEvent: true },
        function handle1PointDrag(ev, ds) {
            let dsTouch0 = ds.touches[0];
            let evTouch0 = ev.touches[0];
            let dx = evTouch0.clientX - dsTouch0.clientX;
            let dy = evTouch0.clientY - dsTouch0.clientY;
            pan(ds.data, dx, dy);
            ev.preventDefault();
    },  function handle2PointDrag(ev, ds) {
            let dsTouch0 = ds.touches[0];
            let dsTouch1 = ds.touches[1];
            let evTouch0 = ev.touches[0];
            let evTouch1 = ev.touches[1];
            let dsMidX = (dsTouch0.clientX + dsTouch1.clientX) / 2;
            let dsMidY = (dsTouch0.clientY + dsTouch1.clientY) / 2;
            let evMidX = (evTouch0.clientX + evTouch1.clientX) / 2;
            let evMidY = (evTouch0.clientY + evTouch1.clientY) / 2;
            let dx = evMidX - dsMidX;
            let dy = evMidY - dsMidY;
            let dsDist = Math.sqrt((dsTouch0.clientX - dsTouch1.clientX) ** 2 + (dsTouch0.clientY - dsTouch1.clientY) ** 2);
            let evDist = Math.sqrt((evTouch0.clientX - evTouch1.clientX) ** 2 + (evTouch0.clientY - evTouch1.clientY) ** 2);
            rotate(ds.data, dx, dy);
            // pan(ds.data, dx, dy);
            zoom(ds.data, evDist / dsDist);
            ev.preventDefault();
    });

    function handleMouseDown(ev: React.MouseEvent) {
        if (progState) {
            setDragStart(ev, { camAngle: progState.camera.angle, camTarget: progState.camera.center });
        }
    }

    function handleMouseMove(ev: React.MouseEvent) {
        if (progState) {
            let canvasBcr = progState.render.canvasEl.getBoundingClientRect();
            let mousePos = new Vec3(ev.clientX - canvasBcr.left, ev.clientY - canvasBcr.top, 0);
            updateRenderState(ps => {
                ps.mouse.mousePos = mousePos;
            });
        }
    }

    function handleWheel(ev: React.WheelEvent) {
        if (progState) {
            let camAngle = progState.camera.angle;
            let zoom = clamp(camAngle.z * Math.pow(1.0013, ev.deltaY), 0.01, 100000);
            updateRenderState(rs => {
                rs.camera.angle = new Vec3(camAngle.x, camAngle.y, zoom);
            });
        }
        ev.stopPropagation();
    }

    if (!progState.render) {
        return null;
    }

    return <div
        ref={setEventSurfaceEl}
        className={s.canvasEventSurface}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onContextMenu={ev => ev.preventDefault()}
        style={{ cursor: dragStart ? 'grabbing' : progState.display.hoverTarget ? 'crosshair' : 'grab' }}
    >
        {children}
    </div>;
}
