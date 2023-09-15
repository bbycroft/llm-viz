import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough09_Output(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    if (wt.phase !== Phase.Input_Detail_Output) {
        return;
    }
    let c0 = commentary(wt, null, 0)`

Finally, we come to the end of the model. The output of the final transformer block is passed through
a layer normalization, and then we use a linear transformation (matrix multiplication), this time without a bias.

This final transformation takes each of our column vectors from length C to length nvocab. Hence,
it's effectively producing a score for each word in the vocabulary for each of our columns. These
scores have a special name: logits.

The name "logits" comes from "log-odds," i.e., the logarithm of the odds of each token. "Log" is
used because the softmax we apply next does an exponentiation to convert to "odds" or probabilities.

To convert these scores into nice probabilities, we pass them through a softmax operation. Now, for
each column, we have a probability the model assigns to each word in the vocabulary.

In this particular model, it has effectively learned all the answers to the question of how to sort
three letters, so the probabilities are heavily weighted toward the correct answer.

When we're stepping the model through time, we use the last column's probabilities to determine the
next token to add to the sequence. For example, if we've supplied six tokens into the model, we'll
use the output probabilities of the 6th column.

This column's output is a series of probabilities, and we actually have to pick one of them to use
as the next in the sequence. We do this by "sampling from the distribution." That is, we randomly
choose a token, weighted by its probability. For example, a token with a probability of 0.9 will be
chosen 90% of the time.

There are other options here, however, such as always choosing the token with the highest probability.

We can also control the "smoothness" of the distribution by using a temperature parameter. A higher
temperature will make the distribution more uniform, and a lower temperature will make it more
concentrated on the highest probability tokens.

We do this by dividing the logits (the output of the linear transformation) by the temperature before
applying the softmax. Since the exponentiation in the softmax has a large effect on larger numbers,
making them all closer together will reduce this effect.
`;

}
