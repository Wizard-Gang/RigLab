// The starting document, and the art library that binds to its rig by slot.
import { CHIBI_PARTS, CHIBI_RIG } from "../chibi/chibi";
import { LIBRARY } from "../library/active";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from "../format/document";
import type { RigLabDocument } from "../format/document";
import type { Part } from "../hexframe/parts";
import { WEAPON_PARTS } from "../weapons/weapons";

/** A new document: the library's rig and the animations it seeds every document with. */
export function templateDocument(): RigLabDocument {
  return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, rig: CHIBI_RIG, animations: LIBRARY.animations };
}

/** Art by slot: the editor's skin on the chibi bones' own `chibi_*` slots, and the weapons' parts on their `weapon_*` slots. */
export const ART_PARTS: Readonly<Record<string, Part>> = Object.freeze({ ...CHIBI_PARTS, ...WEAPON_PARTS });
