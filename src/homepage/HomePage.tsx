'use client';
import { faGithub, faTwitter } from '@fortawesome/free-brands-svg-icons';
import { faCircleDollarToSlot, faEnvelope, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import s from './HomePage.module.scss';
import { Tooltip } from '../utils/Tooltip';

export const HomePage: React.FC = () => {
    let [emailText, setEmailText] = useState('');
    let router = useRouter();

    function showEmail(ev: React.MouseEvent) {
        let last = 'bycroft';
        let first = 'brendan';
        let domain = 'moc.liamg';
        domain = [...domain].reverse().join('');
        let at = '_' + 'at' + '_';
        setEmailText(text => text ? '' : `${first}.${last} ${at} ${domain}`);
        ev.stopPropagation();
        ev.preventDefault();
    }

    function externalIcon() {
        return <FontAwesomeIcon icon={faUpRightFromSquare} fontSize={10} className='ml-3 mr-1 relative top-[-1px]' />;
    }

    return <div className={s.homePage}>
        <div className={s.headerSection}>
            <div className={s.profilePic}>
                <img src="/me.jpeg" alt="Profile Picture" />
            </div>
            <div className={s.nameSection}>
                <div className={s.name}>
                    Brendan Bycroft
                </div>
                <div className={s.subhead}>
                    Software Engineer
                </div>
                <div className={s.links}>
                    <Tooltip tip={<>Github /bbycroft {externalIcon()}</>}>
                        <a href="https://github.com/bbycroft" rel="noopener noreferrer" target="_blank">
                            <FontAwesomeIcon icon={faGithub} />
                        </a>
                    </Tooltip>
                    <Tooltip tip={<>Twitter @brendanbycroft {externalIcon()}</>}>
                        <a href="https://twitter.com/brendanbycroft" rel="noopener noreferrer" target="_blank">
                            <FontAwesomeIcon icon={faTwitter} />
                        </a>
                    </Tooltip>
                    <Tooltip tip={`Click to ${emailText ? 'Hide' : 'Reveal'}`}>
                        <a onClick={showEmail}>
                            <FontAwesomeIcon icon={faEnvelope} />
                        </a>
                    </Tooltip>
                    <Tooltip tip={<>Tip securely via Stripe {externalIcon()}</>}>
                        <a href="https://donate.stripe.com/dR68yQbhxauue8E6oo" rel="noopener noreferrer" target="_blank">
                            <FontAwesomeIcon icon={faCircleDollarToSlot} />
                        </a>
                    </Tooltip>
                </div>
                <div className={s.emailText}>{emailText}</div>
            </div>
        </div>

        <div className={s.projectsSection}>
            <div className={s.sectionTitle}>Projects</div>
            <div className={s.projectCard} onClick={() => router.push('/llm')}>
                <div className={s.cardImageWrapper}>
                    <div className={s.cardImage}>
                        <img src="/images/llm-viz-screenshot2.png" alt="LLM Visualization Screenshot" />
                    </div>
                </div>
                <div className={s.cardContent}>
                    <div className={s.cardTitle}>
                        <Link href={"/llm"}>
                        {/* rel="noopener noreferrer" target="_blank"> */}
                            LLM Visualization
                        </Link>
                    </div>
                    <div className={s.cardText}>
                        A visualization and walkthrough of the LLM algorithm that backs OpenAI's ChatGPT.
                        Explore the algorithm down to every add & multiply, seeing the whole process in action.
                    </div>
                </div>
            </div>
        </div>

        <div className={s.divider} />

        <div className={s.projectsSection}>
            <div className={s.sectionTitle}>Bio</div>
            <div className={s.bioText}>
                <p>
                    Born and raised in New Zealand, I've been writing code ever since I first got my hands on a computer.
                    After my Bsc in Maths and Physics<span className={s.footnoteRef}>1</span>, I have been working professionally as a software engineer since 2013.
                </p>
                <p>
                    Over my career I've touched a whole variety of tech, from CUDA programming to web development. On the way becoming well versed in
                    embedded C, distributed system architecture, databases, cloud infrastructure, numerous algorithms, 3D graphics, and much more.
                </p>
                <p>
                    I've always sought to bring high performance to the things I build, the feature that many can't articulate but everyone can feel.
                    Computers are ridiculously fast, and there's often so much left on the table.
                </p>
                <p>
                    I have a tendency to roll-my-own, which invariably pays off in the long run: I understand how things work, can debug and fix them
                    easily, and ensure they're tailored and optimized to the problem at hand. I also err on
                    the side of a data-oriented approach, as most abstractions are unnecessary, and simple functions get you a long way.
                </p>
                <div className={s.footnotes}>
                    <div className={s.footnote}>1. BSc in Mathematics and Physics from the University of Canterbury in 2012</div>
                </div>
            </div>
        </div>
    </div>;
}
