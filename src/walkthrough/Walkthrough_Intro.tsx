import { IWalkthrough, Phase } from "./Walkthrough";
import { commentary, DimStyle, dimStyleColor, eventEndTime, IWalkthroughArgs, moveCameraTo, phaseTools } from "./WalkthroughTools";
import s from './Walkthrough.module.css';
import { Vec3, Vec4 } from "../utils/vector";
import { clamp, useGlobalDrag } from "../utils/data";
import React, { useState } from "react";

/*
Need to re-think how we display & interact with the walkthrough. Current approach just doesn't really work at all.

Think I'll a) switch to rendering in HTML, and b) tie the model viz to the scroll position of the walkthrough text.

May have to figure out how to have a sort of vertical caret position. May have it position-able vertically, so the
user can scroll back and forth for the changes, but also specify their vertical reading position.

Will likely chunk the walkthrough into our groups. Main difficulty is how we handle the bottom of the walkthrough page.

How do we pass data from here to the UI?

Guess we just chuck them into a data structure that we can gen into react/html.

-----



*/

/*

Think about how we do this:

Want our little lines between paragraphs to be little mini-sliders that play the next event

So: need to know all the events between each paragraph.

The paragraphs themselves basically take no time, but end in a break. The event plays and then the
next paragraph shows, or at least we scroll to it.

*/

interface IIntroState {
    
}

function getIntroState(walkthrough: IWalkthrough): IIntroState {
    return walkthrough.phaseData.get(Phase.Intro_Intro) as IIntroState;
}

export function walkthroughIntro(args: IWalkthroughArgs) {
    let { breakAfter, atEvent, atTime, afterTime, commentaryPara, c_str } = phaseTools(args.state);
    let { state, layout, walkthrough: wt } = args;


    switch (wt.phase) {
        case Phase.Intro_Intro:

        let c0 = commentary(wt, null, 0)`Welcome to the walkthrough of the GPT large language model! Here we'll explore the model _nano-gpt_, with a mere 85,000 parameters.`;

        let c4 = commentary(wt, null, 0)`It's goal is a simple one: take a sequence of six letters: ${embed(ExampleInputOutput)}
            and sort them in alphabetical order, i.e. to "ABBBCC".`;

        let t4 = afterTime(c4, 0.8, 0.5);
        moveCameraTo(args.state.render, t4, new Vec3(), new Vec3());

        let t6 = afterTime(t4, 1.2, 0.4);

        let tokenStr = c_str('_token_', 0, DimStyle.Token);

        commentary(wt, t6)`We call each of these letters a ${tokenStr}, and the set of the model's different tokens make up it's _vocabulary_:${embed(TokenVocab)}`;

        commentary(wt)`From this table, each token is assigned a number. And now we can enter this sequence of numbers into the model:${embed(ExampleTokenValues)}`;

        let c5 = commentary(wt)`In the 3d view, the each green cell represents a number being processed, and each blue cell is a weight. Bright: positive, grey: 0, dark: negative. ${embed(GreenBlueCells)}`;
        breakAfter(c5);

        afterTime(null, 0.5, 0.5);
        afterTime(null, 1.0, 0.5);

        commentary(wt)`Each number in the sequence first gets turned into a 48 element vector. This is called an _embedding_.`;

        commentary(wt)`The embedding is then passed through the model, going through a series of layers, called transformers, before reaching the bottom.`;

         commentary(wt)`So what's the output? A prediction of the next token in the sequence. So at the 6th entry, we get probabilities that the next token is
            going to be 'A', 'B', or 'C'.`
         
        let c10 = commentary(wt)`In this case, the model is pretty sure it's going to be 'A'.`;

        break;
    }
}

function embed(fc: React.FC) {
    return { insert: () => fc };
}

const ExampleInputOutput: React.FC = () => {
    return <div className={s.tableWrap}>
        <div style={{ color: dimStyleColor(DimStyle.Token).toHexColor() }}>C B A B B C</div>
    </div>;
};

const ExampleTokenValues: React.FC = () => {
     return <div className={s.tableWrap}>
        <div>2 1 0 1 1 2</div>
    </div>;
};

const TokenVocab: React.FC = () => {

    return <div className={s.tableWrap}>
        <table className={s.table}>
            <tbody>
                <tr className={s.tokString}><th>token</th><td>A</td><td>B</td><td>C</td></tr>
                <tr className={s.tokIndex}><th>index</th><td>0</td><td>1</td><td>2</td></tr>
            </tbody>
        </table>
    </div>
};

