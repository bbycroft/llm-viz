import { ensureSigned32Bit, ensureUnsigned32Bit } from "./RiscvInsDecode";

export function regValToStr(val: number) {
    let valU32 = ensureUnsigned32Bit(val);
    let valS32 = ensureSigned32Bit(val);
    let pcHexStr = '0x' + valU32.toString(16).toUpperCase().padStart(8, "0");
    let pcValStr = valS32.toString().padStart(2, "0");
    return pcValStr + '  ' + pcHexStr;
}

export const registerOpts = {
    innerPadX: 0.4,
}
