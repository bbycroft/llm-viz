import { IWalkthrough, Phase } from "./Walkthrough";
import { commentary, DimStyle, dimStyleColor, embed, ITimeInfo, IWalkthroughArgs, moveCameraTo, phaseTools } from "./WalkthroughTools";
import s from './Walkthrough.module.scss';
import { Dim, Vec3, Vec4 } from "../utils/vector";
import { clamp, makeArray } from "../utils/data";
import React, { useState } from "react";
import { useProgramState } from "../Sidebar";
import { findSubBlocks, splitGrid } from "../Annotations";
import { useGlobalDrag } from "../utils/pointer";
import { IBlkDef } from "../GptModelLayout";
import { IProgramState } from "../Program";
import { lerp } from "../utils/math";
import { drawDependences } from "../Interaction";
import { drawDataFlow } from "../components/DataFlow";

/*
We're mostly on the right track here I think.

Main things that could do with improvement:

 - Make the camera movement more robust. It should basically be on rails when moving the slider.
 - We store the camera pos at the start of a given movement, and use that as a lerp, and also
   have a default so we can do a reversal

 - Have a highlight-region animation in both the text and the model, to bring attention to a specific
   point. Probably a rectangle with a rotating border. Could also include a shaded background on the text

 - Scroll the text to the next region to read

 - Have more pronounced (& consistent) delays between: camera movement/scroll -> higlight -> action
   - Can probably combine the camera movement and the highlight into a single action, but still have
     a delay between the highlight and the action 

 - Generally lean on the new display features more. Might need to add a few more (e.g. animate the dot product)
 - Also probably need to do TeX style layout for maths in the html view :( Could probably reuse the code from the
   3d layout? Just need to get the glyphs in via css/ttf, and then maybe use canvas for positioning? Hmm should
   be able to use divs with abs positioning.

 - For stopping/starting, use t + dt to figure out when it was crossed, rather than storing the lastPauseTime etc

*/

interface IIntroState {
    
}

function getIntroState(walkthrough: IWalkthrough): IIntroState {
    return walkthrough.phaseData.get(Phase.Intro_Intro) as IIntroState;
}

