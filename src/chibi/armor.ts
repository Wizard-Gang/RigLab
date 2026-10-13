/** Optional red/gold armored chibi art. The default chibi skin and rig remain unchanged. */
import "./armor.css";
import armLowerL from "../../characters/chibi/skins/armor/parts/arm_lower_l.svg?raw";
import armLowerR from "../../characters/chibi/skins/armor/parts/arm_lower_r.svg?raw";
import armUpperL from "../../characters/chibi/skins/armor/parts/arm_upper_l.svg?raw";
import armUpperR from "../../characters/chibi/skins/armor/parts/arm_upper_r.svg?raw";
import head from "../../characters/chibi/skins/armor/parts/head.svg?raw";
import legLowerL from "../../characters/chibi/skins/armor/parts/leg_lower_l.svg?raw";
import legLowerR from "../../characters/chibi/skins/armor/parts/leg_lower_r.svg?raw";
import legUpperL from "../../characters/chibi/skins/armor/parts/leg_upper_l.svg?raw";
import legUpperR from "../../characters/chibi/skins/armor/parts/leg_upper_r.svg?raw";
import pelvis from "../../characters/chibi/skins/armor/parts/pelvis.svg?raw";
import torso from "../../characters/chibi/skins/armor/parts/torso.svg?raw";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";

/** Use instead of CHIBI_PARTS to draw the same CHIBI_RIG with armor. */
export const CHIBI_ARMOR_PARTS: Readonly<Record<string, Part>> = Object.freeze(
  Object.fromEntries(Object.entries({
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
  }).map(([slot, markup]) => [slot, parsePart(markup, "chibi-armor")])),
);
