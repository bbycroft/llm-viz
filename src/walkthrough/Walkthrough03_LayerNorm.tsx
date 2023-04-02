import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough03_LayerNorm(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    switch (wt.phase) {
        case Phase.Input_Detail_LayerNorm:
            let c0 = commentary(wt, null, 0)`

The _input embedding_ matrix from the previous section is the input to our first Transformer block.

The first step in the Transformer block is to apply _layer normalization_ to this matrix. This is an
operation that normalizes the values in each column of the matrix separately.

Normalization is an important step in the training of deep neural networks, and it helps improve the
stability of the model during training.

We can regard each column separately, so let's focus on the 3rd column (t = 2) for now. The goal is
to make the average value in the column equal to 0 and the standard deviation equal to 1. To do this,
we find both of these quantities for the column and then subtract the average and divide by the standard deviation.

The notation we use here is E[x] for the average and Var[x] for the variance (of the column). The
variance is simply the standard deviation squared. The epsilon term (1e-5) is there to prevent division by zero.

We compute and store these two values in our aggregation layer since we're applying them to all values in the column.
Note that we store 1/sqrt(Var[x] + epsilon) rather than sqrt(Var[x] + epsilon), as multiplication is faster
than division [though it's unlikely to make a difference here!].

Finally, once we have the normalized values, we multiply each element in the column by a learned
weight (&gamma;) and then add a bias (&beta;) value.
In a sense, these operations undo the normalization, but they also
allow the model to learn and fine-tune the scale and shift of the values, which helps it better capture
the underlying patterns in the data.

We run this normalization operation on each column of the input embedding matrix, and the result is
the normalized input embedding, which is ready to be passed into the Self-Attention layer.
`;
    }
}
