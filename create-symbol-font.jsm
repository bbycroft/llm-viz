const fs = require('fs');
const path = require('path');
const SVGIcons2SVGFontStream = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');

const svgDir = 'fonts/symbols-svg/'; // Replace with your SVG icons directory
const outputFontPath = 'fonts/symbols.ttf'; // Replace with your desired output TTF font file path

const fontStream = new SVGIcons2SVGFontStream({
  fontName: 'Symbols',
});

let fontData = '';

fontStream
  .on('data', (chunk) => {
    fontData += chunk;
  })
  .on('end', () => {
    const ttfFont = svg2ttf(fontData, {});
    fs.writeFileSync(outputFontPath, Buffer.from(ttfFont.buffer));
    console.log(`TTF font successfully created at: ${outputFontPath}`);
  })
  .on('error', (err) => {
    console.error('Error generating font:', err);
  });

fs.readdirSync(svgDir).forEach((file) => {
  if (path.extname(file) === '.svg') {
    const glyph = fs.createReadStream(path.join(svgDir, file));
    glyph.metadata = {
      unicode: [String.fromCharCode(0xe000 + file.charCodeAt(0))], // Generate a Unicode character based on the file name
      name: path.basename(file, '.svg'),
    };
    fontStream.write(glyph);
  }
});

fontStream.end();