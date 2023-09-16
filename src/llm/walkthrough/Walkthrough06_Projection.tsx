import { Vec3 } from "@/src/utils/vector";
import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs, setInitialCamera } from "./WalkthroughTools";

export function walkthrough06_Projection(args: IWalkthroughArgs) {
    let { walkthrough: wt, state } = args;

    if (wt.phase !== Phase.Input_Detail_Projection) {
        return;
    }

    setInitialCamera(state, new Vec3(-73.826, 0.000, -220.585), new Vec3(290.600, -11.400, 2.979));

    let c0 = commentary(wt, null, 0)`

After the self-attention process, we have outputs from each of the heads. These outputs are the
appropriately mixed V vectors, influenced by the Q and K vectors.

To combine the vectors from each head, we simply stack them on top of each other. So, for time
t = 4, we go from 3 vectors of length 16 to 1 vector of length 48.

It's worth noting that in GPT, the length of the vectors within a head (16) is equal to C / nheads.
This ensures that when we stack them back together, we get the original length, C.

From here, we perform the projection to get the output of the layer. This is a simple matrix-vector
multiplication on a per-column basis, with a bias added.

Now we have the output of the self-attention layer. Instead of passing this output directly to the
next phase, we add it element-wise to the input embedding. This process, denoted by the green
vertical arrow, is called the residual connection or residual pathway.

Like layer normalization, the residual pathway is crucial for enabling effective learning in deep
neural networks.
`;

}
