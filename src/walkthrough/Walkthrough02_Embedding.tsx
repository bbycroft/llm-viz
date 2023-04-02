import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough02_Embedding(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    switch (wt.phase) {
        case Phase.Input_Detail_Embedding:
            let c0 = commentary(wt, null, 0)`
We saw previously how the tokens are mapped to a sequence of integers using a simple lookup table.
These integers, the _token indices_, are the first and only time we see integers in the model. From here on out, we're using floats (decimal numbers).

At each position _t_ in the sequence, we use the token index as an index into the _token embedding matrix_ on the left.
Here, the index selects the appropriate column of that matrix (note we're using 0-based indexing here, so the first column is at index 0).

This produces a column vector of size _C_ = 48, which we describe as the token embedding.

The token embedding column vector is then added to the position embedding column vector, which is also of size _C_ = 48.
This position embedding is a particular column from the _position embedding matrix_ on the right. This time, though, we simply take the column at index _t_.

Note that both of these position and token embeddings are learned during training (indicated by their blue color).

Doing this for each of our tokens in the input sequence produces a matrix of size _T_ x _C_.
The _T_ stands for _time_, i.e., you can think of tokens later in the sequence as later in time.
The _C_ stands for _channel_, but is also often referred to as "feature" or "dimension."

This matrix, which we'll refer to as the _input embedding_ is now ready to be passed down through the model.
This collection of T columns each of length C will become a familiar sight throughout this guide.
`;
    }
}
