const fs = require('fs');
const path = require('path');

function genImmValues(nBits) {
    let mask = nBits === 32 ? 0xFFFFFFFF : (1 << nBits) - 1;

    let values = [0, mask];
    for (let i = 0; i < nBits; i++) {
        values.push(1 << i);
    }

    for (let i = 0; i < nBits; i++) {
        values.push(~(1 << i) & mask);
    }

    for (let i = 0; i < nBits - 1; i++) {
        values.push((1 << i) - 1);
    }

    for (let i = 0; i < nBits - 1; i++) {
        values.push(~((1 << i) - 1) & mask);
    }

    for (let i = 0; i < nBits - 1; i++) {
        values.push((1 << i) | (1 << (i + 1)));
    }

    for (let i = 0; i < nBits - 1; i++) {
        values.push(~((1 << i) | (1 << (i + 1))) & mask);
    }

    let signExtendFn = nBits === 12 ? signExtend12to32 : nBits === 20 ? signExtend20to32 : (v) => v;

    for (let i = 0; i < values.length; i++) {
        values[i] = signExtendFn(values[i]);
    }

    for (let v of values) {
        console.log((v & mask).toString(2).padStart(nBits, '0'));
    }

    return values;
}

function signExtend12to32(value) {
    return value & 0x800 ? value | 0xFFFFF000 : value;
}

function signExtend20to32(value) {
    return value & 0x80000 ? value | 0xFFF00000 : value;
}

function genSection(name, values, fn) {
    let str = `
#define SECNAME ${name}
SECTION2()
`;
    for (let i = 0; i < values.length; i++) {
        str += '  ' + fn(values[i], i) + '\n';
    }
    str += `  j SUCCESS
END_SECTION2()
#undef SECNAME
`;

    return str;
}

function genFile() {
    let str = `
#include "helpers.h"
._start:
`;

    str += genSection('imm0_itype_li', genImmValues(12), (v, i) => `li x${(i % 31) + 1}, ${v}`);
    str += genSection('imm1_itype_lb', genImmValues(12), (v, i) => `lb x0, ${v}(x0)`);
    str += genSection('imm2_stype_sb', genImmValues(12), (v, i) => `sb x0, ${v}(x0)`);
    str += genSection('imm2_btype_bne', genImmValues(12).map(a => a << 1), (v, i) => `bne x0, x0, ${v}`);
    str += genSection('imm2_utype_lui', genImmValues(20).map(a => a << 12), (v, i) => `lui x1, %hi(${v})`);
    str += genSection('imm2_jtype_jal', genImmValues(20).map(a => a << 1), (v, i) => `jal x0, ${v}`);

    return str;
}

function main() {
    let str = genFile();
    let destFileDir = path.join(__dirname, 'imm_validation.S');
    fs.writeFileSync(destFileDir, str);
}

main();
