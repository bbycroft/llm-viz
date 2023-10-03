
/*
Maybe a bit premature!

Mainly just want to support rendering either Cmd or Ctrl for Mac/Windows.

Cmd symbol: ⌘ (U+2318) \u2318
*/

import { hasFlag } from "../utils/data";
import { Modifiers } from "../utils/keyboard";

export enum KeymapAction {

}

export class KeymapManager {
    constructor() {

    }


}

export function modifiersToString(key: string, modifiers: Modifiers = Modifiers.None) {

    // deprecated interface, but sufficient for determining if Mac for modifiers
    // But can't use it here, since this code gets executed on the server as well (for hydration)
    let isMac = false; // navigator.platform.indexOf('Mac') >= 0;

    let str = '';
    if (hasFlag(modifiers, Modifiers.CtrlOrCmd)) {
        str += isMac ? '\u2318' : 'Ctrl';
    }
    if (hasFlag(modifiers, Modifiers.Alt)) {
        str += ' Alt';
    }
    if (hasFlag(modifiers, Modifiers.Shift)) {
        str += ' Shift';
    }
    return (str + ' ' + key).trim();
}

export function useKeymap() {

}
