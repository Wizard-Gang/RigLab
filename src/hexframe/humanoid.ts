// Hexframe's fighter as RigLab's humanoid: the imported rig and its 13 clips as RigLab animations.
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { HEXFRAME_CLIPS, HEXFRAME_RIG } from "./fighter";
import { importHexframeClip, importHexframeRig } from "./import";
import type { Bends } from "./import";

/**
 * Hexframe authors the fighter facing right in a y-down, clockwise-positive space. A negative forearm
 * rotation swings the hand forward (elbow flexion) and a positive shin rotation swings the foot back
 * (knee flexion), so arms bend -1 and legs bend +1.
 */
export const HUMANOID_BENDS: Bends = Object.freeze({
  "arm-front": -1,
  "arm-back": -1,
  "leg-front": 1,
  "leg-back": 1,
});

export const HUMANOID_RIG: RigLabRig = importHexframeRig(HEXFRAME_RIG.contract, "humanoid", HUMANOID_BENDS);

export const HUMANOID_ANIMATIONS: Readonly<Record<string, RigLabAnimation>> = Object.freeze(
  Object.fromEntries(Object.entries(HEXFRAME_CLIPS).map(([name, clip]) => [name, importHexframeClip(clip, name, HUMANOID_RIG)])),
);