export function walkthroughIntro(args: IWalkthroughArgs) {
    let { breakAfter, afterTime, c_str } = phaseTools(args.state);
    let { state, layout, walkthrough: wt } = args;


    switch (wt.phase) {
        case Phase.Intro_Intro:

        let c0 = commentary(wt, null, 0)`Welcome to the walkthrough of the GPT large language model! Here we'll explore the model _nano-gpt_, with a mere 85,000 parameters.

It's goal is a simple one: take a sequence of six letters: ${embed(ExampleInputOutput)}
            and sort them in alphabetical order, i.e. to "ABBBCC".`;


        if (c0.t > 0) {
            for (let cube of layout.cubes) {
                if (cube.t === 'i' && cube.access) {
                    cube.access.disable = true;
                }
            }
            state.display.tokenIdxModelOpacity = makeArray(6, 0);
        }

        let t4 = afterTime(null, 1.5, 1.0);
        moveCameraTo(args.state, t4, new Vec3(1.3, 0, 6.7), new Vec3(281.5, 12.5, 0.4));
        let t6 = afterTime(null, 1.0, 0.4);

        if (t6.active && t6.t < 1.0) {
            let mixes = [0, 0, 0, 0, 0, 0];
            for (let i = 0; i < 6; i++) {
                // want to smoothly flash each token in turn (t6.t goes from 0-1, and each token should flash at 0.2, 0.4, 0.6, 0.8, 1.0 etc)
                let highT = (i + 1.5) / 8;
                mixes[i] = 1.0 - clamp(Math.abs(t6.t - highT) * 8, 0, 1);
            }
            state.display.tokenColors = { mixes, color2: new Vec4(0.8, 0.2, 0.8) };
        }

        breakAfter();

        let tokenStr = c_str('_token_', 0, DimStyle.Token);
        let tokenIdxStr = c_str('_token index_', 0, DimStyle.TokenIdx);

        commentary(wt, t6)`We call each of these letters a ${tokenStr}, and the set of the model's different tokens make up it's _vocabulary_:${embed(TokenVocab)}

        From this table, each token is assigned a number, it's ${tokenIdxStr}. And now we can enter this sequence of numbers into the model:${embed(ExampleTokenValues)}\n`;
        breakAfter();

        let t7 = afterTime(null, 1.5, 0.5);

        if (t7.active) {
            let opacity = makeArray(6, 0);
            for (let i = 0; i < 6; i++) {
                let highT = (i + 1.5) / 8;
                opacity[i] = clamp((t7.t - highT) * 4, 0, 1);
            }
            state.display.tokenIdxModelOpacity = opacity;

            let idxPos = t7.t * 6;

            if (t7.t < 1.0) {
                splitGrid(layout, layout.idxObj, Dim.X, idxPos, clamp(6 - idxPos, 0, 1));
                for (let blk of findSubBlocks(layout.idxObj, Dim.X, null, Math.min(5, Math.floor(idxPos)))) {
                    if (blk.access) {
                        blk.access.disable = false;
                    }
                }
            } else {
                if (layout.idxObj.access) {
                    layout.idxObj.access.disable = false;
                }
            }
        }

        breakAfter();

        let c5 = commentary(wt)`In the 3d view, the each green cell represents a number being processed, and each blue cell is a weight. ${embed(GreenBlueCells)}
        Each number in the sequence first gets turned into a 48 element vector. This is called an _embedding_.`;
        breakAfter(c5);

        {
            let t_camMove = afterTime(null, 1.0, 0.5);
            let t_makeVecs = afterTime(null, 2.0, 0.5);

            moveCameraTo(state, t_camMove, new Vec3(14.1, 0, -30.4), new Vec3(286, 14.5, 0.8));

            if (t_makeVecs.active) {
                let idxPos = t_makeVecs.t * 6;
                let splitWidth = clamp(6 - idxPos, 0, 2);
                let splitIdx = Math.min(5, Math.floor(idxPos));
                if (t_makeVecs.t < 1.0) {
                    splitGrid(layout, layout.idxObj, Dim.X, idxPos, splitWidth);
                    for (let blk of findSubBlocks(layout.idxObj, Dim.X, null, splitIdx)) {
                        if (blk.access) {
                            blk.access.disable = false;
                        }
                    }

                    splitGrid(layout, layout.residual0, Dim.X, idxPos, splitWidth);
                    for (let blk of findSubBlocks(layout.residual0, Dim.X, null, splitIdx)) {
                        if (blk.access) {
                            blk.access.disable = false;
                        }
                    }
                } else {
                    if (layout.residual0.access) {
                        layout.residual0.access.disable = false;
                    }
                }
            }
        }

        breakAfter();
        commentary(wt)`The embedding is then passed through the model, going through a series of layers, called transformers, before reaching the bottom.`;
        breakAfter();

        {

            let t_firstResid = afterTime(null, 1.0, 0.5);
            moveCameraTo(state, t_firstResid, new Vec3(-22.2, 0, -143.5), new Vec3(292.3, 26.8, 2.4));
            let t_firstResidWalk = afterTime(null, 5.0, 0.5);

            let processState = processUpTo(state, t_firstResidWalk, layout.blocks[0].attnResidual);

            let t_firstTransformer = afterTime(null, 1.0, 0.5);
            moveCameraTo(state, t_firstTransformer, new Vec3(-78.7, 0, -274.2), new Vec3(299.4, 14.7, 4.3));
            let t_firstTransformerWalk = afterTime(null, 3.5, 0.5);
            processUpTo(state, t_firstTransformerWalk, layout.blocks[0].mlpResidual, processState);

            if (t_firstTransformer.active) {
                layout.blocks[0].transformerLabel.visible = t_firstTransformer.t;
            }

            let t_fullFrame = afterTime(null, 1.0, 0.5);
            moveCameraTo(state, t_fullFrame, new Vec3(-147, 0, -744.1), new Vec3(298.5, 23.4, 12.2));
            let t_fullFrameWalk = afterTime(null, 5.0, 0.5);
            processUpTo(state, t_fullFrameWalk, layout.ln_f.lnResid, processState);


            // let t_endFrame = afterTime(null, 1.0, 0.5);
            // moveCameraTo(state, t_endFrame, new Vec3(-18.3, 0, -1576), new Vec3(280.6, 9.7, 1.9));
            // let t_endFrameWalk = afterTime(null, 2.0, 0.5);
            // processUpTo(state, t_endFrameWalk, layout.ln_f.lnResid, processState);

            let t_output = afterTime(null, 1.0, 0.5);
            moveCameraTo(state, t_output, new Vec3(-58.4, 0, -1654.9), new Vec3(271.3, 6.4, 1.1));
            // moveCameraTo(state, t_output, new Vec3(-53.9, 0, -1654.1), new Vec3(270.9, 6.2, 1.1));
            let t_outputWalk = afterTime(null, 2.0, 0.5);
            processUpTo(state, t_outputWalk, layout.logitsSoftmax, processState);
        }

        commentary(wt)`So what's the output? A prediction of the next token in the sequence. So at the 6th entry, we get probabilities that the next token is
            going to be 'A', 'B', or 'C'.`

        commentary(wt)`In this case, the model is pretty sure it's going to be 'A'. Now, we can feed this prediction back into the top of the model, and repeat
        the entire process.`;

        breakAfter();
        break;
    }
}

interface IProcessInfo {
    lastBlockIdx: number;
}

export function startProcessBefore(state: IProgramState, block: IBlkDef): IProcessInfo {
    let activeBlocks = state.layout.cubes.filter(a => a.t !== 'w');

    return {
        lastBlockIdx: activeBlocks.indexOf(block) - 1,
    };
}

