// The weapons the chibi holds: the library folder's riglab.weapon rigs, each with its own part art, palette and hold.
import type { HeldWeapon } from "../format/constraints";
import type { RigLabWeapon } from "../format/weapon";
import type { Part } from "../hexframe/parts";
import { LIBRARY } from "../library/active";

/** The weapons, in the order a picker lists them: the library's `weapon` lines. */
export const WEAPONS: readonly RigLabWeapon[] = Object.freeze(LIBRARY.weapons.map((item) => item.weapon));

/** Weapon art keyed by the bodies' slots; both daggers share one part. Each weapon draws in its own art set. */
export const WEAPON_PARTS: Readonly<Record<string, Part>> = Object.freeze(Object.assign({}, ...LIBRARY.weapons.map((item) => item.parts)));

/**
 * A key's first hold of a weapon: its free bodies where the library's `hold.json` places them, in front of the chibi
 * at the waist and tilted toward the facing side, so both hands reach their grips and the head never hides the blade.
 * The daggers have no free body: they ride the hands.
 */
export function readyHold(weapon: RigLabWeapon): HeldWeapon {
  return LIBRARY.weapons.find((item) => item.name === weapon.name)?.hold ?? { name: weapon.name, bodies: [] };
}

export function weaponNamed(name: string): RigLabWeapon | null {
  return WEAPONS.find((weapon) => weapon.name === name) ?? null;
}
