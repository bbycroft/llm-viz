import { Vec3 } from "@/src/utils/vector";
import { Phase } from "./Walkthrough";
import { commentary, DimStyle, IWalkthroughArgs, setInitialCamera } from "./WalkthroughTools";

export function walkthrough07_Mlp(args: IWalkthroughArgs) {
    let { walkthrough: wt, state, tools: { afterTime, c_blockRef, c_dimRef } } = args;

    if (wt.phase !== Phase.Input_Detail_Mlp) {
        return;
    }

    let block = state.layout.blocks[0];

    setInitialCamera(state, new Vec3(-154.755, 0.000, -460.042), new Vec3(289.100, -8.900, 2.298));
    wt.dimHighlightBlocks = [block.ln2.lnResid, block.mlpAct, block.mlpFc, block.mlpFcBias, block.mlpFcWeight, block.mlpProjBias, block.mlpProjWeight, block.mlpResult, block.mlpResidual];

    commentary(wt, null, 0)`

The next half of the transformer block, after the self-attention, is the MLP (multi-layer
perceptron). A bit of a mouthful, but here it's a simple neural network with two layers.

Like with self-attention, we perform a ${c_blockRef('layer normalization', block.ln2.lnResid)} before the vectors enter the MLP.

In the MLP, we put each of our ${c_dimRef('C = 48', DimStyle.C)} length column vectors (independently) through:

1. A ${c_blockRef('linear transformation', block.mlpFcWeight)} with a ${c_blockRef('bias', block.mlpFcBias)} added, to a vector of length ${c_dimRef('4 * C', DimStyle.C4)}.

2. A GELU activation function (element-wise)

3. A ${c_blockRef('linear transformation', block.mlpProjWeight)} with a ${c_blockRef('bias', block.mlpProjBias)} added, back to a vector of length ${c_dimRef('C', DimStyle.C)}

It's also common to refer to this as a "feed-forward" network, since the data flows through it in a
single direction.

The output of the MLP is then added to the input of the MLP, continuing the residual pathway.
`;

}
