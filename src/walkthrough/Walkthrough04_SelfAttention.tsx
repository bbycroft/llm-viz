import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough04_SelfAttention(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    switch (wt.phase) {
        case Phase.Input_Detail_SelfAttention:
            let c0 = commentary(wt, null, 0)`

The self-attention layer is perhaps the heart of the Transformer and of GPT. It's the phase where the
columns in our input embedding matrix "talk" to each other. Up until now, and in all other phases,
the columns can be regarded independently.

The self-attention layer is made up of several heads, and we'll focus on one of them for now.

The first step is to produce three vectors for each column in the normalized input embedding matrix.
These vectors are:

The query (Q) vector.
The key (K) vector.
The value (V) vector.

To produce one of these vectors, we perform a matrix-vector multiplication with a bias added. Each
output cell is some linear combination of the input vector. This is done with a dot product between
a row of the Q-weight matrix and the input column vector.

[Aside]
The dot product operation, which you'll see a lot of, is quite simple: We pair each element from
the first vector with the corresponding element from the second vector and then add those together.

This is a general and simple way of ensuring each output element can be influenced by all the
elements in the input vector (where that influence is determined by the weights). Hence its frequent
appearance in neural networks.
[/Aside]

Now that we have our Q, K, and V vectors for all the input columns, what do we do with them? Let's
continue looking at the 4th column (t = 3):

It would like to find relevant information from other columns and extract their values (V). The other
columns have a K vector, which represents the sort of information that column has, and our Q vector
is what sort of information is relevant to us.

So we are sort of doing a search on other columns by querying other columns' keys. And then we can
pull in the values from the most interesting columns.

How do we do this in practice? It requires a few steps, and we'll go through them one by one.

The first is a dot product between the Q vector and the K vectors of the other columns. This dot
product can be interpreted slightly differently from the previous matrix-vector multiplication
(although the operation is identical!). It's a way of measuring the similarity between the two
vectors. If they're very similar, the dot product will be large. If they're very different, the dot
product will be small or negative.

Doing this for our column (t = 3) produces a row (t = 3) in the self-attention matrix, and we can
think of each of these elements as scores.

You'll notice that we only fill in the first 4 elements of the row. This is because we're running a
process of causal self-attention. In other words, we're only allowed to look in the past.

Another key element is that after the dot product, we divide by the square root of the length of the
Q/K/V vectors. This is done to scale the dot product, preventing large values from dominating the
softmax operation in the next step.

Running this process for all the columns produces our self-attention matrix, which is a square
matrix, T x T, and due to the causal nature of the process, is a lower triangular matrix.

We'll briefly skip over the softmax operation (described in the next section); suffice it to say,
each row is normalized to sum to 1.

Finally, we can produce the output vector for our column (t = 3). We look at the (t = 3) row of the
normalized self-attention matrix and for each element, multiply the corresponding V vector of the
other columns element-wise.
Then we can add these up to produce the output vector. Thus, the output vector will be dominated by
V vectors from columns that have high scores.

And that's the process for a head of the self-attention layer. So the main goal of self-attention is
that each column wants to find relevant information from other columns and extract their values, and
does so by comparing its _query_ vector to the _keys_ of those other columns. With the added restriction
that it can only look in the past.
`;
    }
}
