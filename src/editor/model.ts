// The editor's model of the library folder: its rig, every weapon with its hold, and the animations. It is never a
// file: Save writes the rig and animations back into the folder.
import { validateAnimation } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import { validateHeldWeaponAlone } from "../format/constraints";
import type { HeldWeapon } from "../format/constraints";
import { validateRig } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import { Issues } from "../format/validate";
import type { Validation } from "../format/validate";
import { validateWeapon } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import type { Library } from "../library/load";

/** A library weapon as the editor holds it: its rig, and where its free bodies first sit. */
export interface ModelWeapon {
  readonly weapon: RigLabWeapon;
  /** Empty when every body rides a hand. */
  readonly hold: HeldWeapon;
}

export interface LibraryModel {
  readonly rig: RigLabRig;
  /** Every library weapon in config order, whether or not a key holds it. */
  readonly weapons: readonly ModelWeapon[];
  readonly animations: readonly RigLabAnimation[];
}

/** The library's rig, weapons and animations, in config order. */
export function libraryModel(library: Library): LibraryModel {
  return {
    rig: library.rig,
    weapons: library.weapons.map((item) => ({ weapon: item.weapon, hold: item.hold })),
    animations: library.animations,
  };
}

/** The weapon rigs keys may hold, in config order. */
export const weaponRigs = (model: LibraryModel): readonly RigLabWeapon[] => model.weapons.map((item) => item.weapon);

/** The weapons some animation's class holds, in config order: what an export bundle lists. */
export function heldWeapons(model: LibraryModel): readonly RigLabWeapon[] {
  const held = new Set(model.animations.map((animation) => animation.class));
  return weaponRigs(model).filter((weapon) => held.has(weapon.name));
}

/** Re-root a nested validator's `$`-relative messages at `path`. */
function nested(issues: Issues, path: string, errors: readonly string[]): void {
  for (const error of errors) issues.errors.push(`${path}${error.slice(1)}`);
}

/** Each weapon valid for the rig and uniquely named, with a hold for it; the weapon rigs, or null when any is not. */
function validateWeapons(issues: Issues, model: LibraryModel, rig: RigLabRig): readonly RigLabWeapon[] | null {
  const before = issues.errors.length;
  const names = new Set<string>();
  const weapons = model.weapons.flatMap(({ weapon, hold }, index) => {
    const path = `$.weapons[${index}]`;
    const result = validateWeapon(weapon, rig);
    if (!result.ok) {
      nested(issues, `${path}.weapon`, result.errors);
      return [];
    }
    if (names.has(weapon.name)) issues.add(`${path}.weapon.name`, `duplicates weapon '${weapon.name}'`);
    names.add(weapon.name);
    validateHeldWeaponAlone(issues, `${path}.hold`, hold, result.value);
    return [result.value];
  });
  return issues.errors.length === before ? weapons : null;
}

/** Check the model whole, with every nested message re-rooted at its path in the model. */
export function validateModel(model: LibraryModel): Validation<LibraryModel> {
  const issues = new Issues();
  const rig = validateRig(model.rig);
  if (!rig.ok) {
    nested(issues, "$.rig", rig.errors);
    return issues.result(model);
  }
  const weapons = validateWeapons(issues, model, rig.value);
  if (!weapons) return issues.result(model);
  const names = new Set<string>();
  model.animations.forEach((animation, index) => {
    const path = `$.animations[${index}]`;
    const result = validateAnimation(animation, rig.value, weapons);
    if (!result.ok) nested(issues, path, result.errors);
    if (names.has(animation.name)) issues.add(`${path}.name`, `duplicates animation '${animation.name}': a library holds one animation of each class and kind`);
    names.add(animation.name);
  });
  return issues.result(model);
}
