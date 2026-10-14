// Pose edits write a solved pose into the active animation's key at the current frame.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { classWeapon, validateAnimation } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { frameList } from "../format/timing";
import type { RigLabWeapon } from "../format/weapon";
import { constraintsOf } from "../solve/constraints";
import type { Constraints } from "../solve/constraints";

export type PoseEditResult =
  | { readonly ok: true; readonly animation: RigLabAnimation }
  | { readonly ok: false; readonly error: string };

/**
 * Replace the pose of the key at `frame`. The kind fixes where keys are, so a frame between keys has none to pose.
 * Without new constraints the key keeps its own pins and body placements. The result must still be a valid animation
 * for the rig and the library's weapons.
 */
export function setKeyPose(
  rig: RigLabRig,
  animation: RigLabAnimation,
  frame: number,
  pose: Pose,
  constraints?: Constraints,
  weapons: readonly RigLabWeapon[] = [],
): PoseEditResult {
  const existing = animation.keys.find((key) => key.frame === frame);
  if (!existing) {
    const frames = frameList(animation.keys.map((key) => key.frame));
    return { ok: false, error: `Frame ${frame} is between keys: ${animation.name} poses at frames ${frames}` };
  }
  const held = constraints ?? constraintsOf(existing, classWeapon(animation, weapons));
  const key = {
    frame,
    interpolation: existing.interpolation,
    pose,
    ...(held.pins.length ? { pins: held.pins } : {}),
    ...(held.weapon?.bodies.length ? { bodies: held.weapon.bodies } : {}),
  };
  const next = { ...animation, keys: animation.keys.map((candidate) => (candidate === existing ? key : candidate)) };
  const result = validateAnimation(next, rig, weapons);
  if (!result.ok) return { ok: false, error: result.errors[0]! };
  return { ok: true, animation: result.value };
}
