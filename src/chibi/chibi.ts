// The chibi: Hexframe's 11-bone rig at about two heads tall, with its own original art and Hexframe's 13 clips.
import chibiRig from "../../characters/chibi/chibi.rig.json";
import armLowerL from "../../characters/chibi/parts/arm_lower_l.svg?raw";
import armLowerR from "../../characters/chibi/parts/arm_lower_r.svg?raw";
import armUpperL from "../../characters/chibi/parts/arm_upper_l.svg?raw";
import armUpperR from "../../characters/chibi/parts/arm_upper_r.svg?raw";
import head from "../../characters/chibi/parts/head.svg?raw";
import legLowerL from "../../characters/chibi/parts/leg_lower_l.svg?raw";
import legLowerR from "../../characters/chibi/parts/leg_lower_r.svg?raw";
import legUpperL from "../../characters/chibi/parts/leg_upper_l.svg?raw";
import legUpperR from "../../characters/chibi/parts/leg_upper_r.svg?raw";
import pelvis from "../../characters/chibi/parts/pelvis.svg?raw";
import torso from "../../characters/chibi/parts/torso.svg?raw";
import type { RigLabAnimation } from "../format/animation";
import { validateRig } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import { retargetAnimation } from "../editor/retarget";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../hexframe/humanoid";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";

function valid(value: unknown): RigLabRig {
  const result = validateRig(value);
  if (!result.ok) throw new Error(`chibi rig is not valid:\n${result.errors.join("\n")}`);
  return result.value;
}

export const CHIBI_RIG: RigLabRig = valid(chibiRig);

/** Chibi art, keyed by the chibi bones' own `chibi_*` slots so it never lands on another rig. */
export const CHIBI_PARTS: Readonly<Record<string, Part>> = Object.freeze(Object.fromEntries(Object.entries({
  chibi_arm_lower_l: armLowerL,
  chibi_arm_lower_r: armLowerR,
  chibi_arm_upper_l: armUpperL,
  chibi_arm_upper_r: armUpperR,
  chibi_head: head,
  chibi_leg_lower_l: legLowerL,
  chibi_leg_lower_r: legLowerR,
  chibi_leg_upper_l: legUpperL,
  chibi_leg_upper_r: legUpperR,
  chibi_pelvis: pelvis,
  chibi_torso: torso,
}).map(([slot, markup]) => [slot, parsePart(markup, "chibi")])));

/** Hexframe's 13 reference clips on the chibi: same rotations, root motion scaled to its shorter legs. */
export const CHIBI_ANIMATIONS: Readonly<Record<string, RigLabAnimation>> = Object.freeze(Object.fromEntries(
  Object.entries(HUMANOID_ANIMATIONS).map(([name, animation]) => [name, retargetAnimation(animation, HUMANOID_RIG, CHIBI_RIG)]),
));
