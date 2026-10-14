// Test weapons for the chibi: one free body held by both hands, and two bodies that each ride one hand; and animations
// of a class that hold its weapon.
import { blankAnimation, restPose } from "../../src/editor/animations";
import type { RigLabAnimation } from "../../src/format/animation";
import { animationName } from "../../src/format/classes";
import type { HeldWeapon } from "../../src/format/constraints";
import type { RigLabRig } from "../../src/format/rig";
import type { AnimationKind } from "../../src/format/timing";
import type { RigLabWeapon } from "../../src/format/weapon";
import { holdConstraints } from "../../src/solve/constraints";

/** A staff across both hands: grips 12 apart on its shaft, its tip 30 along +x. */
export const STAFF: RigLabWeapon = {
  format: "riglab.weapon",
  version: 1,
  name: "staff",
  bodies: [{
    name: "staff",
    slot: "weapon_staff",
    axis: [[-10, 0], [30, 0]],
    grips: [{ name: "near", chain: "arm-back", at: [0, 0] }, { name: "far", chain: "arm-front", at: [12, 0] }],
  }],
};

/** Two blades, one riding each hand: each lies back along its forearm (180°), its grip 1 unit from its origin. */
export const TWIN: RigLabWeapon = {
  format: "riglab.weapon",
  version: 1,
  name: "twin",
  bodies: [
    { name: "front", slot: "weapon_blade", axis: [[0, -2], [0, 12]], grips: [{ name: "fist", chain: "arm-front", at: [0, 1], angle: 180 }] },
    { name: "back", slot: "weapon_blade", axis: [[0, -2], [0, 12]], grips: [{ name: "fist", chain: "arm-back", at: [0, 1], angle: 180 }] },
  ],
};

/** Where each fixture's free bodies first sit: the staff level at the waist, and nothing for the riding blades. */
export const HOLDS: Readonly<Record<string, HeldWeapon>> = {
  staff: { name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] },
  twin: { name: "twin", bodies: [] },
};

/** A class's animation of a kind, every key at the rest pose holding the class weapon at `hold` with both hands on it. */
export function heldAnimation(rig: RigLabRig, weapon: RigLabWeapon, hold: HeldWeapon, kind: AnimationKind): RigLabAnimation {
  const blank = blankAnimation(rig, kind);
  const pose = holdConstraints(rig, restPose(rig), { pins: [], weapon: { weapon, bodies: hold.bodies } }).pose;
  return {
    ...blank,
    name: animationName(weapon.name, kind),
    class: weapon.name,
    keys: blank.keys.map((key) => ({ ...key, pose: structuredClone(pose), ...(hold.bodies.length ? { bodies: hold.bodies.map((placement) => ({ ...placement })) } : {}) })),
  };
}
