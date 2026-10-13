// A library folder, loaded: the rig, its skins, the weapons it holds and the animations new documents start with.
import { validateAnimation } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import type { HeldWeapon } from "../format/constraints";
import { HOLD_FILE, validateHold } from "../format/hold";
import { validateRig } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import type { Validation } from "../format/validate";
import { freeBodies, validateWeapon } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import { readArtSet } from "./art";
import type { ArtSet } from "./art";
import { CONFIG_FILE, parseConfig } from "./config";
import type { ConfigEntry } from "./config";
import { LibraryErrors, readJson, slotStem } from "./files";
import type { LibraryFiles } from "./files";

export const WEAPON_FILE = "weapon.json";

export type LibrarySkin = ArtSet;

export interface LibraryWeapon extends ArtSet {
  readonly weapon: RigLabWeapon;
  /** Where its free bodies first sit; empty when every body rides a hand. */
  readonly hold: HeldWeapon;
}

/** Everything in config order. */
export interface Library {
  readonly rig: RigLabRig;
  readonly skins: readonly LibrarySkin[];
  readonly weapons: readonly LibraryWeapon[];
  readonly animations: readonly RigLabAnimation[];
}

const entryFile = (entry: ConfigEntry): string => `${CONFIG_FILE}:${entry.line}`;

function sameName(errors: LibraryErrors, entry: ConfigEntry, file: string, name: string): boolean {
  if (name === entry.name) return true;
  errors.add(file, `is named '${name}', but ${entryFile(entry)} maps it as '${entry.name}'`);
  return false;
}

function readRig(files: LibraryFiles, entry: ConfigEntry, errors: LibraryErrors): RigLabRig | null {
  const value = readJson(files, entry.path, errors);
  if (value === undefined) return null;
  const result = validateRig(value);
  errors.nested(entry.path, result);
  if (!result.ok) return null;
  sameName(errors, entry, entry.path, result.value.name);
  return result.value;
}

function readSkin(files: LibraryFiles, entry: ConfigEntry, rig: RigLabRig, errors: LibraryErrors): LibrarySkin | null {
  const slots = rig.bones.map((bone) => ({ slot: bone.slot, bone: bone.name }));
  return readArtSet(files, entry.name, entry.path, slots, [], errors);
}

function readWeapon(files: LibraryFiles, entry: ConfigEntry, rig: RigLabRig, errors: LibraryErrors): LibraryWeapon | null {
  const before = errors.errors.length;
  const path = `${entry.path}/${WEAPON_FILE}`;
  const value = readJson(files, path, errors);
  if (value === undefined) return null;
  const result = validateWeapon(value, rig);
  errors.nested(path, result);
  if (!result.ok) return null;
  const weapon = result.value;
  if (!sameName(errors, entry, path, weapon.name)) return null;
  // Bodies may share a slot (both daggers draw one part), so a weapon part names its slot's stem, not a body.
  const slots = [...new Set(weapon.bodies.map((body) => body.slot))].map((slot) => ({ slot, bone: slotStem(slot) }));
  const art = readArtSet(files, entry.name, entry.path, slots, [WEAPON_FILE, HOLD_FILE], errors);
  const holdPath = `${entry.path}/${HOLD_FILE}`;
  let hold: HeldWeapon = { name: weapon.name, bodies: [] };
  if (files[holdPath] !== undefined || freeBodies(weapon).length) {
    const holdValue = readJson(files, holdPath, errors);
    const held = holdValue === undefined ? null : validateHold(holdValue, weapon);
    if (held) errors.nested(holdPath, held);
    if (held?.ok) hold = held.value;
  }
  return art && errors.errors.length === before ? { ...art, weapon, hold } : null;
}

/** No two art sets of different kinds may draw the same slot: the editor looks parts up by slot alone. */
function checkSlots(errors: LibraryErrors, rig: RigLabRig, weapons: readonly (readonly [ConfigEntry, LibraryWeapon])[]): void {
  const owner = new Map(rig.bones.map((bone) => [bone.slot, `rig '${rig.name}'`]));
  for (const [entry, weapon] of weapons) {
    for (const slot of Object.keys(weapon.parts)) {
      const taken = owner.get(slot);
      if (taken) errors.add(`${entry.path}/${slotStem(slot)}.svg`, `slot '${slot}' is already drawn by ${taken}`);
      else owner.set(slot, `weapon '${weapon.name}'`);
    }
  }
}

function readAnimation(files: LibraryFiles, entry: ConfigEntry, rig: RigLabRig, weapons: readonly RigLabWeapon[], errors: LibraryErrors): RigLabAnimation | null {
  const value = readJson(files, entry.path, errors);
  if (value === undefined) return null;
  const result = validateAnimation(value, rig, weapons);
  errors.nested(entry.path, result);
  if (!result.ok) return null;
  sameName(errors, entry, entry.path, result.value.name);
  return result.value;
}

/** Load a library from its files. A failure lists every problem found, each under its file or `config.txt` line. */
export function loadLibrary(files: LibraryFiles): Validation<Library> {
  const text = files[CONFIG_FILE];
  if (text === undefined) return { ok: false, errors: [`${CONFIG_FILE}: is missing`] };
  const config = parseConfig(text);
  if (!config.ok) return config;
  const errors = new LibraryErrors();
  const of = (kind: ConfigEntry["kind"]) => config.value.filter((entry) => entry.kind === kind);
  const rig = readRig(files, of("rig")[0]!, errors);
  if (!rig) return { ok: false, errors: errors.errors };
  if (!of("skin").length) errors.add(CONFIG_FILE, "needs at least one 'skin' line");
  const skins = of("skin").flatMap((entry) => readSkin(files, entry, rig, errors) ?? []);
  const read = of("weapon").flatMap((entry) => {
    const weapon = readWeapon(files, entry, rig, errors);
    return weapon ? [[entry, weapon] as const] : [];
  });
  checkSlots(errors, rig, read);
  const weapons = read.map(([, weapon]) => weapon);
  const rigs = weapons.map((item) => item.weapon);
  const animations = of("animation").flatMap((entry) => readAnimation(files, entry, rig, rigs, errors) ?? []);
  if (errors.errors.length) return { ok: false, errors: errors.errors };
  return { ok: true, value: { rig, skins, weapons, animations } };
}
