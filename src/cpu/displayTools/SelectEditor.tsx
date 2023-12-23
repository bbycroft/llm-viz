import { Popup, PopupPos, Portal } from '@/src/utils/Portal';
import { KeyboardOrder, useGlobalKeyboard } from '@/src/utils/keyboard';
import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

interface IOption {
    value: string;
    label: React.ReactNode;
}

export const SelectEditor: React.FC<{
    className?: string,
    value: string,
    options: IOption[],
    renderOption?: (opt: IOption) => React.ReactNode,
    allowEmpty?: boolean,
    allowCustom?: boolean,
    placeholder?: string,
    update: (end: boolean, value: string) => void,
}> = ({ className, value, update, placeholder, options, renderOption }) => {
    let [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
    let [popupVisible, setPopupVisible] = useState(false);
    let [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
    let [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

    function handleInputKeyDown(ev: React.KeyboardEvent) {
        if (popupVisible) {
            if (ev.key === 'Escape') {
                setPopupVisible(false);
                ev.preventDefault();
                ev.stopPropagation();
            }
        }

        ev.stopPropagation(); // stop all events going higher
    };

    renderOption ??= (opt => opt.label);

    function onChange(ev: React.ChangeEvent<HTMLInputElement>) {
        update(false, ev.target.value);
    }

    function onBlur(ev: React.FocusEvent<HTMLInputElement>) {
        // setPopupVisible(false);
        update(true, ev.target.value);
    }

    function onEntryClick(opt: IOption) {
        update(true, opt.value);
        setPopupVisible(false);
    }

    useEffect(() => {
        function handleMouseDown(ev: MouseEvent) {
            let inPopup = popupEl && popupEl.contains(ev.target as Node);
            let inInput = inputEl && inputEl.contains(ev.target as Node);

            if (!inPopup && !inInput) {
                setPopupVisible(false);
                ev.stopPropagation();
                ev.preventDefault();
            }
        }

        if (popupEl) {
            document.addEventListener('mousedown', handleMouseDown, { capture: true });
            return () => document.removeEventListener('mousedown', handleMouseDown, { capture: true });
        }
    }, [popupEl, inputEl]);

    return <div ref={setTargetEl} className={clsx("flex flex-row", className)}>
        <input
            type="text"
            ref={setInputEl}
            autoCorrect='off'
            autoComplete='off'
            autoCapitalize='off'
            spellCheck='false'
            className={clsx("hover:outline-none focus:outline-none px-1 rounded h-8 text-lg w-full bg-inherit")}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onMouseDown={() => setPopupVisible(true)}
            placeholder={placeholder}
            onKeyDown={handleInputKeyDown}
            onKeyUp={ev => ev.stopPropagation()}
        />
        {popupVisible && <Popup
            setPopupEl={setPopupEl}
            targetEl={targetEl}
            placement={PopupPos.BottomLeft}
            // closeBackdrop={true}
            onClose={() => setPopupVisible(false)}
            matchTargetWidth
            className='bg-white border rounded shadow-md flex flex-col pointer-events-auto'
        >
            <div className='x-optionsList flex flex-col'>
                {options.map((opt, i) => {
                    return <div
                            key={i}
                            className='x-option px-2 py-1 hover:bg-blue-300 rounded cursor-pointer'
                            onClick={() => onEntryClick(opt)}
                        >
                        {renderOption!(opt)}
                    </div>;
                })}
            </div>
        </Popup>}
    </div>;
}
