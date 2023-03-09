import { ICamera } from "./Camera";

export interface ISavedState {
    phase: number;
    phaseTime: number;
    camera: ICamera;
}

export let SavedState = {
    state: null as ISavedState | null,
};
