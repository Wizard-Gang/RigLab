// Pose edits write a solved pose into the active animation's key at the current frame.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { validateAnimation } from "../format/animation";
import type { Key, RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { keyIndexAt } from "../format/sample";

export type PoseEditResult =
  | { readonly ok: true; readonly animation: RigLabAnimation; readonly inserted: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * Replace the key at `frame`, or insert one there that continues the interpolation of the key in force.
 * The result must still be a valid animation for the rig.
 */
export function setKeyPose(rig: RigLabRig, animation: RigLabAnimation, frame: number, pose: Pose): PoseEditResult {
  if (!Number.isInteger(frame) || frame < 0 || frame > animation.length) {
    return { ok: false, error: `Frame ${frame} is outside ${animation.name}` };
  }
  const existing = animation.keys.findIndex((key) => key.frame === frame);
  let keys: Key[];
  if (existing >= 0) {
    keys = animation.keys.map((key, index) => (index === existing ? { ...key, pose } : key));
  } else {
    const inForce = animation.keys[keyIndexAt(animation.keys, frame)]!;
    const key: Key = { frame, interpolation: inForce.interpolation, pose };
    keys = [...animation.keys.filter((candidate) => candidate.frame < frame), key, ...animation.keys.filter((candidate) => candidate.frame > frame)];
  }
  const next = { ...animation, keys };
  const result = validateAnimation(next, rig);
  if (!result.ok) return { ok: false, error: result.errors[0]! };
  return { ok: true, animation: result.value, inserted: existing < 0 };
}
