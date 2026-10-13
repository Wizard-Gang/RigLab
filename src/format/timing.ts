// Hexframe's engine timing: a fixed 60 Hz clock, and clips of 13 evenly spaced poses. Every animation is one kind,
// and the kind fixes its length, looping and keys on that grid, so an animation plays the same in RigLab and Hexframe.
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";

/** Hexframe's fixed simulation clock. One RigLab frame is one Hexframe tick. */
export const ENGINE_FPS = 60;

export type AnimationKind = "idle" | "walk" | "jump" | "attack" | "hit";

export interface KindTiming {
  readonly label: string;
  /** Hexframe ticks: a multiple of 12, so each of Hexframe's 13 poses falls on a whole frame. */
  readonly length: number;
  readonly loop: boolean;
  /** Keys, evenly spaced on the pose grid from frame 0. A looping animation's last key runs back to the first. */
  readonly keys: number;
}

/** Sized from Hexframe's own clips: labIdle (60, looping), labWalk (48, looping), jump (38), labStagger (24) and labStrike (20). */
export const KINDS: Readonly<Record<AnimationKind, KindTiming>> = Object.freeze({
  idle: { label: "Idle", length: 60, loop: true, keys: 4 },
  walk: { label: "Walk", length: 48, loop: true, keys: 4 },
  jump: { label: "Jump", length: 36, loop: false, keys: 4 },
  attack: { label: "Attack", length: 24, loop: false, keys: 4 },
  hit: { label: "Hit", length: 24, loop: false, keys: 3 },
});

export const ANIMATION_KINDS = Object.freeze(Object.keys(KINDS)) as readonly AnimationKind[];

export const isKind = (value: unknown): value is AnimationKind => typeof value === "string" && Object.hasOwn(KINDS, value);

/** The frames a kind's keys sit on. */
export function keyFrames(kind: AnimationKind): readonly number[] {
  const { length, loop, keys } = KINDS[kind];
  const spacing = length / (loop ? keys : keys - 1);
  return Array.from({ length: keys }, (_, index) => index * spacing);
}

/** The frames of Hexframe's 13 poses in an animation of `length` frames. */
export function poseFrames(length: number): readonly number[] {
  return Array.from({ length: POSE_INTERVALS + 1 }, (_, index) => (index * length) / POSE_INTERVALS);
}

/** `0, 15, 30 and 45`. */
export function frameList(frames: readonly number[]): string {
  return frames.length < 2 ? frames.join("") : `${frames.slice(0, -1).join(", ")} and ${frames.at(-1)}`;
}
