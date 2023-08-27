import { useEffect, useState } from "react";
import { StateSetter } from "./data";

export function iterLocalStorageEntries(cb: (key: string, value: string | null) => void) {
    let ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (!ls) {
        return;
    }

    for (let i = 0; i < ls.length; i++) {
        let key = ls.key(i);
        if (key) {
            let value = ls.getItem(key);
            cb(key, value);
        }
    }
}

export function readFromLocalStorage<T>(key: string): T | undefined {
    let ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    let value = ls?.getItem(key);
    if (value) {
        try {
            return JSON.parse(value);
        } catch (e) {
            console.error('Failed to parse local storage value:', key, value);
        }
    }
    return undefined;
}

export function writeToLocalStorage<T>(key: string, value: T) {
    let ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (value) {
        ls?.setItem(key, JSON.stringify(value));
    } else {
        ls?.removeItem(key);
    }
}

export function useLocalStorageState<T>(key: string, hydrateFromLS: (a: Partial<T> | undefined) => T): [T, StateSetter<T>] {
    let [value, setValue] = useState(() => hydrateFromLS(readFromLocalStorage(key)));

    useEffect(() => {
        writeToLocalStorage(key, value);
    }, [key, value]);

    return [value, setValue];
}
