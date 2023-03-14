import { IWalkthrough, Phase } from "./Walkthrough";
import { DimStyle, dimStyleColor, IWalkthroughArgs, phaseTools } from "./WalkthroughTools";
import s from './Walkthrough.module.css';
import { useRenderState } from "../Sidebar";

/*
Need to re-think how we display & interact with the walkthrough. Current approach just doesn't really work at all.

Think I'll a) switch to rendering in HTML, and b) tie the model viz to the scroll position of the walkthrough text.

May have to figure out how to have a sort of vertical caret position. May have it position-able vertically, so the
user can scroll back and forth for the changes, but also specify their vertical reading position.

Will likely chunk the walkthrough into our groups. Main difficulty is how we handle the bottom of the walkthrough page.

How do we pass data from here to the UI?

Guess we just chuck them into a data structure that we can gen into react/html.

-----



*/

interface IIntroState {
    
}

function getIntroState(walkthrough: IWalkthrough): IIntroState {
    return walkthrough.phaseData.get(Phase.Intro_Intro) as IIntroState;
}

export function walkthroughIntro(args: IWalkthroughArgs) {
    let { breakAfter, atEvent, atTime, afterTime, commentary, commentaryPara, c_str } = phaseTools(args.state);
    let { state, layout, walkthrough } = args;


    switch (walkthrough.phase) {
        case Phase.Intro_Intro:

        let c0 = commentary`Welcome to the walkthrough of the GPT large language model! Here we'll explore the model _nano-gpt_, with a mere 85,000 parameters.`;

        let c4 = commentaryPara(c0)`It's goal is a simple one: take a sequence of six letters: ${embed(ExampleInputOutput)}
            and sort them in alphabetical order, i.e. to "ABBBCC".`;

        breakAfter(c4);

        let tokenStr = c_str('_token_', 0, DimStyle.Token);

        let c5 = commentaryPara(c0)`We call each of these letters a ${tokenStr}, and the set of the model's different tokens make up it's _vocabulary_:${embed(TokenVocab)}`;

        breakAfter(c5);

        let c6 = commentaryPara(c0)`From this table, each token is assigned a number. And now we can enter this sequence of numbers into the model:${embed(ExampleTokenValues)}`;

        breakAfter(c6);

        let c6b = commentaryPara(c0)`In the 3d view, the each green cell represents a number being processed, and each blue cell is a weight. Bright: positive, grey: 0, dark: negative. ${embed(GreenBlueCells)}`;

        breakAfter(c6b);

        let c7 = commentaryPara(c0)`Each number in the sequence first gets turned into a 48 element vector. This is called an _embedding_.`;

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

function embed(fc: React.FC) {
    return { insert: () => fc };
}

const ExampleInputOutput: React.FC = () => {
    return <div className={s.tableWrap}>
        <div style={{ color: dimStyleColor(DimStyle.Token).toHexColor() }}>C B A B B C</div>
    </div>;
};

const ExampleTokenValues: React.FC = () => {
     return <div className={s.tableWrap}>
        <div>2 1 0 1 1 2</div>
    </div>;
};

const TokenVocab: React.FC = () => {

    return <div className={s.tableWrap}>
        <table className={s.table}>
            <tbody>
                <tr className={s.tokString}><th>token</th><td>A</td><td>B</td><td>C</td></tr>
                <tr className={s.tokIndex}><th>index</th><td>0</td><td>1</td><td>2</td></tr>
            </tbody>
        </table>
    </div>
};

const GreenBlueCells: React.FC = () => {

    return <div className={s.tableWrap}>
        <div>
            <div>Green Cell: {'[]'} number; being processed</div>
            <div>Blue Cell: {'[]'} number; weight</div>
        </div>
    </div>
};
