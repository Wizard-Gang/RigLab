// The weapons the chibi holds: each a riglab.weapon rig with original part art in the `weapons` set.
import axeRig from "../../characters/weapons/axe.weapon.json";
import daggersRig from "../../characters/weapons/daggers.weapon.json";
import spearRig from "../../characters/weapons/spear.weapon.json";
import swordRig from "../../characters/weapons/sword.weapon.json";
import axe from "../../characters/weapons/parts/axe.svg?raw";
import dagger from "../../characters/weapons/parts/dagger.svg?raw";
import spear from "../../characters/weapons/parts/spear.svg?raw";
import sword from "../../characters/weapons/parts/sword.svg?raw";
import { CHIBI_RIG } from "../chibi/chibi";
import type { BodyPlacement, HeldWeapon } from "../format/constraints";
import { validateWeapon } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";

export const WEAPON_ART_SET = "weapons";

function valid(value: unknown): RigLabWeapon {
  const result = validateWeapon(value, CHIBI_RIG);
  if (!result.ok) throw new Error(`weapon is not valid for the chibi:\n${result.errors.join("\n")}`);
  return result.value;
}

/** The weapons, in the order a picker lists them. */
export const WEAPONS: readonly RigLabWeapon[] = Object.freeze([swordRig, spearRig, axeRig, daggersRig].map(valid));

/** Weapon art keyed by the bodies' slots; both daggers share one part. */
export const WEAPON_PARTS: Readonly<Record<string, Part>> = Object.freeze(Object.fromEntries(Object.entries({
  weapon_axe: axe,
  weapon_dagger: dagger,
  weapon_spear: spear,
  weapon_sword: sword,
}).map(([slot, markup]) => [slot, parsePart(markup, WEAPON_ART_SET)])));

/**
 * Where each free body first sits when the chibi, standing at rest, takes a weapon: in front of it at the waist and
 * tilted toward the facing side, so both hands reach their grips and the head never hides the blade. The daggers
 * have no free body: they ride the hands.
 */
const READY: Readonly<Record<string, readonly BodyPlacement[]>> = {
  sword: [{ body: "sword", x: 10, y: -35, rotation: 55 }],
  spear: [{ body: "spear", x: 0, y: -32, rotation: 0 }],
  axe: [{ body: "axe", x: 7, y: -36, rotation: 35 }],
  daggers: [],
};

/** A key's first hold of a weapon: its free bodies at their ready placements. */
export function readyHold(weapon: RigLabWeapon): HeldWeapon {
  return { name: weapon.name, bodies: READY[weapon.name] ?? [] };
}

export function weaponNamed(name: string): RigLabWeapon | null {
  return WEAPONS.find((weapon) => weapon.name === name) ?? null;
}
