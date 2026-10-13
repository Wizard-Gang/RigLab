// Pose edits write a solved pose into the active animation's key at the current frame.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { validateAnimation } from "../format/animation";
import type { Key, RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { keyIndexAt } from "../format/sample";
import { constraintsAt, constraintsOf } from "../solve/constraints";
import type { Constraints } from "../solve/constraints";

export type PoseEditResult =
  | { readonly ok: true; readonly animation: RigLabAnimation; readonly inserted: boolean }
  | { readonly ok: false; readonly error: string };

function keyWith(frame: number, interpolation: Key["interpolation"], pose: Pose, constraints: Constraints): Key {
  return {
    frame,
    interpolation,
    pose,
    ...(constraints.pins.length ? { pins: constraints.pins } : {}),
    ...(constraints.prop ? { prop: constraints.prop } : {}),
  };
}

/**
 * Replace the key at `frame`, or insert one there that continues the interpolation of the key in force.
 * Without new constraints a replaced key keeps its own and an inserted key takes those in force at the frame.
 * The result must still be a valid animation for the rig.
 */
export function setKeyPose(rig: RigLabRig, animation: RigLabAnimation, frame: number, pose: Pose, constraints?: Constraints): PoseEditResult {
  if (!Number.isInteger(frame) || frame < 0 || frame > animation.length) {
    return { ok: false, error: `Frame ${frame} is outside ${animation.name}` };
  }
  const existing = animation.keys.findIndex((key) => key.frame === frame);
  let keys: Key[];
  if (existing >= 0) {
    keys = animation.keys.map((key, index) => (index === existing ? keyWith(frame, key.interpolation, pose, constraints ?? constraintsOf(key)) : key));
  } else {
    const inForce = animation.keys[keyIndexAt(animation.keys, frame)]!;
    const key = keyWith(frame, inForce.interpolation, pose, constraints ?? constraintsAt(animation, frame));
    keys = [...animation.keys.filter((candidate) => candidate.frame < frame), key, ...animation.keys.filter((candidate) => candidate.frame > frame)];
  }
  const next = { ...animation, keys };
  const result = validateAnimation(next, rig);
  if (!result.ok) return { ok: false, error: result.errors[0]! };
  return { ok: true, animation: result.value, inserted: existing < 0 };
}
