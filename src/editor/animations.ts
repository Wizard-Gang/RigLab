// Pure document helpers: rest poses, unique names, blank animations and the starting document.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { DEFAULT_FPS } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from "../format/document";
import type { RigLabDocument } from "../format/document";
import type { RigLabRig } from "../format/rig";
import { NAME } from "../format/validate";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../hexframe/humanoid";

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

/** A new document: Hexframe's humanoid with its 13 clips as reference animations. */
export function templateDocument(): RigLabDocument {
  return {
    format: DOCUMENT_FORMAT,
    version: DOCUMENT_VERSION,
    rig: HUMANOID_RIG,
    animations: Object.values(HUMANOID_ANIMATIONS),
  };
}
