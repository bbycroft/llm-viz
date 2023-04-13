import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough08_Transformer(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    if (wt.phase !== Phase.Input_Detail_Transformer) {
        return;
    }
    let c0 = commentary(wt, null, 0)`
        
And that's a complete transformer block!

These form the bulk of any GPT model and are repeated a number of times, with the output of one
block feeding into the next, continuing the residual pathway.

As is common in deep learning, it's hard to say exactly what each of these layers is doing, but we
have some general ideas: the earlier layers tend to focus on learning
lower-level features and patterns, while the later layers learn to recognize and understand
higher-level abstractions and relationships. In the context of natural language processing, the
lower layers might learn grammar, syntax, and simple word associations, while the higher layers
might capture more complex semantic relationships, discourse structures, and context-dependent meaning.

`;

}
