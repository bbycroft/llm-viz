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

// Advanced easing functions for precise animations
export enum EasingType {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInQuint,
    EaseOutQuint,
    EaseInOutQuint,
    EaseInSine,
    EaseOutSine,
    EaseInOutSine,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInCirc,
    EaseOutCirc,
    EaseInOutCirc,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
}

export function easeValue(t: number, type: EasingType = EasingType.Linear): number {
    t = clamp(t, 0, 1);

    switch (type) {
        case EasingType.Linear:
            return t;

        case EasingType.EaseIn:
            return t * t;

        case EasingType.EaseOut:
            return 1 - (1 - t) * (1 - t);

        case EasingType.EaseInOut:
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        case EasingType.EaseInQuad:
            return t * t;

        case EasingType.EaseOutQuad:
            return 1 - (1 - t) * (1 - t);

        case EasingType.EaseInOutQuad:
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        case EasingType.EaseInCubic:
            return t * t * t;

        case EasingType.EaseOutCubic:
            return 1 - Math.pow(1 - t, 3);

        case EasingType.EaseInOutCubic:
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        case EasingType.EaseInQuart:
            return t * t * t * t;

        case EasingType.EaseOutQuart:
            return 1 - Math.pow(1 - t, 4);

        case EasingType.EaseInOutQuart:
            return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

        case EasingType.EaseInQuint:
            return t * t * t * t * t;

        case EasingType.EaseOutQuint:
            return 1 - Math.pow(1 - t, 5);

        case EasingType.EaseInOutQuint:
            return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

        case EasingType.EaseInSine:
            return 1 - Math.cos((t * Math.PI) / 2);

        case EasingType.EaseOutSine:
            return Math.sin((t * Math.PI) / 2);

        case EasingType.EaseInOutSine:
            return -(Math.cos(Math.PI * t) - 1) / 2;

        case EasingType.EaseInExpo:
            return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));

        case EasingType.EaseOutExpo:
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

        case EasingType.EaseInOutExpo:
            return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

        case EasingType.EaseInCirc:
            return 1 - Math.sqrt(1 - Math.pow(t, 2));

        case EasingType.EaseOutCirc:
            return Math.sqrt(1 - Math.pow(t - 1, 2));

        case EasingType.EaseInOutCirc:
            return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

        case EasingType.EaseInBack:
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return c3 * t * t * t - c1 * t * t;

        case EasingType.EaseOutBack:
            const c1_out = 1.70158;
            const c3_out = c1_out + 1;
            return 1 + c3_out * Math.pow(t - 1, 3) + c1_out * Math.pow(t - 1, 2);

        case EasingType.EaseInOutBack:
            const c1_inout = 1.70158;
            const c2 = c1_inout * 1.525;
            return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;

        case EasingType.EaseInElastic:
            const c4 = (2 * Math.PI) / 3;
            return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);

        case EasingType.EaseOutElastic:
            const c4_out = (2 * Math.PI) / 3;
            return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4_out) + 1;

        case EasingType.EaseInOutElastic:
            const c5 = (2 * Math.PI) / 4.5;
            return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;

        case EasingType.EaseInBounce:
            return 1 - easeValue(1 - t, EasingType.EaseOutBounce);

        case EasingType.EaseOutBounce:
            const n1 = 7.5625;
            const d1 = 2.75;
            if (t < 1 / d1) {
                return n1 * t * t;
            } else if (t < 2 / d1) {
                return n1 * (t -= 1.5 / d1) * t + 0.75;
            } else if (t < 2.5 / d1) {
                return n1 * (t -= 2.25 / d1) * t + 0.9375;
            } else {
                return n1 * (t -= 2.625 / d1) * t + 0.984375;
            }

        case EasingType.EaseInOutBounce:
            return t < 0.5 ? (1 - easeValue(1 - 2 * t, EasingType.EaseOutBounce)) / 2 : (1 + easeValue(2 * t - 1, EasingType.EaseOutBounce)) / 2;

        default:
            return t;
    }
}

export function lerpEased(a: number, b: number, t: number, easing: EasingType = EasingType.Linear): number {
    return lerp(a, b, easeValue(t, easing));
}