const GreenBlueCells: React.FC = () => {

    let [blueNums, setBlueNums] = useState([-0.7, 0.7, -0.1]);
    let [greenNums, setGreenNums] = useState([-0.7, 0.4, 0.8]);

    let blueColor = new Vec4(0.3, 0.3, 1.0);
    let greenColor = new Vec4(0.3, 0.9, 0.3);

    return <div className={s.tableWrap}>
        <div className={s.cellInfoCols}>
            <div className={s.cellInfoCol}>
                <Cell nums={greenNums} color={greenColor} mul={0.5} />
                <Graph nums={greenNums} color={greenColor} setNums={setGreenNums} />
                <div className={s.cellInfoText}>being processed</div>
            </div>
            <div className={s.cellInfoCol}>
                <Cell nums={blueNums} color={blueColor} mul={1} />
                <Graph nums={blueNums} color={blueColor} setNums={setBlueNums} />
                <div className={s.cellInfoText}>weights</div>
            </div>
        </div>
    </div>
};

const Cell: React.FC<{ nums: number[], color: Vec4, mul?: number }> = ({ color, nums, mul }) => {

    let grey = new Vec4(0.5, 0.5, 0.5, 1.0);
    let cellLight = Vec4.lerp(color, grey, 0.9);
    let cellDark = cellLight.mul(0.98);
    cellDark.w = 1.0;

    let cellColor = (n: number) => {
        let weight = clamp(Math.abs(n), 0.0, 1.0);

        let negColor = new Vec4(0.0, 0.0, 0.0);
        let posColor = color;
        let zeroColor = new Vec4(0.5, 0.5, 0.5);
        if (n < 0.0) {
            return Vec4.lerp(zeroColor, negColor, weight).toHexColor();
        } else {
            return Vec4.lerp(zeroColor, posColor, weight).toHexColor();
        }
    };

    return <div className={s.cellArrayHoriz}>
        {nums.map((n, i) => {
            return <div className={s.cellRect} key={i} style={{ backgroundColor: (i % 2 === 0 ? cellLight : cellDark).toHexColor() }}>
                <div className={s.cellCircle} style={{ backgroundColor: cellColor(n * (mul ?? 1.0)) }} />
            </div>;
        })}
    </div>
};

const Graph: React.FC<{
    nums: number[],
    color: Vec4,
    max?: number,
    setNums?: (nums: number[]) => void,
}> = ({ color, nums, max, setNums }) => {
    let [graphEl, setGraphEl] = useState<HTMLDivElement | null>(null);

    let ticks = [-1, 0, 1];
    let cellW = 30;
    let dispColor = color.mul(1.0);
    dispColor.w = 0.5;

    interface IDragInitial {
        index: number;
        nums: number[];
    }

    let [, setDragStart] = useGlobalDrag<IDragInitial>(function handleMove(ev, ds) {
        let dy = ev.clientY - ds.clientY;
        let h = graphEl!.clientHeight * 0.5;
        let nums = [...ds.data.nums];
        nums[ds.data.index] = clamp(nums[ds.data.index] - dy / h, -1.0, 1.0);
        setNums?.(nums);
        ev.preventDefault();
        ev.stopImmediatePropagation();
    })

    return <div className={s.graph} style={{ width: cellW * nums.length }} ref={setGraphEl}>

        <div className={s.axisLeft} />

        <div className={s.axisZero} />

        {nums.map((n, i) => {
            let nScaled = n / (max ?? 1.0);

            return <div className={s.graphCol} key={i}>
                <div className={s.graphBar} style={{
                    backgroundColor: dispColor.toHexColor(),
                    top: nScaled < 0 ? '50%' : `${(0.5 - nScaled/2) * 100}%`,
                    height: `${(Math.abs(nScaled)/2) * 100}%`,
                }} />
                <div
                    className={s.graphBarHit}
                    onMouseDown={ev => {
                        setDragStart(ev, { index: i, nums });
                        ev.stopPropagation();
                        ev.preventDefault();
                    }}
                    style={{
                        top: `${(0.5 - nScaled/2) * 100}%`
                    }} />
                <div className={s.graphBarLabel} style={{
                     bottom: nScaled < 0 ? '50%' : undefined,
                        top: nScaled > 0 ? '50%' : undefined,
                }}>
                    {n.toFixed(1)}
                </div>
            </div>;
        })}

    </div>;

};