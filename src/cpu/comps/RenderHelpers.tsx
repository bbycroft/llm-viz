import React, { CSSProperties, memo, useState } from "react";
import { IComp, IEditContext, IEditorState } from "../CpuModel";
import { ensureSigned32Bit, ensureUnsigned32Bit } from "./RiscvInsDecode";
import s from './CompStyles.module.scss';
import clsx from "clsx";
import { editCompConfig, useEditorContext, useViewLayout } from "../Editor";
import { StateSetter, assignImm } from "@/src/utils/data";
import { Popup, PopupPos } from "@/src/utils/Portal";
import { faCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function regValToStr(val: number) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = ensureSigned32Bit(val);
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(8, "0");
    let pcValStr = valS32.toString().padStart(2, "0");
    return pcValStr + '  ' + pcHexStr;
}

export const registerOpts = {
    innerPadX: 0.4,
}

const scalePerCell = 15;

/* This div have the size of 15 x comp-rect-size, i.e. if a comp is of size (10, 20), this div will have size (150, 300) */
export const CompRectBase: React.FC<{
    comp: IComp,
    hideHover?: boolean,
    className?: string,
    children?: React.ReactNode,
}> = memo(function CompRectBase({ comp, className, children, hideHover }) {
    let { setEditorState } = useEditorContext();

    function handleHover(isHover: boolean) {
        if (!hideHover) {
            return;
        }
        setEditorState(a => {
            return assignImm(a, {
                maskHover: isHover ? comp.id : (a.maskHover === comp.id ? null : a.maskHover),
            });
        });
    }

    return <div
        className={clsx(s.baseComp, className)} style={createCanvasDivStyle(comp)}
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
        onMouseDown={ev => ev.stopPropagation()}
        onContextMenu={ev => ev.stopPropagation()}
    >

        {children}
    </div>;
});

export function createCanvasDivStyle(comp: IComp): CSSProperties {

    let scale = scalePerCell;

    return {
        width: comp.size.x * scale,
        height: comp.size.y * scale,
        transform: `translate(${comp.pos.x}px, ${comp.pos.y}px) scale(${1/scale})`,
    };
}

/* This div will take the size of the pixels on the screen that covers the comp rect */
export const CompRectUnscaled: React.FC<{
    comp: IComp,
    hideHover?: boolean,
    children?: React.ReactNode,
}> = memo(function CompRectUnscaled({ comp, hideHover, children }) {
    let viewLayout = useViewLayout();

    let { setEditorState } = useEditorContext();

    function handleHover(isHover: boolean) {
        if (!hideHover) {
            return;
        }
        setEditorState(a => {
            return assignImm(a, {
                maskHover: isHover ? comp.id : (a.maskHover === comp.id ? null : a.maskHover),
            });
        });
    }

    let scale = Math.max(viewLayout.mtx.a, 15);

    return <div
        className="absolute origin-top-left"
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
        style={{
            transform: `translate(${comp.pos.x}px, ${comp.pos.y}px) scale(${1/scale})`,
            width: comp.size.x * scale,
            height: comp.size.y * scale,
        }}
    >
        {children}
    </div>;
});

export function makeEditFunction<T, A>(setEditorState: StateSetter<IEditorState>, editCtx: IEditContext, comp: IComp<T>, updateFn: (value: A, prev: T) => Partial<T>) {
    return (end: boolean, value: A) => {
        setEditorState(editCompConfig(editCtx, end, comp, a => assignImm(a, updateFn(value, a))));
    };
}

export const MenuRow: React.FC<{
    title: React.ReactNode,
    children?: React.ReactNode,
    disabled?: boolean,
}> = ({ title, children, disabled }) => {

    return <div className={clsx("flex flex-col mx-4 my-2", disabled && "opacity-50")}>
        <div className={"text-sm"}>{title}</div>
        <div className={""}>{children}</div>
    </div>
};

export const CheckboxMenuTitle: React.FC<{
    title: React.ReactNode,
    value: boolean,
    update: (end: boolean, value: boolean) => void,
}> = ({ title, value, update }) => {

    return <label className="text-sm flex items-center group cursor-pointer">
        <input type="checkbox" className="mr-2 relative group-hover:drop-shadow" checked={value} onChange={e => update(true, e.target.checked)} />
        {title}
    </label>;
};

export const ConfigMenu: React.FC<{
    className?: string,
    children?: React.ReactNode,
}> = ({ className, children }) => {

    let [btnRef, setBtnRef] = useState<HTMLElement | null>(null);

    let [visible, setVisible] = useState(false);

    return <>
        <button className={clsx(s.configMenuBtn, className)} ref={setBtnRef} onClick={() => setVisible(true)}>
            <FontAwesomeIcon icon={faCog} />
        </button>
        {visible && <Popup
            targetEl={btnRef}
            placement={PopupPos.BottomLeft}
            className={"tex-lg shadow-lg border-gray-700 bg-gray-400 rounded"}
            onClose={() => setVisible(false)}
            closeBackdrop={true}>

            {children}
        </Popup>}
    </>;
};
