import { useCallback, useEffect, useRef, useState } from "react";
import { useFunctionRef } from "./hooks";

export interface IDragStart<T> {
    clientX: number;
    clientY: number;
    data: T;
    button: number;
    buttons: number;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
}

export function useGlobalDrag<T>(
    handleMove: (ev: MouseEvent, ds: IDragStart<T>, end: boolean) => void,
    handleClick?: (ev: MouseEvent, ds: IDragStart<T>) => void,
    handleMoveEnd?: (ev: MouseEvent, ds: IDragStart<T>, end: boolean) => void,
): [IDragStart<T> | null, (ev: IMouseEvent, data: T) => void] {
    let [dragStart, setDragStart] = useState<IDragStart<T> | null>(null);
    let isDragging = useRef(false);
    let handleMoveRef = useFunctionRef(handleMove);
    let handleClickRef = useFunctionRef(handleClick);
    let handleMoveEndRef = useFunctionRef(handleMoveEnd);

    useEffect(() => {
        if (!dragStart) {
            isDragging.current = false;
            return;
        }

        function dist(ev1: { clientX: number, clientY: number }, ev2: { clientX: number, clientY: number }) {
            let dx = ev2.clientX - ev1.clientX;
            let dy = ev2.clientY - ev1.clientY;
            return dx * dx + dy * dy;
        }

        function handleMouseMove(ev: MouseEvent) {
            if (!isDragging.current && (dist(ev, dragStart!) > 10.0 || !handleClickRef.current)) {
                isDragging.current = true;
            }
            if (isDragging.current) {
                handleMoveRef.current(ev, dragStart!, false);
            }
        }

        function handleMouseUp(ev: MouseEvent) {
            if (isDragging.current || !handleClickRef.current) {
                handleMoveRef.current(ev, dragStart!, true);
                handleMoveEndRef.current?.(ev, dragStart!, true);
            } else {
                handleClickRef.current?.(ev, dragStart!);
            }
            setDragStart(null);
        }

        document.addEventListener('mousemove', handleMouseMove, { capture: true });
        document.addEventListener('mouseup', handleMouseUp, { capture: true });
        return () => {
            document.removeEventListener('mousemove', handleMouseMove, { capture: true });
            document.removeEventListener('mouseup', handleMouseUp, { capture: true });
        };
    }, [dragStart, handleMoveRef, handleClickRef, handleMoveEndRef]);

    let setDragStartTarget = useCallback((ev: IMouseEvent, data: T) => {
        setDragStart({
            clientX: ev.clientX,
            clientY: ev.clientY,
            data,
            button: ev.button,
            buttons: ev.buttons,
            shiftKey: ev.shiftKey,
            altKey: ev.altKey,
            ctrlKey: ev.ctrlKey,
            metaKey: ev.metaKey,
        });
    }, [setDragStart]);

    return [dragStart, setDragStartTarget];
}

export interface IMouseLocation {
    clientX: number;
    clientY: number;
}

export interface IPointerEvent {
    clientX: number;
    clientY: number;
}

export interface IMouseEvent extends IPointerEvent {
    type: string;
    readonly button: number;
    readonly buttons: number;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    stopPropagation(): void;
    preventDefault(): void;
}

export interface IWheelEvent extends IMouseEvent {
    deltaMode: number;
    deltaY: number;
}

export interface IBaseEvent {
    type: string;
    stopPropagation(): void;
    preventDefault(): void;
}

export function getWheelDelta(ev: IWheelEvent): number {
    let mode = ev.deltaMode;
    let scale = 1.0;
    if (mode === 0) { // pixel
        scale = 125;
    } else if (mode === 1) { // line
        scale = 3;
    } else if (mode === 2) { // page
        scale = 0.1;
    }

    return ev.deltaY / scale;
}

export interface TouchSimple {
    clientX: number;
    clientY: number;
}

export interface TouchEventStart<T> {
    data: T;
    touches: TouchSimple[];
}

