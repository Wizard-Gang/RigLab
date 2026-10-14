// Hexframe's engine playback. An animation becomes Hexframe's clip, its keys sampled into 13 evenly spaced poses, and
// every frame between two of them comes from Hexframe's own sampler. Preview, bake and export all play through here.
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { BonePose, Clip, Pose } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";
import { poseFrames } from "../format/timing";
import { blendConstraints, constraintsAt, samplePose } from "./constraints";
import type { Constraints } from "./constraints";

/** Every bone's channels as Hexframe stores them: `x`, `y` and `rotation` on the root, `rotation` elsewhere. */
export function hexframePose(rig: RigLabRig, pose: Pose): Pose {
  return Object.fromEntries(rig.bones.map((bone) => {
    const value = pose[bone.name] ?? {};
    const channels: BonePose = bone.name === rig.root ? { x: value.x ?? 0, y: value.y ?? 0, rotation: value.rotation ?? 0 } : { rotation: value.rotation ?? 0 };
    return [bone.name, channels];
  }));
}

/** A frame as Hexframe plays it, with the pins and weapon RigLab keeps beside the pose. */
export interface Played {
  readonly pose: Pose;
  readonly constraints: Constraints;
  /** Pins or grips that could not hold on the Hexframe pose in force. */
  readonly violations: readonly string[];
}

export interface Engine {
  /** The clip Hexframe stores: 13 poses over `length` ticks, played linearly between poses. */
  readonly clip: Clip;
  /** The 13 poses, each the keys sampled at its frame with that frame's pins and weapon held. */
  readonly poses: readonly Played[];
}

/** The animation as Hexframe's clip; its class weapon is one of the given weapons, the library's. */
export function engineOf(rig: RigLabRig, animation: RigLabAnimation, weapons: readonly RigLabWeapon[] = []): Engine {
  const poses = poseFrames(animation.length).map((frame) => {
    const held = samplePose(rig, animation, frame, weapons);
    return { pose: hexframePose(rig, held.pose), constraints: constraintsAt(animation, frame, weapons), violations: held.violations };
  });
  return { clip: { loop: animation.loop, duration: animation.length, easing: "linear", poses: poses.map((entry) => entry.pose) }, poses };
}

/**
 * What Hexframe plays at a whole frame. On one of the 13 poses that is the pose itself; between two of them the
 * pose is Hexframe's sampler, and the pins and weapon move linearly between the two the same way.
 */
export function playAt(engine: Engine, frame: number): Played {
  const { clip, poses } = engine;
  const at = clip.loop ? ((frame % clip.duration) + clip.duration) % clip.duration : Math.max(0, Math.min(frame, clip.duration));
  const position = (at * POSE_INTERVALS) / clip.duration;
  const lower = Math.floor(position);
  const before = poses[lower]!;
  if (position === lower) return before;
  const after = poses[lower + 1]!;
  return { pose: sampleClip(clip, frame), constraints: blendConstraints(before.constraints, after.constraints, position - lower), violations: before.violations };
}
