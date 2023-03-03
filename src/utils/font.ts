import { base64ToArrayBuffer } from "./data";
import { Mat4f } from "./matrix";
import { createShaderProgram, ensureShadersReady, IGLContext } from "./shader";
import { Vec4 } from "./vector";

export interface ICharDef {
    id: number;
    index: number;
    char: string;
    x: number;
    y: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    page: number;
    chnl: number;
}

export interface IKerningDef {
    first: number;
    second: number;
    amount: number;
}

export interface IFontCommonDef {
    lineHeight: number;
    base: number;
    scaleW: number;
    scaleH: number;
    pages: number;
    // assume multi-color msdf font
}

const floatsPerSegment = 16 + 4;

const floatsPerVert = 5;
const floatsPerGlyph = floatsPerVert * 6;

const bytesPerVert = floatsPerVert * 4;
const bytesPerGlyph = floatsPerGlyph * 4;

export interface IFontBuffers {
    atlas: IFontAtlas;
    vertVbo: WebGLBuffer;
    vao: WebGLVertexArrayObject;
    transformTex: WebGLTexture;
    localVertBuffer: Float32Array;
    localTexBuffer: Float32Array;
    glpyhCapacity: number;
    glyphsUsed: number;
    segmentsUsed: number;
    segmentCapacity: number;
}

export type IFontAtlas = ReturnType<typeof setupFontAtlas>;

export interface IFontAtlasData {
    fontAtlasImage: HTMLImageElement;
    fontDef: any;
}

export async function fetchFontAtlasData(): Promise<IFontAtlasData> {
    let imgEl = document.createElement('img');
    let imgP = new Promise<HTMLImageElement>((resolve, reject) => {
        imgEl.onload = () => resolve(imgEl);
        imgEl.onerror = () => reject();
    });
    imgEl.src = 'fonts/font-atlas.png';

    let fontDefP = fetch('fonts/Roboto-Regular.json', { credentials: 'include', mode: 'no-cors' }).then(r => r.json());

    let [fontAtlasImage, fontDef] = await Promise.all([imgP, fontDefP]);

    return {
        fontAtlasImage,
        fontDef,
    };
}

