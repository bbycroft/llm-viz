import { blockDimension, blockIndex, drawTextOnModel, findSubBlocks, renderIndexes, splitGridX, TextAlignHoriz, TextAlignVert } from "./Annotations";
import { IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { IRenderState, IRenderView } from "./render/modelRender";
import { clamp, oneHotArray } from "./utils/data";
import { measureTextWidth, writeTextToBuffer } from "./utils/font";
import { lerp, lerpSmoothstep } from "./utils/math";
import { Vec3, Vec4 } from "./utils/vector";

export enum Dim {
    X = 0,
    Y = 1,
    Z = 2,
}

/**

Thoughts about the walkthrough:

- Linking text events to the visual actions doesn't work well.
- Attention needs to flip between them directly. Much better to do a chunk of text, then [Spacebar], then action.
  Can still do aligned highlights though, but focussed on the model, and linking back to the text.
  This also works well with hover on either. The color-coding helps a lot anyway.

- Better to do all this text in html, it adds searchability, and supports more things. _However_, probably
  difficult to do TeX fonts. Although maybe that's a bit excessive anyway.

- Can show a reasonable amount of text: Limit to half a screen on mobile, say.

- Fast but smooth transitions, with a pause in between, is much better.
- Slow, linked transitions is kinda nauseating.

- Need more controls! Mainly jumping between phases, and selecting times on phases.
- Can compute the latest time on each phase by keeping track of the events. Can keep this in an array for
  display as well.
- Need to push back into react-land at the end of each frame. (commentary; stats; etc)
- Probably need to query all the phases up front somehow. Could have a pass where we don't actually
  update anything, but read off info for each one. A pain for the in-place updates though. Likely to break
  things. Easier to just have a list of them and info like titles.
- Hmm, do want to expand to total time, hmm.

- Need a bunch more annotations/effects yet
  - Get the trails working well
  - Want a descriptor of how a cell is computed (x, y from these; mul by a, b from these, plus this; all added, [t])
  - It applies to everything, and could allow for 'draw for this 1 cell', 'draw for this col/row of cells'.
  - Curved arrows and flows with thickness
    - Arrows for showing embedding mapping, and for linking src & sink
    - Flows for the residual pathway: wide transparent no-width path, with glowing more-solid sides
      - Basically wide arrows
      - Also need side bit coming off of it for when it's copied
      - Not as wide as the actual block; keep it maybe half-T thick
      - Some indication of flow
  - Highlight block or row/column

 */

export function writeCommentary(state: IRenderState, prev: ICommentaryRes | null, stringsArr: TemplateStringsArray, ...values: any[]): ICommentaryRes {
    let t = prev?.duration ?? 0;
    let lineOffset = prev?.lineOffset ?? 0;
    let lineNum = prev?.lineNum ?? 0;
    let fontSize = 20;
    let maxWidth = 300;
    let charsPerSecond = 400;

    for (let i = 0; i < values.length + 1; i++) {
        let str = stringsArr[i];

        t += str.length / charsPerSecond;

        if (i < values.length && 't' in values[i]) {
            // calculate the t value of this point
            values[i].start = t;
            t += values[i].duration;
        }
    }

    let targetT = state.walkthrough.time;

    function writeWord(str: string, tStart: number, colOverride?: Vec4, fontOverride?: string) {

        while (str.startsWith('\n')) {
            lineNum += 1;
            lineOffset = 0;
            str = str.substring(1);
        }

        let strToDraw = str;
        let nextOff = 0;
        let w = measureTextWidth(state.modelFontBuf, str, fontSize);
        if (lineOffset + w > maxWidth) {
            lineNum += 1;
            lineOffset = 0;
            strToDraw = str.trimStart();
            w = measureTextWidth(state.modelFontBuf, strToDraw, fontSize);
            if (w > maxWidth) {
                // ignore for now; single word longer than line: should break at the character level
            }
            nextOff = w;
        } else {
            nextOff = lineOffset + w;
        }

        let color = new Vec4(0.5, 0.5, 0.5, 1).mul(0.5);
        if (targetT > tStart) {
            let targetColor = colOverride ?? new Vec4(0.1, 0.1, 0.1, 1);
            color = Vec4.lerp(color, targetColor, clamp((targetT - tStart) * 10, 0, 1));
        }
        writeTextToBuffer(state.overlayFontBuf, strToDraw, color, 10 + lineOffset, 10 + lineNum * fontSize * 1.2, fontSize, undefined, fontOverride);

        lineOffset = nextOff;
    }

    t = prev?.duration ?? 0;
    for (let i = 0; i < values.length + 1; i++) {
        let words = stringsArr[i].split(/(?=[ \n])/);

        for (let word of words) {
            writeWord(word, t);
            t += word.length / charsPerSecond;
        }

        if (i < values.length && 't' in values[i]) {
            let val = values[i];
            // calculate the t value of this point
            val.start = t;
            writeWord(values[i].str, t, val.color, val.fontFace);
            t += val.duration;
        }
    }

    let res = { stringsArr, values, duration: t, lineNum, lineOffset };

    if (prev) {
        prev.lineNum = lineNum;
        prev.lineOffset = lineOffset;
        prev.duration = t;
    } else {
        state.walkthrough.commentary = res;
    }

    return res;
}

export interface ICommentaryRes {
    stringsArr: TemplateStringsArray;
    values: any[];
    duration: number;
    lineNum: number;
    lineOffset: number;
}

export interface ITimeInfo {
    name: string;
    start: number;
    duration: number;
    wait: number;

    // will change over the course of a phase: used to lerp
    t: number; // 0 - 1
    active: boolean;
}

export function moveCameraTo(state: IRenderState, time: ITimeInfo, rot: Vec3, target: Vec3) {

}

export enum DimStyle {
    t,
    T,
    C,
    B,
    A,
    n_vocab,
}

export function dimStyleColor(style: DimStyle) {
     switch (style) {
        case DimStyle.t:
        case DimStyle.T:
            return new Vec4(0.4, 0.4, 0.9, 1);
    }
    return new Vec4(0,0,0);
}

export function markDimensions(state: IRenderState, time: ITimeInfo, blk: IBlkDef, dim: Dim, style: DimStyle) {
    let color = dimStyleColor(style);
}

export function highlightBlock(state: IRenderState, time: ITimeInfo, blk: IBlkDef, name: string) {

}

export function hideFromBlock(state: IRenderState, layout: IGptModelLayout, targetBlk: IBlkDef) {
    let seen = false;
    for (let blk of layout.cubes) {
        if (!seen && blk === targetBlk) {
            seen = true;
        }
        seen && blk.t === 'i' && hideBlock(blk);
    }
    function hideBlock(b: IBlkDef) {
        if (b.access) {
            b.access.disable = true;
        }
        b.subs?.forEach(hideBlock);
    }
}

export interface IPhaseGroup {
    groupId: string;
    title: string;
    phases: IPhaseDef[];
}

export interface IPhaseDef {
    id: Phase;
    title: string;
}

export type IWalkthrough = ReturnType<typeof initWalkthrough>;

export function initWalkthrough() {
    return {
        phase: Phase.Input_Detail_Tables,
        time: 0,
        running: false,
        commentary: null as ICommentaryRes | null,
        times: [] as ITimeInfo[],
        phaseLength: 0,
        markDirty: () => { }, // bit of a hack to get it to WalkthroughSidebar
        phaseList: [{
            groupId: 'detailed-input',
            title: 'Detailed - Input',
            phases: [
                { id: Phase.Input_First, title: 'The First' },
                { id: Phase.Input_Detail_Tables, title: 'Embedding Tables' },
                { id: Phase.Input_Detail_TokEmbed, title: 'Embedding Action' },
            ],
        }] as IPhaseGroup[],
    };
}

export enum Phase {
    Input_First,
    Input_Detail_Tables,
    Input_Detail_TokEmbed,
}

export function runWalkthrough(state: IRenderState, view: IRenderView, layout: IGptModelLayout) {
    let phaseState = state.walkthrough;
    phaseState.times = [];

    function T_val(str: string, duration: number = 0.3, fontFace?: string) {
        return { str, duration, start: 0, t: 0.0, color: dimStyleColor(DimStyle.T), fontFace };
    }

    function atTime(start: number, duration?: number, wait?: number): ITimeInfo {
        duration = duration ?? 1;
        wait = wait ?? 0;
        let info: ITimeInfo = {
            name: '',
            start,
            duration,
            wait,
            t: clamp((phaseState.time - start) / duration, 0, 1),
            active: phaseState.time > start && phaseState.time < start + duration,
         };
         phaseState.times.push(info);
         phaseState.phaseLength = Math.max(phaseState.phaseLength, start + duration + wait);
         return info;
    }

    function atEvent(evt: { str: string, duration: number, t: number, start: number }): ITimeInfo {
        return atTime(evt.start, evt.duration);
    }

    function afterTime(prev: ITimeInfo, duration: number, wait?: number): ITimeInfo {
        return atTime(prev.start + prev.duration + prev.wait, duration, wait);
    }

    function cleanup(t: ITimeInfo, times: ITimeInfo[] = phaseState.times) {
        if (t.t > 0.0) {
            for (let prevTime of times) {
                prevTime.t = 1.0 - t.t;
            }
        }
    }

    function commentary(stringsArr: TemplateStringsArray, ...values: any[]) {
        let res = writeCommentary(state, null, stringsArr, ...values);
        return res;
    }

    function commentaryPara(c: ICommentaryRes) {
        return (stringsArr: TemplateStringsArray, ...values: any[]) => {
            return writeCommentary(state, c, stringsArr, ...values);
        };
    }

    state.tokenColors = null;

    switch (phaseState.phase) {
    // -- Input --
    // "Each token, or word/character, is represented by a number." [sequentially highlight the first few tokens & their numbers]
    // "We could map characters to numbers, or words to numbers, or anything else." [show a char-map, show a gpt-token map; highlight the mappings]
    // "In our case, we only have 3 'words' in our vocabulary: '0', '1', and '2'." [highlight the 3 distinct words] (footnote about Andrej Karpathy's demo example)
    // "And these naturally map to the integers 0, 1, and 2." [highlight the 3 distinct integers]
    // "This tiny model here sorts those numbers into ascending order. Let's see how it works!" [visualize the sort; show the model]

    // "So we put our sequence into an array, ignoring the rest." [highlight the 6 integers]
    // "We convert our sequence of 6 tokens/integers to 48 element vectors. one at each 'time' step." [quick op phase; highlight the 48 element vectors]

    // "These vectors now pass through the stages of the model, going through a series of transformers." [highlight the transformers, quickly step through them]

    case Phase.Input_First: {
        let t0 = T_val('', 0);
        let c = commentary`These vectors now pass through the stages of the model, going through a series of transformers.${t0}`;
        let t1 = atEvent(t0);
        let t1a = afterTime(t1, 0.0, 2.0);
        let t2 = afterTime(t1a, 5, 0.2);

        let blocks = layout.cubes.filter(b => b.t === 'i');
        let pos = lerpSmoothstep(0, blocks.length, t2.t);
        let idx = Math.floor(pos);
        for (let i = Math.min(idx, blocks.length - 1); i >= 0; i--) {
            if (!t2.active) {
                break;
            }
            // blocks that are <= idx should have a falloff applied based on how much they're earlier than idx
            let falloff = 1.0 - (pos - i) / 8;
            if (falloff < 0) {
                break;
            }
            let blk = blocks[i];
            blk.highlight = falloff;
            // blk.access?.enable();
        }
        if (idx < blocks.length - 1) {
            let blk = blocks[idx];
            hideFromBlock(state, layout, blk);
        }

        let height = layout.height;

        if (t2.active && state.walkthrough.running) {
            view.camTarget.z = lerpSmoothstep(0, height, t2.t);
        }

        break;
    }

    // -- Output --
    // "And what's the output? A weighted prediction of the next token in the sequence!" [highlight the 6th element]
    // "And once we've picked the next token, we can place that in the 7th position, and repeat." [slide the output viz to the top; plonk the 7th element at the top; repeat until the end]

    // "And now we have our prediction. A list of correctly sorted numbers." [highlight the source 6 numbers, and output 6 numbers]

    // "Clearly this is a very convoluted way to sort 6 numbers! But it's structure and function are identical to that of GPT-2. Well, besides that small matter of scale..."

    // -- Input detail --

    // "Now lets look at the model in more detail." [highlight the input]

    // "The model is composed of Weights, with this structure of inputs, transformers, and outputs, and here we're also showing all the intermediate results." [highlight the weights, transformers, and intermediate results]
    // "Note that only a small fraction of the intermediate results are actually required at any one time, but we show them all here for clarity." [highlight the intermediate results]

    // "Let's start at the top. To compute the vectors at each time T we do a couple of steps:" [highlight the input]
    case Phase.Input_Detail_Tables: {

        // practice drawing labels on tensors
        let t0_showAll = atTime(0, 0.1, 0.2);

        let tokEmbed = layout.tokEmbedObj;
        console.log(tokEmbed.z, tokEmbed.dz, tokEmbed.z + tokEmbed.dz, tokEmbed.cz);
        drawTextOnModel(state, 'token-embedding matrix', new Vec3(tokEmbed.x - layout.margin, tokEmbed.y, -tokEmbed.z + tokEmbed.dz / 2), {
            align: TextAlignHoriz.Right,
            valign: TextAlignVert.Middle,
            color: new Vec4(0,0,0,1).mul(t0_showAll.t),
            size: 3,
        });
        let posEmbed = layout.posEmbedObj;
        drawTextOnModel(state, 'position-embedding matrix', new Vec3(posEmbed.x + posEmbed.dx + layout.margin, tokEmbed.y, -tokEmbed.z + tokEmbed.dz / 2), {
            align: TextAlignHoriz.Left,
            valign: TextAlignVert.Middle,
            color: new Vec4(0,0,0,1).mul(t0_showAll.t),
            size: 3,
        });

        blockDimension(state, layout, tokEmbed, Dim.X, DimStyle.n_vocab, t0_showAll.t);

    } break;
    case Phase.Input_Detail_TokEmbed: {
        let tStr = T_val('t', 1, 'cmmi12');
        let c = commentary`Let's start at the top. To compute the vectors at each time ${tStr} we do a couple of steps:`;

        moveCameraTo(state, atTime(0), new Vec3(0, 0, 0), new Vec3());
        markDimensions(state, atEvent(tStr), layout.idxObj, Dim.X, DimStyle.T);

        let t0_expandAt0 = atTime(0, 0.1, 0.2);
        let t1_totEq3 = afterTime(t0_expandAt0, 1.0);
        let t2_expandSplit = afterTime(t1_totEq3, 0.1, 0.4);

        let t3_showTokEmIdx = afterTime(t2_expandSplit, 0.2, 1.0);
        let t4_highlightTokEmIdx = afterTime(t3_showTokEmIdx, 0.4, 1.0);
        let t5_iter1Col = afterTime(t4_highlightTokEmIdx, 1.0, 2.0);
        let t6_cleanup1 = afterTime(t5_iter1Col, 0.3, 0.3);

        cleanup(t6_cleanup1, [t0_expandAt0, t2_expandSplit, t4_highlightTokEmIdx, t5_iter1Col]);

        let t7_iterCols = afterTime(t6_cleanup1, 5.0, 0.0);

        // blockDimension(state, layout, layout.residual0, Dim.X, DimStyle.T, 0.5);
        if (t6_cleanup1.t < 1.0) {
            let idx = lerp(0, 3, t1_totEq3.t);
            let split = lerpSmoothstep(t0_expandAt0.t * 1.0, 3.0, t2_expandSplit.t);
            blockIndex(state, layout, layout.residual0, Dim.X, DimStyle.t, idx, split / 2, t0_expandAt0.t);
            splitGridX(layout, layout.residual0, Dim.X, idx + 0.5, split);
            splitGridX(layout, layout.idxObj   , Dim.X, idx + 0.5, split);
        }

        let embedMtx = T_val('token embedding matrix');
        let tokCol = T_val('token');
        commentaryPara(c)`\n\n1. From the ${embedMtx}, select the ${tokCol}'th column.`;

        let embedOffColor = new Vec4(0.5,0.5,0.5).mul(0.6);
        // let embedActiveColor = Vec4.lerp(embedOffColor, new Vec4(0.3,0.3,0.6), t4.t);

        if (layout.model && t7_iterCols.t <= 0.0) {
            let mixes = new Array(layout.tokEmbedObj.cx).fill(0.0);
            mixes[layout.model!.inputBuf[3]] = t4_highlightTokEmIdx.t;
            renderIndexes(state, layout, layout.tokEmbedObj, embedOffColor, t3_showTokEmIdx.t, 3, 0, null, { color2: new Vec4(.3, .3, .5), mixes });
        }

        if (layout.model && t4_highlightTokEmIdx.t > 0 && t6_cleanup1.t <= 1.0) {
            splitGridX(layout, layout.tokEmbedObj, Dim.X, 1, 0);
            layout.tokEmbedObj.subs![1].highlight = lerp(0, 0.2, t4_highlightTokEmIdx.t);
            let T = layout.idxObj.cx;
            state.tokenColors = { color2: new Vec4(.3, .3, .5), mixes: oneHotArray(T, 3, t4_highlightTokEmIdx.t) };
        }

        if (layout.model && t7_iterCols.t < 1.0) {
            hideFromBlock(state, layout, layout.residual0);
        }

        if (layout.model && t5_iter1Col.t > 0.0 && t6_cleanup1.t <= 0.0) {
            let sub = findSubBlocks(layout.residual0, Dim.X, 3, 3)[0];
            if (sub) {
                sub.access = { ...sub.access!, src: layout.model.vocabEmbed.output, disable: false };
                let zPos = t5_iter1Col.t * sub.cz + 0.5;
                splitGridX(layout, sub, Dim.Z, zPos, 0.0);

                for (let vertSubBelow of findSubBlocks(sub, Dim.Z, Math.floor(zPos), null)) {
                    vertSubBelow.access = { ...sub.access, disable: true };
                }
            }
        }


        if (layout.model && t7_iterCols.active) {
            let T = layout.idxObj.cx;
            let C = layout.residual0.cz;

            let tPos = t7_iterCols.t * T;
            let tIdx = Math.floor(tPos);

            let t_inner = tPos - tIdx;
            let cPos = t_inner * C;

            state.tokenColors = { color2: new Vec4(.3, .3, .5), mixes: oneHotArray(T, tIdx, 1.0) };

            splitGridX(layout, layout.residual0, Dim.X, tIdx + 0.5, 0.0);

            let sub = findSubBlocks(layout.residual0, Dim.X, null, tIdx - 1);
            for (let vertSubLeft of sub) {
                vertSubLeft.access = { ...vertSubLeft.access!, disable: false };
            }
            let sub2 = findSubBlocks(layout.residual0, Dim.X, tIdx, tIdx)[0];
            if (sub2) {
                sub2.highlight = 0.2;
                sub2.access = { ...sub2.access!, disable: false };
                let zPos = cPos + 0.5;
                splitGridX(layout, sub2, Dim.Z, zPos, 0.0);

                for (let colSubBelow of findSubBlocks(sub2, Dim.Z, Math.floor(zPos) + 1, null)) {
                    colSubBelow.access = { ...colSubBelow.access!, disable: true };
                }
            }

            let tokIdx = layout.model.inputBuf[tIdx];

            let mixes = oneHotArray(layout.tokEmbedObj.cx, tokIdx, 1.0);
            renderIndexes(state, layout, layout.tokEmbedObj, embedOffColor, t3_showTokEmIdx.t, 3, 0, null, { color2: new Vec4(.3, .3, .5), mixes });

            splitGridX(layout, layout.tokEmbedObj, Dim.X, tokIdx + 0.5, 0);
            let tokSub = findSubBlocks(layout.tokEmbedObj, Dim.X, tokIdx, tokIdx)[0];
            if (tokSub) {
                tokSub.highlight = 0.2;
            }

            splitGridX(layout, layout.posEmbedObj, Dim.X, tIdx + 0.5, 0);
            let posSub = findSubBlocks(layout.posEmbedObj, Dim.X, tIdx, tIdx)[0];
            if (posSub) {
                posSub.highlight = 0.2;
            }
        }

        // fallthrough to continue once the commentary is done
    } break;

    // "1. Select the i'th column of the token embedding matrix." [highlight the i'th column of the embedding matrix for a couple of them]
    // "2. Select the t'th column of the position embedding matrix." [highlight the t'th column of the position embedding matrix for a few of them]
    // "And add them together. Now each vector has some information about the token, and some about it's position, and is ready to enter the transformers." [highlight the addition]

    // -- Transformer detail --

    // "Each transformer is made up of a "self-attention" layer, a "feed-forward" layer, connected to what we'll call the "residual backbone"." [highlight the self-attention layer and the feed-forward layer and backbone]


    // -- Layer normalization --

    // "Before each of these layers, we apply "layer normalization"." [highlight the layer normalization section]
    // "Working on each T separately: we compute its mean & variance" [highlight the mean & variance computation]
    // "We normalize the vector (subtract the mean, divide by the variance)..." [highlight the normalization]
    // "...and then scale and shift it by these weights." [highlight the scaling and shifting]
    // "This almost seems like we're undoing the normalization, but now we have learned mean & stddev, which helps with learning on deep networks."


    // -- Self-attention --

    // "Now we can apply the self-attention layer." [highlight the self-attention layer]
    // "Self-attention is the part of the model where parts of the sequence become visible to each other. Up til now, each T could be processed independently."

    // "Self-attention is made up of several heads. Let's take a look at one." [dim the other heads; expand vertically]
    // "From each of the input vectors, we compute a query, key, and value vector, each of length A." [highlight the query, key, and value]
    // "Each vector at each T is a matrix-vector multiply" [highlight the matrix-vector multiply]
    // "Now comes the core of self-attention. Let's take a look at one of the query vectors." [highlight the query vector]
    // "It's purpose is to find keys from other T's that it should pay attention to."
    // "We compute the dot product (multiply pair-wise; sum) of the query vector with each key vector and scale it by 1 / sqrt(A)." [run the dot product]
    // "The result gives a score for how closely they match, and we store it in the attention matrix." [run the dot product on remaining keys]
    // "One trick here is that we only consider the keys from the past. This is called 'causal attention'."

    // "Now we have a row of scores we want to turn it into a row of numbers that sum to 1. We do this by applying a softmax."
    // "Higher scores will get a larger fraction of that 1, and lower scores will get a smaller fraction."
    // "To perform this, we take exponential of each score, and then divide by the sum of all those values" [highlight the softmax]
    // "As a stability trick, we subtract the max value from each score before taking the exponential. It doesn't change the output though."
    // "Now with this row of scores, we can compute the weighted sum of the value vectors." [highlight the weighted sum]
    // "This gives us a new vector, which has pulled information from other T's that it's interested in and is now ready to be passed on."
    // "We run this process for each key, producing a full set of values for each T." [highlight the full set of values]
    // "And then run the same process for each of the other heads. The different heads will all be looking for different information, but each one can see the entire input." [run the other heads]

    // "Now that we've done this mixing between T's, we're back to processing each one independently."
    // "From each of the heads, we concatenate the values into a single vector." [highlight the concatenation]
    // "GPT models are usually structured so that this vector is the same length as the input vector." [highlight the input vector]
    // "Before returning to the residual backbone, we apply another matrix-vector multiplication. Typically called a projection." [do the matrix-vector multiply]
    // "Unlike other matrix-vector multiplies, this one does not have a bias." [note lack of bias]

    // "Another common feature of modern deep ML networks is the use of the residual connections."
    // "Instead of passing the output of the transformer directly to the next layer, we first add it to the input." [highlight the residual connection]
    // "This occurs at each stage of the transformer, and is called the residual backbone." [highlight the residual backbone]

    // -- Feed forward detail --

    // "The feed-forward layer is a simple matrix-vector multiply with a bias." [highlight the matrix-vector multiply]
    // "Again, we act on each T independently, and expand the vector to 4x it's original size." [highlight the expansion]
    // "Now we apply the activation function. One of the key parts of any neural network, it introduces non-linearity."
    // "A common choice is the ReLU function, which is just the max of 0 and the input." [highlight the ReLU]
    // "However, GPT uses a different activation function called GELU, a smooth approximation to the ReLU." [highlight the GELU]
    // "The activation function is applied to each element of the vector independently." [highlight the activation function]
    // "Now we apply another matrix-vector multiply, going from 4 * T back to T." [highlight the matrix-vector multiply]
    // "This result is added to the residual backbone, and now we're done with the transformer!" [highlight the residual backbone]

    // -- Transformer summary --

    // "So that's the transformer. Composed of the self-attention and feed-forward layers, connected via the residual backbone." [highlight the self-attention layer, feed-forward layer, and residual backbone]
    // "A model is made up of a stack of these transformers, with each one feeding into the next." [highlight the stack of transformers]

    // -- Output --

    // "Finally we get to the output. First we apply the same layer normalization as before." [highlight the layer normalization]
    // "Then we apply a matrix-vector multiply on each vector to produce a vector that's the vocab size. A mere 3 in our case!" [highlight the matrix-vector multiply]

    // "The value of each element gives an indication of how likely it is that the input is that token. Larger ones: more likely." [highlight the value of each element]
    // "We call these our set of logits."
    // "Like in self-attention, we apply a softmax to turn these into probabilities that sum to 1." [highlight the softmax]
    // "So we can look at the hightest probability, and that's our prediction for the next token!" [highlight the highest probability]
    // "We can take the top few options, or randomly pick one (weighted by the probabilities) to get some variation."
    // "We can adjust this a bit by adding a temperature parameter (multiply the logits prior to softmax). Higher temperatures make the lower probabilities more likely." [highlight the temperature parameter]
    // "We've computed values for all T values in the input, but we only care about predicting one token in the future." [highlight the T values in the input]
    // "So if we input 6 tokens, we take the logit for the 6th (not 7th!) token." [highlight the 6th token]
    // "Logits after are meaningless, and logits before are just predicting the input." [highlight the logits after and before]

    // "As in the intro, we're ready to select the token, and feed it back into the top to predict the one after" [highlight the token selection and feeding back into the top]
    }

}


export function modifyCells(state: IRenderState, view: IRenderView, layout: IGptModelLayout) {

    runWalkthrough(state, view, layout);

    if (state.walkthrough.running) {
        state.walkthrough.time += view.dt / 1000;

        if (state.walkthrough.time > state.walkthrough.phaseLength) {
            state.walkthrough.running = false;
            state.walkthrough.time = state.walkthrough.phaseLength;
        }

        view.markDirty();
    }
}
