import { createContext, useContext, useEffect } from "react";
import { useFunctionRef } from "./hooks";

export enum KeyboardOrder {
    MainPage = 0,
    Element = 1,
    Modal = 2,
}

export interface IKeyHandler {
    order: KeyboardOrder;
    handler: (ev: KeyboardEvent) => void;
    receiveKeyUp: boolean;
}

export interface IKeyHandlerOptions {
    isActive?: boolean;
    receiveKeyUp?: boolean;
}

export class KeyboardManager {
    private handlers: IKeyHandler[] = [];

    registerHandler(order: KeyboardOrder, handler: (ev: KeyboardEvent) => void, opts?: IKeyHandlerOptions): () => void {
        let newHandler: IKeyHandler = { order, handler, receiveKeyUp: opts?.receiveKeyUp ?? false };
        this.handlers.push(newHandler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== newHandler);
        };
    }

    handleKey = (ev: KeyboardEvent) => {
        let handlersSorted = this.handlers.sort((a, b) => a.order - b.order);

        let propagationStopped = false;
        let oldStopPropagation = ev.stopPropagation;

        ev.stopPropagation = () => {
            propagationStopped = true;
            oldStopPropagation.call(ev);
        };

        for (let handler of handlersSorted) {
            if (ev.type === "keyup" && !handler.receiveKeyUp) {
                continue;
            }
            handler.handler(ev);
            if (propagationStopped) {
                break;
            }
        }
    }
}

export const KeyboardManagerContext = createContext<KeyboardManager>(new KeyboardManager());

export function useGlobalKeyboard(order: KeyboardOrder, handler: (ev: KeyboardEvent) => void, opts?: IKeyHandlerOptions) {
    let manager = useContext(KeyboardManagerContext);
    let handlerRef = useFunctionRef(handler);
    let receiveKeyUp = opts?.receiveKeyUp ?? false;
    let isActive = opts?.isActive ?? true;

    useEffect(() => {
        if (isActive) {
            let h = (ev: KeyboardEvent) => handlerRef.current(ev);
            let unregister = manager.registerHandler(order, h, { receiveKeyUp });
            return () => unregister();
        }
    }, [order, handlerRef, manager, receiveKeyUp, isActive]);
}

export function useCreateGlobalKeyboardDocumentListener() {
    let manager = useContext(KeyboardManagerContext);

    useEffect(() => {
        window.addEventListener("keydown", manager.handleKey);
        window.addEventListener("keyup", manager.handleKey);
        return () => {
            window.removeEventListener("keydown", manager.handleKey);
            window.removeEventListener("keyup", manager.handleKey);
        };
    }, [manager]);
}

export enum Modifiers {
    None = 0,
    Alt = 1,
    CtrlOrCmd = 2,
    Shift = 4,
}

export interface IKeyboardEvent {
    type: string;
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

export interface IModifiersEvent {
    type: string;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

export function isArrowKeyWithModifiers(ev: IKeyboardEvent, direction: "up" | "down" | "left" | "right", modifiers: Modifiers = Modifiers.None) {
    return (ev.key.toLowerCase() === direction || ev.key.toLowerCase() === `arrow${direction}`) && hasModifiers(ev, modifiers);
}

export function isKeyWithModifiers(ev: IKeyboardEvent, key: string, modifiers: Modifiers = Modifiers.None) {
    return key.toLowerCase() === ev.key.toLowerCase() && hasModifiers(ev, modifiers);
}

export function hasModifiers(ev: IModifiersEvent, modifiers: Modifiers) {
    let modifiersActual = Modifiers.None;
    modifiersActual |= ev.altKey ? Modifiers.Alt : 0;
    modifiersActual |= ev.ctrlKey || ev.metaKey ? Modifiers.CtrlOrCmd : 0;
    modifiersActual |= ev.shiftKey ? Modifiers.Shift : 0;

    return modifiersActual === modifiers;
}
