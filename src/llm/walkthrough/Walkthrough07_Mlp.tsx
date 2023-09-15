import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough07_Mlp(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    if (wt.phase !== Phase.Input_Detail_Mlp) {
        return;
    }
    let c0 = commentary(wt, null, 0)`

The next half of the transformer block, after the self-attention, is the MLP (multi-layer
perceptron). A bit of a mouthful, but here it's a simple neural network with two layers.

Like with self-attention, we perform a layer normalization before the vectors enter the MLP.

In the MLP, we put each of our column vectors (independently) through:

1. A linear transformation (matrix multiplication) with a bias added, to a vector of length 4 * C
2. A GELU activation function (element-wise)
3. A linear transformation (matrix multiplication) with a bias added, back to a vector of length C

It's also common to refer to this as a "feed-forward" network, since the data flows through it in a
single direction.

The output of the MLP is then added to the input of the MLP, continuing the residual pathway. 
`;

}
