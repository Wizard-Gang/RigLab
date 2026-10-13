export interface BonePose {
  x?: number;
  y?: number;
  rotation?: number;
}

export type Pose = Record<string, BonePose>;

export const POSE_INTERVALS = 12;
export const POSE_COUNT = POSE_INTERVALS + 1;

export type Easing = "linear" | "smoothstep";

export interface Clip {
  readonly loop: boolean;
  readonly duration: number;
  readonly easing?: Easing;
  readonly poses: readonly Pose[];
}

export function posePhase(index: number): number {
  return index / POSE_INTERVALS;
}
