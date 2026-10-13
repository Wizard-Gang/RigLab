// Pure document helpers: rest poses, unique names and blank animations.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { DEFAULT_FPS } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { NAME } from "../format/validate";

/** Every bone at its rest rotation, and the root at the rig origin. */
export function restPose(rig: RigLabRig): Pose {
  return Object.fromEntries(rig.bones.map((bone) => [
    bone.name,
    bone.name === rig.root ? { x: 0, y: 0, rotation: 0 } : { rotation: 0 },
  ]));
}

/** `base` if free, else `base-2`, `base-3`, …, trimmed so the result stays a valid 64-character name. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function isValidName(name: string): boolean {
  return NAME.test(name);
}

/** One second at the default rate, holding the rest pose. */
export function blankAnimation(rig: RigLabRig, name: string): RigLabAnimation {
  return {
    format: "riglab.anim",
    version: 1,
    name,
    rig: rig.name,
    fps: DEFAULT_FPS,
    length: DEFAULT_FPS,
    loop: false,
    keys: [{ frame: 0, interpolation: "hold", pose: restPose(rig) }],
  };
}
