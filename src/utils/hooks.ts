import { useEffect, useReducer, useRef, useState } from "react";

export function useFunctionRef<T extends ((...args: any[]) => any) | undefined>(fn: T): React.MutableRefObject<T> {
    let ref = useRef<T>(fn);
    useEffect(() => {
        ref.current = fn;
    }, [fn]);
    return ref;
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

export interface IIntervalOptions {
    // run the callback immediately on mount
    runImmediately?: boolean;
}

export function useInterval(active: boolean, delay: number, cb: () => void, opts?: IIntervalOptions) {
    let cbRef = useFunctionRef(cb);
    let runImmediately = opts?.runImmediately ?? false;
    useEffect(() => {
        if (active) {
            let handle = setInterval(cbRef.current, delay);
            if (runImmediately) {
                cbRef.current();
            }
            return () => clearInterval(handle);
        }
    }, [active, delay, cbRef, runImmediately]);
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

export function useSubscriptions(subscription: Subscriptions | null) {
    let [, refresh] = useReducer(a => a + 1, 0);
    useEffect(() => subscription?.subscribe(refresh), [subscription]);
}
