let fs = require('fs');

// Creating the font file:
// $ yarn run msdf-bmfont -i fonts/ascii_chars.txt -m 512,256 -f json -o fonts/font-atlas.bmf fonts/Roboto-Regular.ttf

// We then do some processing to not make it huge.
// Note the ordering of the char array is now important

let fileContents = fs.readFileSync('fonts/Roboto-Regular.json', { encoding: 'utf8' });

let font = JSON.parse(fileContents);

{
    let charArr = new Int16Array(font.chars.length * 12);

    let index = 0;
    for (let c of font.chars) {
        let order = [c.id,
            c.index,
            c.char.codePointAt(0),
            c.x,
            c.y,
            c.width,
            c.height,
            c.xoffset,
            c.yoffset,
            c.xadvance,
            c.page,
            c.chnl];

        for (let x of order) {
            charArr[index++] = x;
        }
    }

    font.chars = Buffer.from(charArr.buffer).toString('base64');
}

font.info.charset = font.info.charset.join('');

{
    let kerningArr = new Int16Array(font.kernings.length * 3);
    idx = 0;
    let nonZeroCount = 0;

    for (let k of font.kernings) {
        if (k.amount === 0) {
            continue;
        }
        nonZeroCount++;
        for (let x of [k.first, k.second, k.amount]) {
            kerningArr[idx++] = x;
        }
    }
    kerningArr = kerningArr.slice(0, nonZeroCount * 3);

    font.kernings = Buffer.from(kerningArr.buffer).toString('base64');
}

let result = JSON.stringify(font);

fs.mkdirSync('public/fonts', { recursive: true });
fs.writeFileSync('public/fonts/Roboto-Regular.json', result, { encoding: 'utf8' });
fs.copyFileSync('fonts/font-atlas.png', 'public/fonts/font-atlas.png');