export function processUpTo(state: IProgramState, timer: ITimeInfo, block: IBlkDef, prevInfo?: IProcessInfo): IProcessInfo {

    let activeBlocks = state.layout.cubes.filter(a => a.t !== 'w');

    let firstIdx = prevInfo ? prevInfo.lastBlockIdx + 1 : 0;
    let lastIdx = activeBlocks.indexOf(block);

    let numIdx = lastIdx - firstIdx + 1;

    // actually want to weight the time on each block by the number of cells in the block

    let cellCounts = activeBlocks
        .filter((_, i) => i >= firstIdx && i <= lastIdx)
        .map(a => (a.cx * a.cy) * Math.pow(a.deps?.dotLen ?? 1, 0.25));
    let totalCells = cellCounts.reduce((a, b) => a + b, 0);

    let accCell = 0;
    let currIdx = firstIdx;
    let subPos = 0; // 0 -> 1
    for (let i = firstIdx; i <= lastIdx; i++) {
        let blockFract = cellCounts[i - firstIdx] / totalCells;
        accCell += blockFract;
        if (timer.t < accCell) {
            currIdx = i;
            subPos = (timer.t - (accCell - blockFract)) / blockFract;
            break;
        }
    }

    // let currPos = lerp(firstIdx, lastIdx, timer.t);
    // let currIdx = Math.floor(currPos);

    let blk = activeBlocks[currIdx];

    let horizPos = lerp(0, blk.cx, subPos);
    let horizIdx = Math.floor(horizPos);

    let vertPos = lerp(0, blk.cy, horizPos - horizIdx);
    let vertIdx = Math.floor(vertPos);

    let blockPos = new Vec3(horizIdx, vertIdx, 0);
    let pinPos = new Vec3(Math.floor(blk.cx / 2), 0, 0);

    if (timer.t >= 1.0) {
        currIdx = lastIdx;
    }

    for (let i = firstIdx; i < currIdx; i++) {
        let blk = activeBlocks[i];
        if (blk.access) {
            blk.access.disable = false;
        }
    }

    if (timer.active && timer.t < 1.0) {
        drawDependences(state, blk, blockPos);
        drawDataFlow(state, blk, blockPos, pinPos);

        for (let label of state.layout.labels) {
            for (let c of label.cubes) {
                if (c === blk) {
                    label.visible = 1.0;
                }
            }
        }

        blk.highlight = 0.3;

        let column = splitGrid(state.layout, blk, Dim.X, horizPos, 0);
        if (column) {
            for (let col of findSubBlocks(blk, Dim.X, null, horizIdx)) {
                if (col.access) {
                    col.access.disable = false;
                    col.highlight = 0.1;
                }
            }
            column.highlight = 0.4;

            let curr = splitGrid(state.layout, column, Dim.Y, vertPos, 0);
            for (let blk of findSubBlocks(column, Dim.Y, null, vertIdx)) {
                if (blk.access) {
                    blk.access.disable = false;
                }
            }
            if (curr) {
                curr.highlight = 0.7;
            }
        }


    } else if (timer.active) {
        let blk = activeBlocks[lastIdx];
        if (blk.access) {
            blk.access.disable = false;
        }
    }

    let info = prevInfo ?? { lastBlockIdx: currIdx };
    info.lastBlockIdx = lastIdx;
    return info;
}

const ExampleInputOutput: React.FC = () => {
    let state = useProgramState();
    let cols = state.display.tokenColors;
    let chars = 'CBABBC'.split('');

    return <div className={s.tableWrap}>
        <div>{chars.map((c, i) => {
            let baseColor = dimStyleColor(DimStyle.Token);
            if (cols) {
                baseColor = Vec4.lerp(baseColor, cols.color2, cols.mixes[i]);
            }
            return <span key={i} style={{ color: baseColor.toHexColor() }}>{c} </span>;
        })}</div>
    </div>;
};

const ExampleTokenValues: React.FC = () => {
    let state = useProgramState();
    let cols = state.display.tokenIdxColors;
    let chars = 'CBABBC'.split('');

     return <div className={s.tableWrap}>
        <div>{chars.map((c, i) => {
            let tokIdx = c.charCodeAt(0) - 'A'.charCodeAt(0);

            let baseColor = dimStyleColor(DimStyle.TokenIdx);
            if (cols) {
                baseColor = Vec4.lerp(baseColor, cols.color2, cols.mixes[i]);
            }
            return <span key={i} style={{ color: baseColor.toHexColor() }}>{tokIdx} </span>;
        })}</div>
    </div>;
};

const TokenVocab: React.FC = () => {

    return <div className={s.tableWrap}>
        <table className={s.table}>
            <tbody>
                <tr className={s.tokString} style={{ color: dimStyleColor(DimStyle.Token).toHexColor() }}>
                    <th>token</th><td>A</td><td>B</td><td>C</td>
                </tr>
                <tr className={s.tokIndex} style={{ color: dimStyleColor(DimStyle.TokenIdx).toHexColor() }}>
                    <th>index</th><td>0</td><td>1</td><td>2</td>
                </tr>
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