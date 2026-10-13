// The one deterministic sampler behind preview, bake and export.
import type { BonePose, Pose } from "../../vendor/hexframe/src/rig";
import type { Interpolation, Key, RigLabAnimation } from "./animation";

const CHANNELS = ["x", "y", "rotation"] as const satisfies readonly (keyof BonePose)[];

function ease(progress: number, interpolation: Interpolation): number {
  return interpolation === "smoothstep" ? progress * progress * (3 - 2 * progress) : progress;
}

function copyPose(pose: Pose): Pose {
  return Object.fromEntries(Object.entries(pose).map(([bone, value]) => [bone, { ...value }]));
}

/** Blend two full poses channel by channel with Hexframe's `start + (end - start) * progress`. */
export function blendPoses(from: Pose, to: Pose, progress: number): Pose {
  const pose: Pose = {};
  for (const [bone, start] of Object.entries(from)) {
    const end = to[bone] ?? start;
    const blended: BonePose = {};
    for (const channel of CHANNELS) {
      const a = start[channel];
      if (a === undefined) continue;
      const b = end[channel] ?? a;
      blended[channel] = a + (b - a) * progress;
    }
    pose[bone] = blended;
  }
  return pose;
}

/** Clip time for an output frame: wrapped into [0, length) when looping, clamped into [0, length] otherwise. */
export function animationTime(animation: RigLabAnimation, frame: number): number {
  const { length } = animation;
  if (animation.loop) return ((frame % length) + length) % length;
  return Math.max(0, Math.min(frame, length));
}

/** The key in force at a clip time: the last key whose frame is at or before it. */
export function keyIndexAt(keys: readonly Key[], time: number): number {
  let index = keys.length - 1;
  while (index > 0 && keys[index]!.frame > time) index -= 1;
  return index;
}

/**
 * Sample a valid animation at any frame. A key's interpolation shapes the transition to the next key;
 * a looping animation's last key runs to key 0 at `length`, and a non-looping one holds its last key.
 */
export function sampleAnimation(animation: RigLabAnimation, frame: number): Pose {
  const { keys } = animation;
  const time = animationTime(animation, frame);
  const index = keyIndexAt(keys, time);
  const from = keys[index]!;
  let to: Key | undefined = keys[index + 1];
  let end = to?.frame ?? 0;
  if (!to && animation.loop && from.frame < animation.length) {
    to = keys[0];
    end = animation.length;
  }
  if (!to || from.interpolation === "hold") return copyPose(from.pose);
  return blendPoses(from.pose, to.pose, ease((time - from.frame) / (end - from.frame), from.interpolation));
}
