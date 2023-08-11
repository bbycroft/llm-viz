import { useEffect, useState } from "react";
import { useFunctionRef } from "./data";
import { Vec3 } from "./vector";

export interface ILayout {
    width: number;
    height: number;
    isDesktop: boolean;
    isPhone: boolean;
}

export function useScreenLayout() {
    let [layout, setLayout] = useState<ILayout>({ width: 0, height: 0, isDesktop: true, isPhone: false });

    useEffect(() => {
        // check the media queries that we use in css land
        let mediaQuery = window.matchMedia('screen and (max-width: 800px)');

        function handleResize() {
            setLayout({
                width: window.innerWidth,
                height: window.innerHeight,
                isDesktop: !mediaQuery.matches,
                isPhone: mediaQuery.matches,
            });
        }

        handleResize();

        window.addEventListener('resize', handleResize);
        mediaQuery.addEventListener('change', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            mediaQuery.removeEventListener('change', handleResize);
        };
    }, []);

    return layout;
}

export function useResizeChangeHandler(el: HTMLElement | undefined | null, handler: (size: Vec3, bcr: DOMRect) => void) {
    let handlerRef = useFunctionRef(handler);
    useEffect(() => {
        if (!el) return;
        let observer = new ResizeObserver(() => {
            let bcr = el.getBoundingClientRect();
            handlerRef.current(new Vec3(bcr.width, bcr.height, 0), bcr);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [el, handlerRef]);
}
