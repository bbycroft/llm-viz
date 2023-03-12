import { Phase } from "./Walkthrough";
import { IWalkthroughArgs, phaseTools } from "./WalkthroughTools";

export function walkthroughIntro(args: IWalkthroughArgs) {
    let { breakAfter, atEvent, atTime, afterTime, commentary, commentaryPara } = phaseTools(args.state);
    let { state, layout, walkthrough } = args;


    switch (walkthrough.phase) {
        case Phase.Intro_Intro:

        let c0 = commentary`Welcome to the walkthrough of the GPT large language model (LLM).
            This architecture is of particular interest because it is what powers the OpenAI GPT-3 language model, including the impressive ChatGPT.`;

        // let t0 = afterTime(c0, 0.5);
        breakAfter(c0);

        let c2 = commentaryPara(c0)`Here we're focusing on inference: the process of generating text from the model. The other side of ML,
            training, is not covered here.`;

        breakAfter(c2);

        let c3 = commentaryPara(c0)`The model we'll explore here is aptly named _nano_-gpt, several orders of magnitude smaller than the serious LLM's, and a lot easier to digest.`;

        breakAfter(c3);

        let c4 = commentaryPara(c0)`It's goal, being so small, is a simple one: take a sequence of six letters, using 'A', 'B', and 'C' such as "CABACA"
            and sort them in alphabetical order, i.e. "AAABCC".`;

        breakAfter(c4);

        let c5 = commentaryPara(c0)`We call each of these letters a "token", and is the model's vocabulary. I.e. a mere size of 3. For larger models, these could be
            the 26 letters of the alphabet, or the 1000 most common words in English.`;

        breakAfter(c5);

        let c6 = commentaryPara(c0)`Each token in the sequence is assigned a number, and our 'A', 'B', C' naturally map to 0, 1, 2. Now they're ready to enter the model.`;

        breakAfter(c6);

        let c7 = commentaryPara(c0)`Each number in our sequence, (2, 0, 1, 0, 2, 0), first gets turned into a 48 element vector — just a list of numbers —. This is called an embedding.`;

        breakAfter(c7);

        let c8 = commentaryPara(c0)`The embedding is then passed through the model, going through a series of layers, called transformers, before reaching the bottom.`;

        breakAfter(c8);

        let c9 = commentaryPara(c0)`So what's the output? A prediction of the next token in the sequence. So at the 6th entry, we get probabilities that the next token is
            going to be 'A', 'B', or 'C'.`
         
        breakAfter(c9);

        let c10 = commentaryPara(c0)`In this case, the model is pretty sure it's going to be 'A'.`;

        break;
    }

}
