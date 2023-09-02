import { faAngleDown, faAngleUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import s from './HexValueEditor.module.scss';

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
    hidePrefix?: boolean,
    minimalBackground?: boolean,
    padBits?: number,
    update: (end: boolean, val: number, inputType: HexValueInputType) => void,
}> = ({ className, value, inputType, hidePrefix, fixedInputType, minimalBackground, padBits, update }) => {

    let [text, setText] = React.useState(formatValue(value, inputType, padBits));
    let textPrefix = inputType === HexValueInputType.Hex ? '0x' : inputType === HexValueInputType.Bin ? '0b' : '';

    useLayoutEffect(() => {
        setText(formatValue(value, inputType, padBits));
    }, [value, inputType, padBits]);

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

    function editValue(ev: React.ChangeEvent<HTMLInputElement>, end: boolean) {
        let t = ev.target.value;
        if (t.startsWith(textPrefix)) {
            t = t.substring(textPrefix.length);
        }

        let valid = isValid(t);

        if (valid) {
            update(end, parseValue(t), inputType);
        }

        if (end && !valid) {
            // revert to previous value
            t = formatValue(value, inputType, padBits);
        }

        setText(t);

    }

    function handleInputModeChange() {
        let newInputType = (inputType + 1) % 3;
        update(true, value, newInputType);
    }

    let textValid = isValid(text);

    // &nbsp; but in js text: '\u00A0'
    return <div className={clsx(s.hexValueEditor, className)}>
        {!hidePrefix && <button className={s.prefix} onClick={handleInputModeChange}>
            {!fixedInputType && <FontAwesomeIcon icon={faAngleUp} />}
            {textPrefix || '\u00A0'}
            {!fixedInputType && <FontAwesomeIcon icon={faAngleDown} />}
        </button>}
        <input
            className={clsx(s.input, !textValid && s.invalid, minimalBackground && s.minimal)} type="text" value={text}
            onChange={ev => editValue(ev, false)}
            onBlur={ev => editValue(ev, true)}
            onKeyDown={ev => { ev.stopPropagation() }}
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
