import { Phase } from "./Walkthrough";
import { commentary, IWalkthroughArgs } from "./WalkthroughTools";

export function walkthrough01_Prelim(args: IWalkthroughArgs) {
    let { walkthrough: wt } = args;

    switch (wt.phase) {
        case Phase.Intro_Prelim:

            let c0 = commentary(wt, null, 0)`
            Before we delve into the algorithm's intricacies, let's take a brief step back.

This guide focuses on _inference_, not training, and as such is only a small part of the entire machine learning process.
In our case, the model's weights have been pre-trained, and we use the inference process to generate output. This runs directly in your browser (utilizing your GPU).

The model showcased here is part of the GPT (generative pre-trained transformer) family, which can be described as a "context-based token predictor".
OpenAI introduced this family in 2018, with notable members such as GPT-2, GPT-3, and GPT-3.5 Turbo, the latter being the foundation of the widely-used ChatGPT.
It might also be related to GPT-4, but specific details remain unknown.

Another similar model is BERT (bidirectional encoder representations from transformers), a "context-aware text encoder" commonly
used for tasks like document classification and search.  Newer models like Facebook's LLaMA (large language model architecture), continue to use
a similar transformer architecture, albeit with some minor differences.

This guide was inspired by the minGPT GitHub project, a minimal GPT implementation in PyTorch created by Andrej Karpathy.
His YouTube series "Neural Networks: Zero to Hero" and the minGPT project have been invaluable resources in the creation of this
guide. The toy model featured here is based on one found within the minGPT project.

Alright, let's get started!
`;
    }
}