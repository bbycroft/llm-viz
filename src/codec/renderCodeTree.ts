import { bitsToBinStr } from "./DeflateDecoder";
import { IDeflateRenderState, IPrefixTree } from "./DeflateRenderModel";
import { makeCanvasFont } from "./deflateRenderHelpers";

interface ICodingTreeArgs {
    renderSymbol: (symbol: number) => [color: string, symStr: string];
    x: number;
    y: number;
    h: number;
}

// the layout of the various parts of the coding tree, to render from.
// allows us to draw arrows to specific parts of the tree, and to highlight elements.
export interface ICodeTreeInfo {
    codeWidth: number;
    args: ICodingTreeArgs;
    cells: ICodeTreeCell[];
}

export interface ICodeTreeCell {
    x: number;
    y: number;
    width: number;
    height: number;
    symbol: number;
    bits: number;
    bitLength: number;
    active?: boolean;
}

export function createCodeTreeInfo(state: IDeflateRenderState, tree: IPrefixTree, args: ICodingTreeArgs): ICodeTreeInfo {
    let ctx = state.ctx;

    let codeWidth = 50;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let lineHeight = 16;
    let numRows = 0;

    let topYPos = 0; // lineHeight / 2 - 3;

    let xPos = 0;
    let yPos = topYPos;

    let cells: ICodeTreeCell[] = [];

    for (let sym of tree.usedSymbols) {

        let bitLength = tree.bitLengths[sym];
        let bits = tree.codes[sym];

        cells.push({
            x: xPos + args.x,
            y: yPos + args.y,
            width: codeWidth,
            height: lineHeight,
            symbol: sym,
            bits: bits,
            bitLength: bitLength,
        });

        yPos += lineHeight;

        numRows++;
        if (yPos > args.h - lineHeight) {
            numRows = 0;
            xPos += codeWidth + 90;
            yPos = topYPos;
        }
    }

    return {
        cells,
        args,
        codeWidth,
    };
}

export function renderCodingTree(state: IDeflateRenderState, treeInfo: ICodeTreeInfo) {
    let ctx = state.ctx;


    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let cell of treeInfo.cells) {
        let midY = cell.y + cell.height / 2;

        let bitStr = bitsToBinStr(cell.bits, cell.bitLength);
        let [color, symStr] = treeInfo.args.renderSymbol(cell.symbol);
        let glowColor = 'rgb(128, 128, 128)';

        let isActive = cell.active || false;

        ctx.font = makeCanvasFont(10);
        fillTextGlow(ctx, bitStr, cell.x, midY, color, glowColor, isActive ? 1 : 0);

        ctx.font = makeCanvasFont(12);
        fillTextGlow(ctx, cell.symbol.toString().padStart(3, ' ') + ' ' + symStr, cell.x + treeInfo.codeWidth, midY, color, glowColor, isActive ? 1 : 0);
    }
}

function fillTextGlow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, glowColor: string, glowSize: number) {
    if (glowSize > 0) {
        ctx.fillStyle = glowColor;
        ctx.filter = `blur(${glowSize}px)`;
        ctx.fillText(text, x, y);
        ctx.filter = 'none';
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}
