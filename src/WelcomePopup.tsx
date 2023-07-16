'use client';

import { faCircleQuestion } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createContext, useContext, useEffect } from 'react';
import { assignImm, Subscriptions, useSubscriptions } from './utils/data';
import { KeyboardOrder, useGlobalKeyboard } from './utils/keyboard';
import { useLocalStorageState } from './utils/localstorage';
import { ModalWindow } from './utils/Portal';
import s from './WelcomePopup.module.scss';
import IntroImage from './intro-image-opt.svg';
import Image from 'next/image';

interface IWelcomePopupLS {
    visible: boolean;
}

function hydrateWelcomePopupLS(a?: Partial<IWelcomePopupLS>) {
    return {
        visible: a?.visible ?? true,
    };
}

export const WelcomePopup: React.FC<{}> = () => {
    let ctx = useContext(WelcomeContext); 
    useSubscriptions(ctx.subscriptions);
    let [welcomeState, setWelcomeState] = useLocalStorageState('welcome-popup', hydrateWelcomePopupLS);

    useGlobalKeyboard(KeyboardOrder.Modal, ev => {

        if (ev.key === 'Escape') {
            hide();
        }

        ev.stopPropagation();
    });

    useEffect(() => {
        if (ctx.forceVisible) {
            ctx.forceVisible = false;
            setWelcomeState(a => assignImm(a, { visible: true }));
        }
    }, [ctx, setWelcomeState, ctx.forceVisible]);

    function hide() {
        setWelcomeState(a => assignImm(a, { visible: false }));
    }

    if (!welcomeState.visible) {
        return null;
    }

    return <ModalWindow className={s.modalWindow} backdropClassName={s.modalWindowBackdrop} onBackdropClick={hide}>
        <div className={s.header}>
            <div className={s.title}>Welcome!</div>
        </div>
        <div className={s.body}>
            <div className={s.image}>
                <Image src={IntroImage} alt={"LLM diagram"} />
            </div>
            <div className={s.text}>
                <p>This is an interactive 3D Visualization of a Large Language Model (LLM),
                    of the likes that powers GPT-3 & ChatGPT.</p>
                <p>We show a very small model of the same design, to help you understand how
                    these models work.</p>
                <p>As well as being interactive, we provide a walkthrough of the model
                    showing the step-by-step process of how it works, with every single add, multiply &
                    math operation described.</p>
            </div>
        </div>
        <div className={s.footer}>
            <button className={s.button} onClick={hide}>Get Started</button>
        </div>
    </ModalWindow>;
};

class WelcomeManager {
    subscriptions = new Subscriptions();
    forceVisible = false;
    showWelcomeDialog() {
        this.forceVisible = true;
        this.subscriptions.notify();
    }
}

let WelcomeContext = createContext(new WelcomeManager());

export const InfoButton: React.FC<{}> = () => {
    let ctx = useContext(WelcomeContext); 

    return <div onClick={() => ctx.showWelcomeDialog()}>
        <FontAwesomeIcon icon={faCircleQuestion} />
    </div>;
};
