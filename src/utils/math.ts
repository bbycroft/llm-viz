import { clamp } from "./data";

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * clamp(t, 0, 1);
}

// we lerp after running the smoothstep, and t is clamped to [0, 1]
export function lerpSmoothstep(a: number, b: number, t: number) {
    if (t <= 0.0) return a;
    if (t >= 1.0) return b;
    return a + (b - a) * t * t * (3 - 2 * t);
}

export function roundUpTo(a: number, b: number) {
    return Math.ceil(a / b) * b;
}

// when t < edge0, returns 0
// when t > edge1, returns 1
// when t is between edge0 and edge1, returns a value between 0 and 1
// note that edge1 must be greater than edge0
export function inverseLerp(edge0: number, edge1: number, t: number) {
    return (clamp(t, edge0, edge1) - edge0) / (edge1 - edge0);
}