export interface TouchEventStart1PointDrag<T> extends TouchEventStart<T> {
    isDragging: boolean;
}

export interface ITouchEventOptions {
    alwaysSendDragEvent?: boolean;
    sendDragEnd?: boolean;
}

export function useTouchEvents<T>(
    el: GlobalEventHandlers | null,
    data: T,
    options: ITouchEventOptions,
    handle1PointDrag?: (ev: TouchEvent, start: TouchEventStart1PointDrag<T>, end: boolean) => void,
    handle2PointDrag?: (ev: TouchEvent, start: TouchEventStart<T>) => void,
    handle1PointClick?: (ev: TouchEvent, start: TouchEventStart<T>) => void,
) {
    let alwaysSendDragEvent = options.alwaysSendDragEvent ?? false;
    let sendDragEnd = options.sendDragEnd ?? false;
    let initialData = useRef<T>(data);
    let initialTouches = useRef<TouchSimple[]>();
    let lastTouch = useRef<{ time: number, velocity: number, touch: TouchSimple } | null>(null);
    let isDrag = useRef<boolean>(false);
    let latestData = useRef<T>(data);
    let lastPressTime = useRef<number>(0);
    latestData.current = data;
    let handle1PointDragRef = useFunctionRef(handle1PointDrag);
    let handle2PointDragRef = useFunctionRef(handle2PointDrag);
    let handle1PointClickRef = useFunctionRef(handle1PointClick);

    useEffect(() => {
        if (!el) {
            return;
        }

        function sendEvent(ev: TouchEvent) {
            let initial = {data: initialData.current, touches: initialTouches.current!};
            if (!ev.touches || !initial.touches || ev.touches.length !== initial.touches.length) {
                return;
            }

            if (!isDrag.current) {
                if (ev.touches.length > 1 || (ev.touches.length === 1 && touchPixelDist(ev.touches[0], initial.touches[0]) >= 10)) {
                    isDrag.current = true;
                }
            }

            if (ev.touches.length === 1 && handle1PointDragRef.current && (alwaysSendDragEvent || isDrag.current)) {
                handle1PointDragRef.current(ev, { ...initial, isDragging: isDrag.current }, false);
            }
            if (ev.touches.length === 2 && handle2PointDragRef.current) {
                handle2PointDragRef.current(ev, initial);
            }

            if (ev.touches.length === 1) {
                lastTouch.current = {
                    time: 0,
                    velocity: 0,
                    touch: copyTouchList(ev.touches)[0],
                };

            } else {
                lastTouch.current = null;
            }
        }

        function captureInitialAndSend(ev: TouchEvent) {
            let prevTouches = initialTouches.current;
            let prevData = initialData.current;
            initialData.current = latestData.current;
            initialTouches.current = copyTouchList(ev.touches as any);

            if (!prevTouches || !prevTouches.length) {
                lastPressTime.current = performance.now();
            }

            let lastTouchTouch = lastTouch.current?.touch;

            sendEvent(ev);

            if (ev.touches.length === 0) {
                if (sendDragEnd && handle1PointDragRef.current && lastTouchTouch && (isDrag.current || alwaysSendDragEvent)) {
                    ev = cloneTouchEvent(ev, { touches: [lastTouchTouch] as any });
                    handle1PointDragRef.current(ev, { data: prevData, touches: prevTouches!, isDragging: isDrag.current }, true);
                }
                if (!isDrag.current && handle1PointClickRef.current && prevTouches?.length === 1) {
                    handle1PointClickRef.current(ev, {data: prevData, touches: prevTouches!});
                }
                isDrag.current = false;
                lastTouch.current = null;
            }
        }

        el.addEventListener('touchstart', captureInitialAndSend, { passive: false });
        el.addEventListener('touchend', captureInitialAndSend, { passive: false });
        el.addEventListener('touchcancel', captureInitialAndSend, { passive: false });
        el.addEventListener('touchmove', sendEvent, { passive: false });
        return () => {
            el.removeEventListener('touchstart', captureInitialAndSend);
            el.removeEventListener('touchend', captureInitialAndSend);
            el.removeEventListener('touchcancel', captureInitialAndSend);
            el.removeEventListener('touchmove', sendEvent);
        };
    }, [el, handle1PointDragRef, handle2PointDragRef, handle1PointClickRef, alwaysSendDragEvent, sendDragEnd]);
}

