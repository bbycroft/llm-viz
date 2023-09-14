import { faAngleDown, faAngleUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import React, { useLayoutEffect, useState } from 'react';
import s from './HexValueEditor.module.scss';
import { isArrowKeyWithModifiers } from '@/src/utils/keyboard';

export enum HexValueInputType {
    Hex,
    Dec,
    Bin,
}

export const HexValueEditor: React.FC<{
    className?: string,
    value: number,
    inputType: HexValueInputType,
    fixedInputType?: boolean,
    readonly?: boolean,
    hidePrefix?: boolean,
    minimalBackground?: boolean,
    padBits?: number,
    maxBits?: number,
    signed?: boolean,
    inputClassName?: string,
    update: (end: boolean, val: number, inputType: HexValueInputType) => void,
}> = ({ className, value, inputType, hidePrefix, fixedInputType, readonly, minimalBackground, padBits, update, maxBits, signed, inputClassName }) => {

    let [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
    let [text, setText] = useState(formatValue(value, inputType, padBits));
    let textPrefix = inputType === HexValueInputType.Hex ? '0x' : inputType === HexValueInputType.Bin ? '0b' : '';

    useLayoutEffect(() => {
        let cursorPos = inputEl?.selectionStart ?? 0;
        setText(formatValue(value, inputType, padBits));
        inputEl?.setSelectionRange(cursorPos, cursorPos);
    }, [value, inputType, padBits, inputEl]);

    function isValid(t: string) {
        return !isNaN(parseValue(t));
    }

    function parseValue(t: string) {
        if (inputType === HexValueInputType.Hex) {
            return parseInt(t, 16);
        } else if (inputType === HexValueInputType.Bin) {
            return parseInt(t, 2);
        } else {
            return parseInt(t, 10);
        }
    }

    function clampValue(val: number) {
        return maxBits ? clampToSignedWidth(val, maxBits, signed ?? false) : val;
    }

    function updateTruncated(end: boolean, val: number, inputType: HexValueInputType) {
        update(end, clampValue(val), inputType);
    }

    function editValue(ev: React.ChangeEvent<HTMLInputElement>, end: boolean) {
        let t = ev.target.value;
        if (t.startsWith(textPrefix)) {
            t = t.substring(textPrefix.length);
        }

        let valid = isValid(t);

        if (valid) {
            let parsed = parseValue(t);

            if (parsed !== clampValue(parsed)) {
                t = formatValue(clampValue(parsed), inputType, padBits);
            }

            updateTruncated(end, parsed, inputType);
        }

        if (end && !valid) {
            // revert to previous value
            t = formatValue(value, inputType, padBits);
        }

        setText(t);

    }

    function handleKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
        ev.stopPropagation();

        if (isArrowKeyWithModifiers(ev, 'up') && textValid) {
            updateTruncated(true, value + 1, inputType);
            ev.preventDefault();
        }

        if (isArrowKeyWithModifiers(ev, 'down') && textValid) {
            updateTruncated(true, value - 1, inputType);
            ev.preventDefault();
        }

    }

    function handleInputModeChange() {
        let newInputType = (inputType + 1) % 3;
        update(true, value, newInputType);
    }

    let textValid = isValid(text);

    return <div className={clsx(s.hexValueEditor, className)}>
        {!hidePrefix && <button className={s.prefix} onClick={handleInputModeChange}>
            {!fixedInputType && <FontAwesomeIcon icon={faAngleUp} />}
            {textPrefix || '\u00A0'}
            {!fixedInputType && <FontAwesomeIcon icon={faAngleDown} />}
        </button>}
        <input
            ref={setInputEl}
            className={clsx(s.input, !textValid && s.invalid, minimalBackground && s.minimal, readonly && s.readonly, inputClassName)} type="text" value={text}
            readOnly={readonly}
            onChange={ev => editValue(ev, false)}
            onBlur={ev => editValue(ev, true)}
            onKeyDown={handleKeyDown}
            onKeyUp={ev => ev.stopPropagation()}
        />
    </div>;
}

function formatValue(v: number, inputType: HexValueInputType, padBits: number | undefined) {
    if (inputType === HexValueInputType.Hex) {
        return v.toString(16).padStart(padBits ? Math.ceil(padBits / 4) : 1, '0');
    } else if (inputType === HexValueInputType.Bin) {
        return v.toString(2).padStart(padBits || 1, '0');
    } else {
        return v.toString(10);
    }
}

export function clampToSignedWidth(val: number, width: number, signed: boolean) {
    let maxVal = Math.pow(2, width);
    if (signed) {
        maxVal = Math.floor(maxVal / 2);
    }
    if (val > maxVal - 1) {
        val = maxVal - 1;
    }
    if (signed && val < -maxVal) {
        val = -maxVal;
    }
    if (!signed && val < 0) {
        val = 0;
    }

    return val;
}
