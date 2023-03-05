import { Vec3 } from "./utils/vector";

export interface ISavedState {
    phase: number;
    phaseTime: number;
    camTarget: Vec3;
    camAngle: Vec3;
}

export let SavedState = {
    state: null as ISavedState | null,
};
