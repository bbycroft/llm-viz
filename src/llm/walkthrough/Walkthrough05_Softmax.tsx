import { Vec3 } from "@/src/utils/vector";
import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs, setInitialCamera } from "./WalkthroughTools";

export function walkthrough05_Softmax(args: IWalkthroughArgs) {
    let { walkthrough: wt, state } = args;

    if (wt.phase !== Phase.Input_Detail_Softmax) {
        return;
    }

    setInitialCamera(state, new Vec3(-24.350, 0.000, -1702.195), new Vec3(283.100, 0.600, 1.556));

    let c0 = commentary(wt, null, 0)`

The softmax operation is used as part of self-attention, as seen in the previous section, and it
will also appear at the very end of the model.

Its goal is to take a vector and normalize its values so that they sum to 1.0. However, it's not as
simple as dividing by the sum. Instead, each input value is first exponentiated.

  a = exp(x_1)

This has the effect of making all values positive. Once we have a vector of our exponentiated
values, we can then divide each value by the sum of all the values. This will ensure that the sum
of the values is 1.0. Since all the exponentiated values are positive, we know that the resulting
values will be between 0.0 and 1.0, which provides a probability distribution over the original values.

That's it for softmax: simply exponentiate the values and then divide by the sum.

However, there's a slight complication. If any of the input values are quite large, then the
exponentiated values will be very large. We'll end up dividing a large number by a very large number,
and this can cause issues with floating-point arithmetic.

One useful property of the softmax operation is that if we add a constant to all the input values,
the result will be the same. So we can find the largest value in the input vector and subtract it
from all the values. This ensures that the largest value is 0.0, and the softmax remains numerically
stable.

Let's take a look at the softmax operation in the context of the self-attention layer. Our input
vector for each softmax operation is a row of the self-attention matrix (but only up to the diagonal).

Like with layer normalization, we have an intermediate step where we store some aggregation values
to keep the process efficient.

For each row, we store the max value in the row and the sum of the shifted & exponentiated values.
Then, to produce the corresponding output row, we can perform a small set of operations: subtract the
max, exponentiate, and divide by the sum.

What's with the name "softmax"? The "hard" version of this operation, called argmax, simply finds
the maximum value, sets it to 1.0, and assigns 0.0 to all other values. In contrast, the softmax
operation serves as a "softer" version of that. Due to the exponentiation involved in softmax, the
largest value is emphasized and pushed towards 1.0, while still maintaining a probability distribution
over all input values. This allows for a more nuanced representation that captures not only the most
likely option but also the relative likelihood of other options.
`;

}
