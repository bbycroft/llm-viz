import { makeArray } from "../utils/data";
import { Random } from "../utils/random";

export class PerlinNoise2D {
    private perm: number[];

    constructor(seed: number) {
        let rand = new Random(seed);
        let perm = makeArray(256, 0);
        for (let i = 0; i < 256; i++) {
            perm[i] = rand.randint(0, 256);
        }
        this.perm = perm;
    }

    private grad2: [number, number][] = [
        [1, 1], [-1, 1], [1, -1], [-1, -1],
        [1, 0], [-1, 0], [1, 0], [-1, 0],
        [0, 1], [0, -1], [0, 1], [0, -1],
    ];

    public noise(x: number, y: number) {
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        let u = fade(x);
        let v = fade(y);

        let A = this.perm[X] + Y;
        let AA = this.perm[A % 255];
        let AB = this.perm[(A + 1) % 255];
        let B = this.perm[(X + 1) % 255] + Y;
        let BA = this.perm[B % 255];
        let BB = this.perm[(B + 1) % 255];

        return lerp(
            lerp(dot2(this.grad2[AA % 12], x, y    ), dot2(this.grad2[BA % 12], x - 1, y   ), u),
            lerp(dot2(this.grad2[AB % 12], x, y - 1), dot2(this.grad2[BB % 12], x - 1, y - 1), u),
            v);
    }

    public octaveNoise(x: number, y: number, octaves: number, persistence: number) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue * (1 / 0.4);
    }
}

function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
}

function dot2(g: [number, number], x: number, y: number) {
    return g[0] * x + g[1] * y;
}
