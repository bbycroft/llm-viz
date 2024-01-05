'use client';

import { HTMLProps, memo, useEffect, useState } from "react";
import { KeyboardManager, KeyboardManagerContext } from "./keyboard";

export const KeyboardLocalListener: React.FC<HTMLProps<HTMLDivElement>> = memo(function KeyboardLocalListener({ children, ...props }) {
    let [keyManager] = useState(() => new KeyboardManager(/* local focus */true));
    let [el, setEl] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (el) {
            el.addEventListener('keydown', keyManager.handleKey);
            el.addEventListener('keyup', keyManager.handleKey);
            el.addEventListener('focusin', keyManager.handleFocusInOut);
            el.addEventListener('focusout', keyManager.handleFocusInOut);
            return () => {
                el!.removeEventListener('focusout', keyManager.handleFocusInOut);
                el!.removeEventListener('focusin', keyManager.handleFocusInOut);
                el!.removeEventListener('keydown', keyManager.handleKey);
                el!.removeEventListener('keyup', keyManager.handleKey);
            };
        }
    }, [el, keyManager]);

    return <div ref={setEl} {...props}>
        <KeyboardManagerContext.Provider value={keyManager}>
            {children}
        </KeyboardManagerContext.Provider>
    </div>;
});
