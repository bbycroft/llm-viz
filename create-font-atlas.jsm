let fs = require('fs');
let path = require('path');
let generateBMFont = require('msdf-bmfont-xml');

function generateBMFontP(name, opts) {
    return new Promise((resolve, reject) => {
        console.log('=== generating', name);
        generateBMFont(name, opts, (error, textures, font) => {
            if (error) {
                reject(error);
            } else {
                resolve([textures, font]);
            }
        });
    });
}

async function generateAndSave(name, opts, sharedName) {

    let [textures, font] = await generateBMFontP(name, opts);

    let idx = 0;
    for (let tex of textures) {
        console.log('saving texture', tex.filename + '.png');
        fs.writeFileSync(tex.filename + '.png', tex.texture);
        idx++;
    }

    console.log('saving font json', font.filename);
    fs.writeFileSync(font.filename, font.data);

    console.log('saving font cfg', opts.reuse);
    fs.writeFileSync(opts.reuse, JSON.stringify(font.settings, null, '\t'));

    return {
        name: path.basename(name, path.extname(name)),
        fontDefFile: path.normalize(font.filename),
        sharedName,
    };
}

let commonOpts = {
    fieldType: 'msdf',
    outputType: 'json',
    filename: 'fonts/font-atlas.png',
    reuse: 'fonts/font-atlas.cfg',
    textureSize: [512, 256],
};

async function runAll() {
    fs.rmSync(commonOpts.reuse, { force: true });

    let files = [];

    files.push(await generateAndSave('fonts/Roboto-Regular.ttf', {
        ...commonOpts,
        charset: '! "#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~‧\\—Σγβσμε',
    }, 'regular'));

    // math italic
    files.push(await generateAndSave('fonts/cmmi12.ttf', {
        ...commonOpts,
        charset: 'xyztcbXYZTCB',
    }, 'math'));

    // symbols
    files.push(await generateAndSave('fonts/cmsy10.ttf', {
        ...commonOpts,
        charset: '-+/()\u00a3\u0070\u00a1\u006a',
    }, 'math'));

    // operators
    files.push(await generateAndSave('fonts/cmr12.ttf', {
        ...commonOpts,
        charset: '=?;:,-.',
    }, 'math'));

    combineAndCopyToOutput(files)
}

function combineAndCopyToOutput(files) {
    let fontData = {
        faces: [],
    };

    for (let { name, fontDefFile, sharedName } of files) {
        let fileContents = fs.readFileSync(fontDefFile, { encoding: 'utf8' });

        let fontSrc = JSON.parse(fileContents);

        fontData.pages = fontSrc.pages;

        let face = {
            name: name,
            common: fontSrc.common,
            info: { ...fontSrc.info,
                charset: fontSrc.info.charset.join(''),
            },
        };

        {
            let charArr = new Int16Array(fontSrc.chars.length * 12);

            let index = 0;
            for (let c of fontSrc.chars) {
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

            face.chars = Buffer.from(charArr.buffer).toString('base64');
        }

        {
            let kerningArr = new Int16Array(fontSrc.kernings.length * 3);
            idx = 0;
            let nonZeroCount = 0;

            for (let k of fontSrc.kernings) {
                if (k.amount === 0) {
                    continue;
                }
                nonZeroCount++;
                for (let x of [k.first, k.second, k.amount]) {
                    kerningArr[idx++] = x;
                }
            }
            kerningArr = kerningArr.slice(0, nonZeroCount * 3);

            face.kernings = Buffer.from(kerningArr.buffer).toString('base64');
        }

        fontData.faces.push(face);
    }

    let result = JSON.stringify(fontData);

    fs.mkdirSync('public/fonts', { recursive: true });
    fs.writeFileSync('public/fonts/font-def.json', result, { encoding: 'utf8' });
    fs.copyFileSync('fonts/font-atlas.png', 'public/fonts/font-atlas.png');
}


runAll().then();
