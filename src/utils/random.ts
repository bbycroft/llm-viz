import { clamp } from "./data";

function xmur3(str: string) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
        h = h << 13 | h >>> 19;
    return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507),
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

function sfc32(a: number, b: number, c: number, d: number) {
    return function() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      d = d + 1 | 0;
      t = t + d | 0;
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}

export type UniformDistGenerator = () => number;

function randomGen(seed?: string): UniformDistGenerator {
    let seeder = xmur3(seed ?? Math.random().toString());
    return sfc32(seeder(), seeder(), seeder(), seeder());
}

export class Random {
    constructor(seed?: number) {
        this.random = randomGen(seed?.toString());
    }

    random: UniformDistGenerator;

    normal = () => {
        let x = this.random();
        let y = this.random();
        return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y);
    }

    randint(min: number, max: number): number {
        return clamp(Math.floor(this.random() * (max - min) + min), min, max - 1);
    }
}

