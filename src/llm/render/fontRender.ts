import { base64ToArrayBuffer } from "@/src/utils/data";
import { Mat4f } from "@/src/utils/matrix";
import { bindFloatAttribs, createFloatBuffer, createShaderProgram, ensureFloatBufferSize, ensureShadersReady, IFloatBuffer, IGLContext, resetFloatBufferMap, uploadFloatBuffer } from "@/src/utils/shader";
import { Vec4 } from "@/src/utils/vector";
import { ISharedRender, modelViewUboText, RenderPhase, UboBindings } from "./sharedRender";

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
const bytesPerVert = floatsPerVert * 4;

const texWidth = 1024;

export interface IFontBuffers {
    atlas: IFontAtlas;
    vao: WebGLVertexArrayObject;
    transformTex: WebGLTexture;
    localTexBuffer: Float32Array;
    vertBuffer: IFloatBuffer;
    sharedRender: ISharedRender;

    segmentsUsed: number;
    segmentCapacity: number;
    glSegmentCapacity: number;
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

    let fontDefP = fetch('fonts/font-def.json', { credentials: 'include', mode: 'no-cors' }).then(r => r.json());

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
        ${modelViewUboText}
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
            int x = texOffset % texWidth;
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
            float screenRange = screenPxRange();
            float screenPxDistance = screenRange*(sd - 0.5);
            float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);

            float blurOpacity = 0.0; //smoothstep(0.5 - 0.4, 0.5, sd);

            if (opacity == 0.0 && blurOpacity == 0.0) {
                discard;
            }
            color = mix(vec4(0,0,0,1.0) * blurOpacity, v_fgColor, opacity);
        }
    `, ['u_tex', 'u_transformTex', 'pxRange'], { uboBindings: { 'ModelViewUbo': UboBindings.ModelView } })!;

    ensureShadersReady(ctx.shaderManager);

    let locs = program.locs;
    gl.useProgram(program.program);
    gl.uniform1i(locs.u_tex, 0);
    gl.uniform1i(locs.u_transformTex, 1);

    let faceInfos = [];

    for (let face of fontDef.faces) {
        let charArr = new Int16Array(base64ToArrayBuffer(face.chars));

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

        let kernArr = new Int16Array(base64ToArrayBuffer(face.kernings));

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

        faceInfos.push({
            name: face.name,
            common: face.common as IFontCommonDef,
            charMap,
            kernMap,
        });
    }

    return {
        gl,
        faceInfos,
        program,
        atlasTex,
    };
}

export function createFontBuffers(atlas: IFontAtlas, sharedRender: ISharedRender): IFontBuffers {
    let gl = atlas.gl;

    let segmentCapacity = 1024;
    let glyphCapacity = 1024;

    let transformTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, transformTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // we'll fill it in later
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texWidth, computeTexHeight(segmentCapacity), 0, gl.RGBA, gl.FLOAT, null);

    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Just using 1 buffer for all text for now
    let vertVbo = gl.createBuffer()!;
    bindFloatAttribs(gl, vertVbo, {}, [
        { name: 'a_pos', size: 2 },
        { name: 'a_uv', size: 2 },
        { name: 'a_texIndex', size: 1 },
    ]);
    let vertBuffer = createFloatBuffer(gl, gl.ARRAY_BUFFER, vertVbo, glyphCapacity, bytesPerVert, sharedRender);

    let localTexBuffer = new Float32Array(segmentCapacity * floatsPerSegment);

    return {
        atlas,
        vao,
        transformTex,
        vertBuffer,
        localTexBuffer,
        segmentsUsed: 0,
        segmentCapacity: 1024,
        glSegmentCapacity: 1024,
        sharedRender,
    };
}

export function computeTexHeight(numSegments: number) {
    return Math.ceil(numSegments * floatsPerSegment / 4 / texWidth);
}

 // Fudge factor to get it the same as HTML/CSS at the same px size
let scaleFudgeFactor = 1.04;

export function measureTextWidth(fontBuf: IFontBuffers, text: string, scale: number = 1.0, faceName?: string) {
    let face = faceName ? fontBuf.atlas.faceInfos.find(a => a.name === faceName)! : fontBuf.atlas.faceInfos[0];
    let x = 0;
    let prevCodePoint = '';
    for (let codePoint of text) {
        let charDef = face.charMap.get(codePoint);
        if (!charDef) {
            continue;
        }
        let kernKey = `${prevCodePoint}${codePoint}`;
        let kernAmount = face.kernMap.get(kernKey) || 0;
        x += kernAmount + charDef.xadvance;
        prevCodePoint = codePoint;
    }
    return x * scale / face.common.lineHeight * scaleFudgeFactor;
}

export interface IFontOpts {
    color: Vec4;
    size: number;
    mtx?: Mat4f;
    faceName?: string;
}

export function measureText(fontBuf: IFontBuffers, text: string, opts: IFontOpts) {
    return measureTextWidth(fontBuf, text, opts.size, opts.faceName);
}

export function drawText(fontBuf: IFontBuffers, text: string, dx: number, dy: number, opts: IFontOpts) {
    writeTextToBuffer(fontBuf, text, opts.color, dx, dy, opts.size, opts.mtx, opts.faceName);
}

export function writeTextToBuffer(fontBuf: IFontBuffers, text: string, color: Vec4, dx?: number, dy?: number, scale?: number, mtx?: Mat4f, faceName?: string) {
    let face = faceName ? fontBuf.atlas.faceInfos.find(a => a.name === faceName)! : fontBuf.atlas.faceInfos[0];
    if (!face) {
        face = fontBuf.atlas.faceInfos[0];
    }

    let phase = fontBuf.sharedRender.activePhase;
    let vertBuf = fontBuf.vertBuffer.localBufs[phase];
    ensureFloatBufferSize(vertBuf, text.length * floatsPerVert);
    if (fontBuf.segmentsUsed === Math.floor(texWidth * 4 / floatsPerSegment)) {
        // the last segment on each texel row would overflow (it takes 5 texels), so we skip it
        fontBuf.segmentsUsed += 1;
    }
    let segmentId = fontBuf.segmentsUsed;
    let buf = vertBuf.buf;
    let bufIdx = vertBuf.usedEls * fontBuf.vertBuffer.strideFloats;
    let atlasWInv = 1.0 / face.common.scaleW;
    let atlasHInv = 1.0 / face.common.scaleH;
    let numGlyphs = 0;
    let x = dx ?? 0;
    let y = dy ?? 0;
    let prevCodePoint = '';
    scale = scale ?? 1.0;
    let localScale = scale / face.common.lineHeight * scaleFudgeFactor;
    for (let codePoint of text) {
        let charDef = face.charMap.get(codePoint);
        if (!charDef) {
            // TODO: Handle missing characters e.g. use a default character
            continue;
        }
        let kernKey = `${prevCodePoint}${codePoint}`;
        let kernAmount = face.kernMap.get(kernKey) || 0;
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

    vertBuf.usedEls += numGlyphs * 6;

    // TODO: Do realloc stuff
    mtx = mtx ?? new Mat4f();
    color = color ?? new Vec4(1, 1, 1, 1);

    if (fontBuf.segmentsUsed >= fontBuf.segmentCapacity) {
        let newCapacity = fontBuf.segmentCapacity * 2;
        let newBuf = new Float32Array(newCapacity * floatsPerSegment);
        newBuf.set(fontBuf.localTexBuffer);
        fontBuf.localTexBuffer = newBuf;
    }

    fontBuf.localTexBuffer.set(mtx, fontBuf.segmentsUsed * floatsPerSegment + 0);
    fontBuf.localTexBuffer.set(color.toArray(), fontBuf.segmentsUsed * floatsPerSegment + 16);
    fontBuf.segmentsUsed += 1;
}

export function uploadAllText(fontBuf: IFontBuffers) {
    let atlas = fontBuf.atlas;
    let gl = atlas.gl;

    // resize texture if needed
    gl.bindTexture(gl.TEXTURE_2D, fontBuf.transformTex);

    if (fontBuf.segmentCapacity > fontBuf.glSegmentCapacity) {
        let w = 1024;
        let h = Math.ceil(fontBuf.segmentCapacity * floatsPerSegment / 4 / w);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        fontBuf.glSegmentCapacity = w * h / 4;
    }

    {
        let w = 1024;
        let h = Math.ceil(fontBuf.segmentsUsed * floatsPerSegment / 4 / w);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, fontBuf.localTexBuffer);
    }

    uploadFloatBuffer(gl, fontBuf.vertBuffer);
}

export function renderAllText(fontBuf: IFontBuffers, renderPhase: RenderPhase) {
    let atlas = fontBuf.atlas;
    let gl = atlas.gl;

    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    gl.useProgram(atlas.program.program);

    let locs = atlas.program.locs;
    gl.uniform1f(locs.pxRange, 4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.atlasTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fontBuf.transformTex);

    gl.bindVertexArray(fontBuf.vao);
    let localBuf = fontBuf.vertBuffer.localBufs[renderPhase];
    gl.drawArrays(gl.TRIANGLES, localBuf.glOffsetEls, localBuf.usedEls);

    gl.depthMask(true);
}

export function resetFontBuffers(fontBuf: IFontBuffers) {
    resetFloatBufferMap(fontBuf.vertBuffer);
    fontBuf.segmentsUsed = 0;
}
