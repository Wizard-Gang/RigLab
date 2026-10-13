// The editor's document, read from the library folder, and the art library that binds to its rig by slot.
import { CHIBI_PARTS, CHIBI_RIG } from "../chibi/chibi";
import { LIBRARY } from "../library/active";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from "../format/document";
import type { RigLabDocument } from "../format/document";
import type { Part } from "../hexframe/parts";
import { WEAPON_PARTS } from "../weapons/weapons";

/** The library folder's rig and animations, with a copy of each weapon a key holds. Save writes them back. */
export function libraryDocument(): RigLabDocument {
  const held = new Set(LIBRARY.animations.flatMap((animation) => animation.keys.flatMap((key) => (key.weapon ? [key.weapon.name] : []))));
  const weapons = LIBRARY.weapons.map((item) => item.weapon).filter((weapon) => held.has(weapon.name));
  const document: RigLabDocument = { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, rig: CHIBI_RIG, animations: LIBRARY.animations };
  return weapons.length ? { ...document, weapons } : document;
}

/** Art by slot: the editor's skin on the chibi bones' own `chibi_*` slots, and the weapons' parts on their `weapon_*` slots. */
export const ART_PARTS: Readonly<Record<string, Part>> = Object.freeze({ ...CHIBI_PARTS, ...WEAPON_PARTS });
