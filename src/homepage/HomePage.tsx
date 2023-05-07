'use client';
import { faGithub, faTwitter } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useState } from 'react';
import s from './HomePage.module.scss';

export const HomePage: React.FC = () => {
    let [emailText, setEmailText] = useState('');

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

    function navToLLMViz() {
        window.location.href = '/llm-viz';
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
                    software engineer
                </div>
                <div className={s.links}>
                    <a href="https://github.com/bbycroft" rel="noopener noreferrer" target="_blank">
                        <FontAwesomeIcon icon={faGithub} />
                    </a>
                    <a href="https://twitter.com/brendanbycroft" rel="noopener noreferrer" target="_blank">
                        <FontAwesomeIcon icon={faTwitter} />
                    </a>
                    <a onClick={showEmail} title="Click to Reveal">
                        <FontAwesomeIcon icon={faEnvelope} />
                    </a>
                </div>
                <div className={s.emailText}>{emailText}</div>
            </div>
        </div>

        <div className={s.projectsSection}>
            <div className={s.sectionTitle}>Projects</div>
            <div className={s.projectCard} onClick={navToLLMViz}>
                <div className={s.cardImage}>
                    <img src="/images/llm-viz-screenshot2.png" alt="LLM Visualization Screenshot" />
                </div>
                <div className={s.cardContent}>
                    <div className={s.cardTitle}>
                        <Link href={"/llm-viz"}> 
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
                    Born & raised in New Zealand, I received a BSc in Maths & Physics from the University of Canterbury in 2012. I've been writing
                    code ever since I first got my hands on a computer, and have been working professionally as a software engineer since 2013.
                </p>
                <p>
                    Over my career I've touched a whole variety of tech, from CUDA programming to web development. On the way becoming well versed in
                    embedded C, distributed system architecture, databases, cloud infrastructure, numerous algorithms, 3d graphics, and much more.
                </p>
                <p>
                    I've always sought to bring high performance to my work, the feature that many can't articulate but everyone can feel. Computers
                    are ridiculously fast, and there's often so much left on the table.
                </p>
                <p>
                    I have a tendency to roll-my-own, which invariably pays off in the long run: I understand how things work, can debug & fix them
                    easily, and ensure they're tailored to the problem at hand. Not to mention the gains in performance & bundle size. I also err on
                    the side of a data-oriented approach, as most abstractions are a waste and a burden, and simple functions get you a long way.
                </p>
            </div>
        </div>
    </div>;
}