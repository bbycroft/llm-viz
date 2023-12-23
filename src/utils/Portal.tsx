'use client';

import clsx from "clsx";
import React, { forwardRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { assignImm } from "./data";
import s from './Portal.module.scss';

export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
         setPortalEl(document.getElementById('portal-container'));
    }, []);
    return portalEl ? createPortal(children, portalEl) : null;
};


export const FullscreenOverlay: React.FC<{
    className?: string,
    onClick?: React.MouseEventHandler,
    children: React.ReactNode,
}> = ({ className, onClick, children }) => {

    function handleClick(ev: React.MouseEvent) {
        ev.stopPropagation();
        if (ev.target === ev.currentTarget) {
            onClick?.(ev);
        }
    };

    return <Portal>

        <div className={clsx(s.fullscreenOverlay, className)} onClick={handleClick}>
            {children}
        </div>
    </Portal>;
}

export const ModalWindow: React.FC<{
    className?: string,
    backdropClassName?: string,
    onBackdropClick?: React.MouseEventHandler,
    children: React.ReactNode,
}> = ({ className, backdropClassName, onBackdropClick, children }) => {

    return <FullscreenOverlay className={clsx(s.modalWindowBackdrop, backdropClassName)} onClick={onBackdropClick}>
        <div className={clsx(s.modalWindow, className)}>
            {children}
        </div>
    </FullscreenOverlay>;
}


export enum PopupPos {
    TopLeft,
    BottomLeft,
}

export const Popup: React.FC<{
    targetEl: HTMLElement | null,
    setPopupEl?: (el: HTMLDivElement | null) => void,
    placement: PopupPos,
    matchTargetWidth?: boolean,
    children?: React.ReactNode,
    className?: string,
    closeBackdrop?: boolean,
    offsetX?: number,
    offsetY?: number,
    onClose?: () => void,
}> = function Popup({ targetEl, placement, matchTargetWidth, children, className, closeBackdrop, onClose, offsetX, offsetY, setPopupEl }) {
    let [popupElLocal, setPopupElLocal] = useState<HTMLDivElement | null>(null);
    let targetBcr = useWatchElementRect(targetEl, true);
    let popupBcr = useWatchElementRect(popupElLocal); // we don't need position info for the popup (would cause an infinite loop)

    function setPopupElLocal2(el: HTMLDivElement | null) {
        setPopupElLocal(el);
        setPopupEl?.(el);
    }

    let pos = computeTransform(targetBcr, popupBcr, placement);

    let el = <div ref={setPopupElLocal2} className={clsx(s.popup, className)} style={{
        transform: `translate(${pos.x + (offsetX ?? 0)}px, ${pos.y + (offsetY ?? 0)}px)`,
        left: 0,
        top: 0,
        width: matchTargetWidth ? targetBcr?.width : undefined,
    }}>
        {children}
    </div>;

    function handleClick(ev: React.MouseEvent) {
        // ensure the click was directly on the backdrop & not a child
        if (ev.target === ev.currentTarget) {
            onClose?.();
        }
    }

    return <Portal>
        {closeBackdrop ? <div
            className={s.popupBackdrop}
            onClick={handleClick}
            onMouseMove={ev => ev.stopPropagation()}
            onMouseUp={ev => ev.stopPropagation()}
            onMouseDown={ev => ev.stopPropagation()}
        >{el}</div> : el}
    </Portal>;
};

function computeTransform(targetBcr: DOMRect | null, popupBcr: DOMRect | null, placement: PopupPos) {
    if (!targetBcr || !popupBcr) {
        return { x: 0, y: 0 };
    }

    let x = 0;
    let y = 0;

    switch (placement) {
        case PopupPos.BottomLeft:
            x = targetBcr.x;
            y = targetBcr.bottom;
            break;
        case PopupPos.TopLeft:
            x = targetBcr.x;
            y = targetBcr.y - popupBcr.height;
            break;
    }

    return { x, y };
}

export function useWatchElementRect(el: HTMLElement | null, includePosition = false) {
    let [bcr, setBcr] = useState<DOMRect | null>(null);

    useLayoutEffect(() => {
        function handleChange() {
            let bcr = el ? el.getBoundingClientRect() : null;
            setBcr(prev => (el && prev) ? assignImm(prev, {
                x: includePosition ? bcr!.x : 0,
                y: includePosition ? bcr!.y : 0,
                width: bcr!.width,
                height: bcr!.height,
            }) : bcr);
        }

        if (el) {
            let observer = new ResizeObserver(handleChange);
            observer.observe(el);
            handleChange();
            return () => {
                observer.unobserve(el);
                setBcr(null);
            };
        }
    }, [el, includePosition]);
    return bcr;
}
