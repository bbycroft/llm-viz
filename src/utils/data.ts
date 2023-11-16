import { Vec3 } from "./vector";

export function makeArray<T = number>(length: number, val?: T): T[] {
    return new Array(length).fill(val ?? 0);
}

export function makeArrayRange(length: number, min: number, max: number): number[] {
    return new Array(length).fill(0).map((_, i) => min + i * (max - min) / (length - 1));
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
        if ((src === dst) ||
            (src instanceof Date && dst instanceof Date && +src === +dst) ||
            (src instanceof Vec3 && dst instanceof Vec3 && src.distSq(dst) === 0.0)
        ) {
            continue;
        }
        changed = true;
    }
    return changed ? Object.assign({}, target, source) : target;
}

export function assignImmFull<T>(target: T | null, source: T | null): T | null {
    return source && target ? assignImm(target, source) : source;
}

export function isNil(a: any): a is null | undefined {
    return a === null || a === undefined;
}

export function isNotNil<T>(a: T | null | undefined): a is T {
    return a !== null && a !== undefined;
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

export function base64ToArrayBuffer(base64: string) {
    let binaryString = window.atob(base64);
    let len = binaryString.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export function getOrAddToMap<K, V>(map: Map<K, V>, key: K, valueFn: () => V): V {
    let existing = map.get(key);
    if (existing === undefined) {
        let value = valueFn();
        map.set(key, value);
        return value;
    }
    return existing;
}

export function hasFlag(flags: number, flag: number) {
    return (flags & flag) === flag;
}
