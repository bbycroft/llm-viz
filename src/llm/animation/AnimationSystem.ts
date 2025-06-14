import { Vec3, Vec4 } from "@/src/utils/vector";
import { EasingType, easeValue, lerp } from "@/src/utils/math";
import { IBlkDef } from "../GptModelLayout";

export interface IAnimationKeyframe<T = any> {
    time: number;
    value: T;
    easing?: EasingType;
}

export interface IAnimationTrack<T = any> {
    property: string;
    keyframes: IAnimationKeyframe<T>[];
    target?: any;
}

export interface IAnimationClip {
    name: string;
    duration: number;
    tracks: IAnimationTrack[];
    loop?: boolean;
}

export interface IAnimationState {
    clip: IAnimationClip;
    time: number;
    playing: boolean;
    speed: number;
    weight: number;
}

export class AnimationSystem {
    private animations: Map<string, IAnimationState> = new Map();
    private globalTime: number = 0;

    update(deltaTime: number) {
        this.globalTime += deltaTime;
        
        for (const [name, state] of this.animations) {
            if (!state.playing) continue;
            
            state.time += deltaTime * state.speed;
            
            if (state.time >= state.clip.duration) {
                if (state.clip.loop) {
                    state.time = state.time % state.clip.duration;
                } else {
                    state.time = state.clip.duration;
                    state.playing = false;
                }
            }
            
            this.evaluateAnimation(state);
        }
    }

    play(clipName: string, clip: IAnimationClip, options: {
        speed?: number;
        weight?: number;
        startTime?: number;
    } = {}) {
        const state: IAnimationState = {
            clip,
            time: options.startTime ?? 0,
            playing: true,
            speed: options.speed ?? 1,
            weight: options.weight ?? 1,
        };
        
        this.animations.set(clipName, state);
    }

    stop(clipName: string) {
        const state = this.animations.get(clipName);
        if (state) {
            state.playing = false;
        }
    }

    private evaluateAnimation(state: IAnimationState) {
        for (const track of state.clip.tracks) {
            const value = this.evaluateTrack(track, state.time);
            if (track.target && track.property) {
                this.applyValue(track.target, track.property, value, state.weight);
            }
        }
    }

    private evaluateTrack<T>(track: IAnimationTrack<T>, time: number): T {
        const keyframes = track.keyframes;
        if (keyframes.length === 0) return null as any;
        if (keyframes.length === 1) return keyframes[0].value;

        // Find the keyframes to interpolate between
        let prevKeyframe = keyframes[0];
        let nextKeyframe = keyframes[keyframes.length - 1];

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
                prevKeyframe = keyframes[i];
                nextKeyframe = keyframes[i + 1];
                break;
            }
        }

        if (prevKeyframe === nextKeyframe) {
            return prevKeyframe.value;
        }

        const duration = nextKeyframe.time - prevKeyframe.time;
        const t = duration > 0 ? (time - prevKeyframe.time) / duration : 0;
        const easedT = easeValue(t, nextKeyframe.easing ?? EasingType.Linear);

        return this.interpolateValue(prevKeyframe.value, nextKeyframe.value, easedT);
    }

    private interpolateValue<T>(a: T, b: T, t: number): T {
        if (typeof a === 'number' && typeof b === 'number') {
            return lerp(a as any, b as any, t) as any;
        }
        
        if (a instanceof Vec3 && b instanceof Vec3) {
            return a.lerp(b, t) as any;
        }
        
        if (a instanceof Vec4 && b instanceof Vec4) {
            return a.lerp(b, t) as any;
        }
        
        // For other types, just switch at t = 0.5
        return t < 0.5 ? a : b;
    }

    private applyValue(target: any, property: string, value: any, weight: number) {
        if (weight <= 0) return;
        
        if (weight >= 1) {
            target[property] = value;
        } else {
            // Blend with existing value
            const currentValue = target[property];
            if (typeof currentValue === 'number' && typeof value === 'number') {
                target[property] = lerp(currentValue, value, weight);
            } else if (currentValue instanceof Vec3 && value instanceof Vec3) {
                target[property] = currentValue.lerp(value, weight);
            } else if (currentValue instanceof Vec4 && value instanceof Vec4) {
                target[property] = currentValue.lerp(value, weight);
            } else {
                target[property] = value;
            }
        }
    }
}

// Animation builder helpers
export class AnimationBuilder {
    private tracks: IAnimationTrack[] = [];
    private duration: number = 0;

    static create(): AnimationBuilder {
        return new AnimationBuilder();
    }

    animateProperty<T>(target: any, property: string): PropertyAnimator<T> {
        return new PropertyAnimator<T>(this, target, property);
    }

    addTrack(track: IAnimationTrack): this {
        this.tracks.push(track);
        const lastKeyframe = track.keyframes[track.keyframes.length - 1];
        if (lastKeyframe) {
            this.duration = Math.max(this.duration, lastKeyframe.time);
        }
        return this;
    }

    build(name: string, loop: boolean = false): IAnimationClip {
        return {
            name,
            duration: this.duration,
            tracks: [...this.tracks],
            loop,
        };
    }
}

export class PropertyAnimator<T> {
    private keyframes: IAnimationKeyframe<T>[] = [];
    private target: any;
    private property: string;

    constructor(private builder: AnimationBuilder, target: any, property: string) {
        this.target = target;
        this.property = property;
    }

    keyframe(time: number, value: T, easing?: EasingType): this {
        this.keyframes.push({ time, value, easing });
        this.keyframes.sort((a, b) => a.time - b.time);
        return this;
    }

    to(time: number, value: T, easing?: EasingType): this {
        return this.keyframe(time, value, easing);
    }

    end(): AnimationBuilder {
        const track: IAnimationTrack<T> = {
            property: this.property,
            keyframes: [...this.keyframes],
            target: this.target,
        };
        return this.builder.addTrack(track);
    }
}

// Predefined animation presets for common LLM visualization effects
export class LLMAnimationPresets {
    static fadeIn(target: IBlkDef, duration: number = 1.0, delay: number = 0): IAnimationClip {
        return AnimationBuilder.create()
            .animateProperty(target, 'opacity')
            .keyframe(delay, 0, EasingType.EaseOut)
            .keyframe(delay + duration, 1, EasingType.EaseOut)
            .end()
            .build('fadeIn');
    }

    static highlight(target: IBlkDef, intensity: number = 0.5, duration: number = 2.0): IAnimationClip {
        return AnimationBuilder.create()
            .animateProperty(target, 'highlight')
            .keyframe(0, 0, EasingType.EaseInOut)
            .keyframe(duration * 0.3, intensity, EasingType.EaseInOut)
            .keyframe(duration * 0.7, intensity, EasingType.EaseInOut)
            .keyframe(duration, 0, EasingType.EaseInOut)
            .end()
            .build('highlight', true);
    }

    static slideIn(target: IBlkDef, fromPos: Vec3, toPos: Vec3, duration: number = 1.0, delay: number = 0): IAnimationClip {
        return AnimationBuilder.create()
            .animateProperty(target, 'x')
            .keyframe(delay, fromPos.x, EasingType.EaseOutBack)
            .keyframe(delay + duration, toPos.x, EasingType.EaseOutBack)
            .end()
            .build('slideIn');
    }
}
