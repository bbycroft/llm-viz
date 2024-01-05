import { useEffect, useState } from "react";
import { StateSetter } from "./data";
import { useFunctionRef } from "./hooks";

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
    let [value, setValue] = useState(() => hydrateFromLS(undefined));

    useEffect(() => {
        setValue(hydrateFromLS(readFromLocalStorage(key)));
    }, [key, hydrateFromLS]);

    useEffect(() => {
        writeToLocalStorage(key, value);
    }, [key, value]);

    return [value, setValue];
}

export function writeToLocalStorageWithNotifyOnChange<T>(key: string, value: T) {
    let ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    let existingStr = ls?.getItem(key);
    let newStr = JSON.stringify(value);

    if (existingStr !== newStr) {
        ls?.setItem(key, newStr);
        let bcast = new BroadcastChannel('localstorage');
        bcast.postMessage({ key });
        bcast.close();
    }
}

export function useBindLocalStorageState<T, V>(key: string, value: V, lsUpdated: (a: Partial<T>) => void, updateLsFromValue: (a: Partial<T>, v: V) => Partial<T>) {
    let lsUpdatedRef = useFunctionRef(lsUpdated);
    let updateLsFromValueRef = useFunctionRef(updateLsFromValue);

    useEffect(() => {
        let bcast = new BroadcastChannel('localstorage');

        function readAndNotify() {
            let lsValue = readFromLocalStorage<Partial<T>>(key);
            lsUpdatedRef.current(lsValue ?? {});
        }

        function handleMessage(ev: MessageEvent) {
            if (ev.data instanceof Object && ev.data.key === key) {
                readAndNotify();
            }
        }

        bcast.addEventListener('message', handleMessage);
        readAndNotify();

        return () => {
            bcast.removeEventListener('message', handleMessage);
            bcast.close();
        };
    }, [key, lsUpdatedRef]);

    useEffect(() => {
        let existing = readFromLocalStorage<Partial<T>>(key);
        let newValue = updateLsFromValueRef.current(existing ?? {}, value);
        writeToLocalStorageWithNotifyOnChange(key, newValue);
    }, [key, value, updateLsFromValueRef]);
}