export function setupFontAtlas(ctx: IGLContext, data: IFontAtlasData) {
    let gl = ctx.gl;

    // With the fontDef, create a char -> glyph lookup
    // Create a kerning lookup (could use x1 * b + x2 for the keys)
    let fontDef = data.fontDef;

    let atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.fontAtlasImage);


    // See https://github.com/Chlumsky/msdfgen for information on how to implement (this is the format the font atlas is in)

    let program = createShaderProgram(ctx.shaderManager, 'font', /*glsl*/`#version 300 es
        precision highp float;
        uniform mat4 u_view;
        uniform mat4 u_model;
        uniform sampler2D u_transformTex;
        layout (location = 0) in vec2 a_position;
        layout (location = 1) in vec2 a_uv;
        layout (location = 2) in float a_textId;
        out vec2 v_uv;
        out vec4 v_fgColor;
        out vec4 v_bgColor;

        void main() {
            int texWidth = textureSize(u_transformTex, 0).x;
            int texOffset = int(a_textId) * ${floatsPerSegment / 4};
            int y = texOffset / texWidth;
            int x = texOffset - y * texOffset;
            vec4 t0 = texelFetch(u_transformTex, ivec2(x + 0, y), 0);
            vec4 t1 = texelFetch(u_transformTex, ivec2(x + 1, y), 0);
            vec4 t2 = texelFetch(u_transformTex, ivec2(x + 2, y), 0);
            vec4 t3 = texelFetch(u_transformTex, ivec2(x + 3, y), 0);
            vec4 c = texelFetch(u_transformTex, ivec2(x + 4, y), 0);
            mat4 transform = mat4(t0, t1, t2, t3);

            gl_Position = u_view * u_model * transform * vec4(a_position, 0.0, 1.0);
            v_uv = a_uv;
            v_fgColor = c;
            v_bgColor = vec4(0, 0, 0, 0);
        }

    `, /*glsl*/`#version 300 es
        precision highp float;
        uniform sampler2D u_tex;
        uniform float pxRange; // set to distance field's pixel range
        in vec2 v_uv;
        in vec4 v_fgColor;
        in vec4 v_bgColor;
        out vec4 color;

        float median(float r, float g, float b) {
            return max(min(r, g), min(max(r, g), b));
        }

        float screenPxRange() {
            vec2 unitRange = vec2(pxRange) / vec2(textureSize(u_tex, 0));
            vec2 screenTexSize = vec2(1.0) / fwidth(v_uv);
            return max(0.5*dot(unitRange, screenTexSize), 1.0);
        }

        void main() {
            vec3 msd = texture(u_tex, v_uv).rgb;
            float sd = median(msd.r, msd.g, msd.b);
            float screenPxDistance = screenPxRange()*(sd - 0.5);
            float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);
            if (opacity == 0.0) {
                discard;
            }
            color = mix(v_bgColor, v_fgColor, opacity);
        }
    `, ['u_view', 'u_model', 'u_tex', 'u_transformTex', 'pxRange'])!;

    ensureShadersReady(ctx.shaderManager);

    let locs = program.locs;
    gl.useProgram(program.program);
    gl.uniform1i(locs.u_tex, 0);
    gl.uniform1i(locs.u_transformTex, 1);

    let charArr = new Int16Array(base64ToArrayBuffer(fontDef.chars));

    let perCharSize = 12;
    let numChars = charArr.length / perCharSize;

    let charMap = new Map<string, ICharDef>();
    let charCodeMap = new Map<number, ICharDef>();
    let chars: ICharDef[] = [];
    for (let i = 0; i < numChars; i++) {
        let offset = i * perCharSize;
        let char: ICharDef = {
            id: charArr[offset + 0],
            index: charArr[offset + 1],
            char: String.fromCharCode(charArr[offset + 2]),
            x: charArr[offset + 3],
            y: charArr[offset + 4],
            width: charArr[offset + 5],
            height: charArr[offset + 6],
            xoffset: charArr[offset + 7],
            yoffset: charArr[offset + 8],
            xadvance: charArr[offset + 9],
            page: charArr[offset + 10],
            chnl: charArr[offset + 11],
        };
        charMap.set(char.char, char);
        charCodeMap.set(char.id, char);
        chars.push(char);
    }

    let kernArr = new Int16Array(base64ToArrayBuffer(fontDef.kernings));

    let perKernSize = 3;
    let numKerns = kernArr.length / perKernSize;

    let kernMap = new Map<string, number>();

    for (let i = 0; i < numKerns; i++) {
        let offset = i * perKernSize;
        let kern = {
            first: kernArr[offset + 0],
            second: kernArr[offset + 1],
            amount: kernArr[offset + 2],
        };
        let firstChar = charCodeMap.get(kern.first)!.char;
        let secondChar = charCodeMap.get(kern.second)!.char;
        kernMap.set(`${firstChar}${secondChar}`, kern.amount);
    }

    return {
        gl,
        kernMap,
        charMap,
        common: fontDef.common as IFontCommonDef,
        program: program,
        atlasTex,
    };
}

export function createFontBuffers(atlas: IFontAtlas): IFontBuffers {
    let gl = atlas.gl;

    let segmentCapacity = 1024;
    let glpyhCapacity = 1024;

    let transformTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, transformTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // we'll fill it in later
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, segmentCapacity, 4, 0, gl.RGBA, gl.FLOAT, null);

    // Just using 1 buffer for all text for now
    let vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, glpyhCapacity * bytesPerGlyph, gl.DYNAMIC_DRAW);
    let localVertBuffer = new Float32Array(glpyhCapacity * floatsPerGlyph);
    let localTexBuffer = new Float32Array(segmentCapacity * floatsPerSegment);

    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, bytesPerVert, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, bytesPerVert, 8);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, bytesPerVert, 16);

    return {
        atlas,
        vertVbo: vbo,
        vao,
        transformTex,
        localVertBuffer,
        localTexBuffer,
        glpyhCapacity,
        glyphsUsed: 0,
        segmentsUsed: 0,
        segmentCapacity: 1024,
    };
}

 // Fudge factor to get it the same as HTML/CSS at the same px size
let scaleFudgeFactor = 1.04;

export function measureTextWidth(fontBuf: IFontBuffers, text: string, scale: number = 1.0) {
    let font = fontBuf.atlas;
    let x = 0;
    let prevCodePoint = '';
    for (let codePoint of text) {
        let charDef = font.charMap.get(codePoint);
        if (!charDef) {
            continue;
        }
        let kernKey = `${prevCodePoint}${codePoint}`;
        let kernAmount = font.kernMap.get(kernKey) || 0;
        x += kernAmount + charDef.xadvance;
        prevCodePoint = codePoint;
    }
    return x * scale / font.common.lineHeight * scaleFudgeFactor;
}

let _bufCache = new Float32Array(1024 * floatsPerGlyph);

