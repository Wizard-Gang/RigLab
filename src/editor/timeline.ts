// Timeline edits on one animation. Its kind fixes its keys and timing, so a key's interpolation is all that changes.
import { validateAnimation } from "../format/animation";
import type { Interpolation, RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";

export type TimelineEdit = { readonly kind: "setInterpolation"; readonly frame: number; readonly interpolation: Interpolation };

export type TimelineResult =
  | { readonly ok: true; readonly animation: RigLabAnimation; readonly message: string }
  | { readonly ok: false; readonly error: string };

export function applyTimelineEdit(rig: RigLabRig, animation: RigLabAnimation, edit: TimelineEdit, weapons: readonly RigLabWeapon[] = []): TimelineResult {
  const key = animation.keys.find((candidate) => candidate.frame === edit.frame);
  if (!key) return { ok: false, error: `Frame ${edit.frame} has no key` };
  if (key.interpolation === edit.interpolation) return { ok: false, error: `The key at frame ${edit.frame} is already ${edit.interpolation}` };
  const keys = animation.keys.map((candidate) => (candidate === key ? { ...candidate, interpolation: edit.interpolation } : candidate));
  const result = validateAnimation({ ...animation, keys }, rig, weapons);
  if (!result.ok) return { ok: false, error: result.errors[0]! };
  return { ok: true, animation: result.value, message: `Set the key at frame ${edit.frame} to ${edit.interpolation}` };
}
