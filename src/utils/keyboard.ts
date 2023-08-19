import { createContext, useContext, useEffect } from "react";
import { useFunctionRef } from "./data";

export enum KeyboardOrder {
    MainPage = 0,
    Modal = 1,
}

export interface IKeyHandler {
    order: KeyboardOrder;
    handler: (ev: KeyboardEvent) => void;
}

export class KeyboardManager {
    private handlers: IKeyHandler[] = [];

    registerHandler(order: KeyboardOrder, handler: (ev: KeyboardEvent) => void): () => void {
        let newHandler: IKeyHandler = { order, handler };
        this.handlers.push(newHandler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== newHandler);
        };
    }

    handleKeyDown = (ev: KeyboardEvent) => {
        let handlersSorted = this.handlers.sort((a, b) => a.order - b.order);

        let propagationStopped = false;
        let oldStopPropagation = ev.stopPropagation;

        ev.stopPropagation = () => {
            propagationStopped = true;
            oldStopPropagation.call(ev);
        };

        for (let handler of handlersSorted) {
            handler.handler(ev);
            if (propagationStopped) {
                break;
            }
        }
    }
}

export const KeyboardManagerContext = createContext<KeyboardManager>(new KeyboardManager());

export function useGlobalKeyboard(order: KeyboardOrder, handler: (ev: KeyboardEvent) => void) {
    let manager = useContext(KeyboardManagerContext);
    let handlerRef = useFunctionRef(handler);

    useEffect(() => {
        let h = (ev: KeyboardEvent) => handlerRef.current(ev);
        let unregister = manager.registerHandler(order, h);
        return () => unregister();
    }, [order, handlerRef, manager]);
}

export function useCreateGlobalKeyboardDocumentListener() {
    let manager = useContext(KeyboardManagerContext);

    useEffect(() => {
        document.addEventListener("keydown", manager.handleKeyDown);
        return () => document.removeEventListener("keydown", manager.handleKeyDown);
    }, [manager]);
}

export enum Modifiers {
    None,
    Alt,
    CtrlOrCmd,
    Shift,
}

export function isKeyWithModifiers(ev: KeyboardEvent, key: string, modifiers: Modifiers = Modifiers.None) {
    if (key.toLowerCase() !== ev.key.toLowerCase()) {
        return false;
    }
    let modifiersActual = Modifiers.None;
    modifiersActual |= ev.altKey ? Modifiers.Alt : 0;
    modifiersActual |= ev.ctrlKey || ev.metaKey ? Modifiers.CtrlOrCmd : 0;
    modifiersActual |= ev.shiftKey ? Modifiers.Shift : 0;

    return modifiersActual === modifiers;
}
