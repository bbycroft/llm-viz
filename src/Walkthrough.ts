import { IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { IRenderState, IRenderView } from "./render/modelRender";
import { clamp } from "./utils/data";
import { Mat4f } from "./utils/matrix";
import { Vec3 } from "./utils/vector";

export interface IWalkthroughOutput {
    layout: IGptModelLayout;
}

export enum Phase {
    SplitColumn, // will be broader later
}

export function walkthrough() {
    let phase = Phase.SplitColumn;

    // -- Input --
    // "Each token, or word/character, is represented by a number." [sequentially highlight the first few tokens & their numbers]
    // "We could map characters to numbers, or words to numbers, or anything else." [show a char-map, show a gpt-token map; highlight the mappings]
    // "In our case, we only have 3 'words' in our vocabulary: '0', '1', and '2'." [highlight the 3 distinct words] (footnote about Andrej Karpathy's demo example)
    // "And these naturally map to the integers 0, 1, and 2." [highlight the 3 distinct integers]
    // "This tiny model here sorts those numbers into ascending order. Let's see how it works!" [visualize the sort; show the model]

    // "So we put our sequence into an array, ignoring the rest." [highlight the 6 integers]
    // "We convert our sequence of 6 tokens/integers to 48 element vectors. one at each 'time' step." [quick op phase; highlight the 48 element vectors]

    // "These vectors now pass through the stages of the model, going through a series of transformers." [highlight the transformers, quickly step through them]

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


export function modifyCells(state: IRenderState, view: IRenderView, layout: IGptModelLayout) {

    let idxObj = layout.idxObj;
    let residual0 = layout.residual0;

    let offset = 3.5; // ((view.time * 0.004) % (idxObj.cx + 2.0)) - 1.0;
    // view.markDirty();

    let cubes = [...layout.cubes];

    let splitAmt = 3.0;
    let idxBlks = splitGridX(idxObj, offset, splitAmt, layout.cell);
    let residBlks = splitGridX(residual0, offset, splitAmt, layout.cell);

    cubes = [...layout.cubes.filter(a => a !== idxObj && a !== residual0), ...idxBlks, ...residBlks];

    return { layout: { ...layout, cubes } };
}

export function splitGridX(blk: IBlkDef, xSplit: number, splitAmt: number, cell: number) {

    // generate several new blocks (let's say up to 5) that are neighbouring the zSplit point

    // main-left, left, center, right, main-right

    // choose center as floor(zSplit), left is floor(zSplit) - 1, right is floor(zSplit) + 1
    // main-left and main-right are the remaining
    // only create those if there's space

    // The splitAmt governs the overall gap between blocks
    // Want a rotating-block-under-examination effect. When zSplit is right down the center (x + 0.5),
    // have max seperation, and effectively join left & right with their main
    // For non 0.5 zSplits, will show 2 gaps

    let blocks: IBlkDef[] = [];
    let rangeOffsets: [number, number][] = [];

    function addSubBlock(iStart: number, iEnd: number, xOffset: number) {
        if (iStart >= iEnd || iEnd <= 0 || iStart >= blk.cx) {
            return;
        }

        let mtx = Mat4f.fromScaleTranslation(new Vec3((iEnd - iStart) / blk.cx, 1, 1), new Vec3(iStart / blk.cx, 0, 0));

        blocks.push({ ...blk,
            localMtx: mtx,
            x: blk.x + iStart * cell + xOffset,
            dx: (iEnd - iStart) * cell,
        });
        rangeOffsets.push([iEnd, xOffset]);
    }

    let xc = Math.floor(xSplit);
    let scale = 0.5;
    let fract = (xSplit - xc - 0.5) * scale + 0.5;

    // let offset = smoothstepAlt(-w2, 0, xSplit / blk.cx);
    let offset = lerpSmoothstep(-splitAmt, 0, (xSplit - 0.5) * scale + 0.5);

    addSubBlock(0     , xc - 1, offset + 0.0);
    addSubBlock(xc - 1, xc    , offset + lerpSmoothstep(splitAmt, 0, fract + scale));
    addSubBlock(xc    , xc + 1, offset + lerpSmoothstep(splitAmt, 0, fract));
    addSubBlock(xc + 1, xc + 2, offset + lerpSmoothstep(splitAmt, 0, fract - scale));
    addSubBlock(xc + 2, blk.cx, offset + splitAmt);

    blk.rangeOffsetsX = rangeOffsets;

    return blocks;
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * clamp(t, 0, 1);
}

// we lerp after running the smoothstep, and t is clamped to [0, 1]
function lerpSmoothstep(a: number, b: number, t: number) {
    if (t <= 0.0) return a;
    if (t >= 1.0) return b;
    return a + (b - a) * t * t * (3 - 2 * t);
}
