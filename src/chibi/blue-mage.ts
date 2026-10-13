/** Optional blue-and-gold pixel-art armor for RigLab's eleven-bone chibi. */
import "./blue-mage.css";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";
import skin0 from "../../characters/chibi/skins/blue-mage/parts/arm_lower_l.svg?raw";
import skin1 from "../../characters/chibi/skins/blue-mage/parts/arm_lower_r.svg?raw";
import skin2 from "../../characters/chibi/skins/blue-mage/parts/arm_upper_l.svg?raw";
import skin3 from "../../characters/chibi/skins/blue-mage/parts/arm_upper_r.svg?raw";
import skin4 from "../../characters/chibi/skins/blue-mage/parts/head.svg?raw";
import skin5 from "../../characters/chibi/skins/blue-mage/parts/leg_lower_l.svg?raw";
import skin6 from "../../characters/chibi/skins/blue-mage/parts/leg_lower_r.svg?raw";
import skin7 from "../../characters/chibi/skins/blue-mage/parts/leg_upper_l.svg?raw";
import skin8 from "../../characters/chibi/skins/blue-mage/parts/leg_upper_r.svg?raw";
import skin9 from "../../characters/chibi/skins/blue-mage/parts/pelvis.svg?raw";
import skin10 from "../../characters/chibi/skins/blue-mage/parts/torso.svg?raw";

/** Uses unchanged CHIBI_RIG slots and pivots, without affecting default art. */
export const BLUE_MAGE_PARTS: Readonly<Record<string, Part>> = Object.freeze(
  Object.fromEntries(Object.entries({
    chibi_arm_lower_l: skin0,
    chibi_arm_lower_r: skin1,
    chibi_arm_upper_l: skin2,
    chibi_arm_upper_r: skin3,
    chibi_head: skin4,
    chibi_leg_lower_l: skin5,
    chibi_leg_lower_r: skin6,
    chibi_leg_upper_l: skin7,
    chibi_leg_upper_r: skin8,
    chibi_pelvis: skin9,
    chibi_torso: skin10,
  }).map(([slot, markup]) => [slot, parsePart(markup, "blue-mage")]))
);
