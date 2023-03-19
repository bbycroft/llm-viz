import { useEffect, useReducer, useRef, useState } from "react";

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

export function isNotNil<T>(a: T | null | undefined): a is T {
    return a !== null && a !== undefined;
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

export function useRequestAnimationFrame(active: boolean, cb: (dt: number) => void) {
    let cbRef = useFunctionRef(cb);
    useEffect(() => {
        let stale = false;
        let handle: number;
        let prevTime: number | undefined;

        function loop(time: number) {
            let dt = (prevTime === undefined ? 16 : (time - prevTime)) / 1000;
            prevTime = time;
            cbRef.current(dt);
            if (!stale) {
                handle = requestAnimationFrame(loop);
            }
        }

        if (active) {
            handle = requestAnimationFrame(loop);
            return () => {
                stale = true;
                cancelAnimationFrame(handle);
            };
        }
    }, [active, cbRef]);
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

export class Subscriptions {
    subs = new Set<() => void>();
    subscribe = (fn: () => void): (() => void) => {
        this.subs.add(fn);
        return () => this.subs.delete(fn);
    }
    notify = () => {
        for (let sub of this.subs) {
            sub();
        }
    }
}

export function useSubscriptions(subscription: Subscriptions) {
    let [, refresh] = useReducer(a => a + 1, 0);
    useEffect(() => subscription.subscribe(refresh), [subscription]);
}