export function writeTextToBuffer(fontBuf: IFontBuffers, text: string, color: Vec4, dx?: number, dy?: number, scale?: number, mtx?: Mat4f) {
    let atlas = fontBuf.atlas;

    if (text.length * floatsPerGlyph > _bufCache.length) {
        _bufCache = new Float32Array(text.length * floatsPerGlyph);
    }
    let segmentId = fontBuf.segmentsUsed;
    let buf = _bufCache;
    let bufIdx = 0;
    let atlasWInv = 1.0 / atlas.common.scaleW;
    let atlasHInv = 1.0 / atlas.common.scaleH;
    let numGlyphs = 0;
    let x = dx ?? 0;
    let y = dy ?? 0;
    let prevCodePoint = '';
    scale = scale ?? 1.0;
    let localScale = scale / atlas.common.lineHeight * scaleFudgeFactor;
    for (let codePoint of text) {
        let charDef = atlas.charMap.get(codePoint);
        if (!charDef) {
            // TODO: Handle missing characters e.g. use a default character
            continue;
        }
        let kernKey = `${prevCodePoint}${codePoint}`;
        let kernAmount = atlas.kernMap.get(kernKey) || 0;
        x += kernAmount * localScale;

        let ux = [charDef.x * atlasWInv, (charDef.x + charDef.width) * atlasWInv];
        let uy = [charDef.y * atlasHInv, (charDef.y + charDef.height) * atlasHInv];

        let px = [x + charDef.xoffset * localScale, x + (charDef.xoffset + charDef.width) * localScale];
        let py = [y + charDef.yoffset * localScale, y + (charDef.yoffset + charDef.height) * localScale];

        let tri = [0, 1,  0, 0,  1, 1,  1, 1,  0, 0,  1, 0];
        for (let i = 0; i < 6; i++) {
            let ix = tri[i * 2];
            let iy = tri[i * 2 + 1];
            buf[bufIdx++] = px[ix];
            buf[bufIdx++] = py[iy];
            buf[bufIdx++] = ux[ix];
            buf[bufIdx++] = uy[iy];
            buf[bufIdx++] = segmentId;
        }

        x += charDef.xadvance * localScale;

        prevCodePoint = codePoint;
        numGlyphs += 1;
    }

    while (fontBuf.glyphsUsed + numGlyphs > fontBuf.glpyhCapacity) {
        // realloc buffer; double capacity
        fontBuf.glpyhCapacity *= 2;
        let prevBuf = fontBuf.localVertBuffer;
        fontBuf.localVertBuffer = new Float32Array(fontBuf.glpyhCapacity * floatsPerGlyph);
        fontBuf.localVertBuffer.set(prevBuf);
    }

    fontBuf.localVertBuffer.set(buf.slice(0, numGlyphs * floatsPerGlyph), fontBuf.glyphsUsed * floatsPerGlyph);
    fontBuf.glyphsUsed += numGlyphs;

    // TODO: Do realloc stuff
    mtx = mtx ?? new Mat4f();
    color = color ?? new Vec4(1, 1, 1, 1);
    fontBuf.localTexBuffer.set(mtx, fontBuf.segmentsUsed * floatsPerSegment + 0);
    fontBuf.localTexBuffer.set(color, fontBuf.segmentsUsed * floatsPerSegment + 16);
    fontBuf.segmentsUsed += 1;
}

export function renderAllText(gl: WebGL2RenderingContext, fontBuf: IFontBuffers, viewMtx: Mat4f, modelMtx: Mat4f) {
    let atlas = fontBuf.atlas;

    gl.disable(gl.CULL_FACE);

    // resize texture if needed
    gl.bindTexture(gl.TEXTURE_2D, fontBuf.transformTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, fontBuf.segmentsUsed * floatsPerSegment / 4, 1, gl.RGBA, gl.FLOAT, fontBuf.localTexBuffer);

    // resize vert buffer if needed
    gl.bindBuffer(gl.ARRAY_BUFFER, fontBuf.vertVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, fontBuf.localVertBuffer.slice(0, fontBuf.glyphsUsed * floatsPerGlyph));

    gl.useProgram(atlas.program.program);

    let locs = atlas.program.locs;
    gl.uniformMatrix4fv(locs.u_view, false, viewMtx);
    gl.uniformMatrix4fv(locs.u_model, false, modelMtx);
    gl.uniform1f(locs.pxRange, 4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.atlasTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fontBuf.transformTex);

    gl.bindVertexArray(fontBuf.vao);
    gl.drawArrays(gl.TRIANGLES, 0, fontBuf.glyphsUsed * 6);
    // gl.finish();
}

export function resetFontBuffers(fontBuf: IFontBuffers) {
    fontBuf.glyphsUsed = 0;
    fontBuf.segmentsUsed = 0;
}