export function copyTouchList(tl: TouchList) {
    let res: TouchSimple[] = [];
    for (let i = 0; i < tl.length; i++) {
        let touch = tl[i];
        res.push({ clientX: touch.clientX, clientY: touch.clientY });
    }
    return res;
}

function touchPixelDist(a: TouchSimple, b: TouchSimple) {
    let dx = b.clientX - a.clientX;
    let dy = b.clientY - a.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}


export function useCombinedMouseTouchDrag<T>(
    el: GlobalEventHandlers | null,
    captureDragStart: (ev: IMouseEvent) => T,
    handleDrag: (ev: IMouseEvent, start: IDragStart<T>, end: boolean) => void,
    handleClick?: (ev: IMouseEvent, start: IDragStart<T>) => void,
): [dragStart: IDragStart<T> | null, setDragStart: (ev: IMouseEvent) => void] {
    let [touchDragStart, setTouchDragStart] = useState<IDragStart<T> | null>(null);

    let captureDragStartRef = useFunctionRef(captureDragStart);
    function handleMouseDrag(ev: MouseEvent, ds: IDragStart<T>, end: boolean) {
        handleDrag(ev, ds, end);
    }

    function handleMouseClick(ev: MouseEvent, ds: IDragStart<T>) {
        handleClick?.(ev, ds);
    }

    useTouchEvents(el, 0, { alwaysSendDragEvent: true, sendDragEnd: true }, function handle1PointDrag(ev, ds, end) {
        let mouseEvent = mouseEventFromEventAndSingleTouch(ev, ev.touches[0]);
        let dragStart = touchDragStart;
        if (!dragStart) {
            let dragStartData = captureDragStart(mouseEvent);
            dragStart = { ...extractClientPosFromTouch(ds.touches[0]), data: dragStartData };
            setTouchDragStart(dragStart);
        }

        if (!ds.isDragging) {
            return;
        }

        handleDrag(mouseEvent, dragStart, end);

        if (end) {
            setTouchDragStart(null);
        }

    }, undefined, function handle1PointClick(ev, ds) {
        if (touchDragStart) {
            handleClick?.(mouseEventFromEventAndSingleTouch(ev, ev.touches[0]), touchDragStart);
        }
        setTouchDragStart(null);
    });

    let [dragStart, setDragStartLocal] = useGlobalDrag<T>(handleMouseDrag, handleClick ? handleMouseClick : undefined);

    let setDragStart = useCallback((ev: IMouseEvent) => {
        let data = captureDragStartRef.current(ev);
        setDragStartLocal(ev, data);
    }, [setDragStartLocal, captureDragStartRef]);

    return [dragStart ?? touchDragStart, setDragStart];
}

function cloneTouchEvent<T extends {}>(ev: TouchEvent, extra: T): TouchEvent & T & { button: -1, buttons: 0 } {
    return {
        ...ev,
        preventDefault: () => ev.preventDefault(),
        stopPropagation: () => ev.stopPropagation(),
        ...extra,
        button: -1,
        buttons: 0,
    };
}

function mouseEventFromEventAndSingleTouch(ev: TouchEvent, touch: TouchSimple): TouchEvent & IMouseEvent {
    return cloneTouchEvent(ev, extractClientPosFromTouch(touch));
}

function extractClientPosFromTouch(touch: TouchSimple) {
    // creates a mouse event compatible with mouse drags
    return {
        clientX: touch.clientX,
        clientY: touch.clientY,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        button: -1,
        buttons: 0,
     };
}
