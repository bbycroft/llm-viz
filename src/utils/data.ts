import { useCallback, useEffect, useRef, useState } from "react";

export function makeArray<T = number>(length: number, val?: T): T[] {
    return new Array(length).fill(val ?? 0);
}

export function oneHotArray(length: number, index: number, val: number, defaultVal: number = 0.0): number[] {
    let arr = new Array(length).fill(defaultVal);
    arr[index] = val;
    return arr;
}

export function assignImm<T>(target: T, source: Partial<T>): T {
    let keys = Object.keys(source);
    let changed = false;
    target = target ?? {} as any;
    for (let k of keys) {
        let src = (source as any)[k];
        let dst = (target as any)[k];
        if (src instanceof Date ? (+src !== +dst) : dst !== src) {
            changed = true;
        }
    }
    return changed ? Object.assign({}, target, source) : target;
}

export function logChangesFn(name: string) {
    let prevValue: any = null;
    return (currValue: any) => {
        let changes = getChanges(prevValue, currValue);
        prevValue = currValue;
        changes && console.log(`${name} changed to`, changes);
        return !!changes;
    };

    function getChanges(a: any, b: any) {
        a = a || {};
        b = b || {};
        let keys = new Set<string>();
        for (let k of [...Object.keys(a), ...Object.keys(b)]) {
            a[k] !== b[k] && keys.add(k);
        }
        if (keys.size === 0) {
            return null;
        }
        let changed: any = {};
        for (let k of [...keys]) {
            changed[k] = b[k];
        }
        return changed;
    }
}

export function useLogChanges(name: string, values: any) {
    let [changesFn] = useState(() => logChangesFn(name));
    return changesFn(values);
}

export function isNil(a: any): a is null | undefined {
    return a === null || a === undefined;
}

export function useFunctionRef<T extends ((...args: any[]) => any) | undefined>(fn: T): React.MutableRefObject<T> {
    let ref = useRef<T>(fn);
    useEffect(() => {
        ref.current = fn;
    }, [fn]);
    return ref;
}

export type StateSetter<T> = (action: React.SetStateAction<T>) => void;

export function applySetter<T>(setState: React.SetStateAction<T>, existing: T) {
    return setState instanceof Function ? setState(existing) : setState;
}

export function clamp(num: number, min: number, max: number) {
    if (num < min) {
        return min;
    } else if (num > max) {
        return max;
    }
    return num;
}

export interface IDragStart<T> {
    clientX: number;
    clientY: number;
    data: T;
    button: number;
    buttons: number;
}

export function useGlobalDrag<T>(
    handleMove: (ev: MouseEvent, ds: IDragStart<T>, end: boolean) => void,
    handleClick?: (ev: MouseEvent, ds: IDragStart<T>) => void,
    handleMoveEnd?: (ev: MouseEvent, ds: IDragStart<T>, end: boolean) => void,
): [IDragStart<T> | null, (ev: React.MouseEvent, data: T) => void] {
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

    let setDragStartTarget = useCallback((ev: React.MouseEvent, data: T) => {
        setDragStart({
            clientX: ev.clientX,
            clientY: ev.clientY,
            data,
            button: ev.button,
            buttons: ev.buttons,
        });
    }, [setDragStart]);

    return [dragStart, setDragStartTarget];
}

export interface IMouseLocation {
    clientX: number;
    clientY: number;
}

export function base64ToArrayBuffer(base64: string) {
    let binaryString = window.atob(base64);
    let len = binaryString.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
