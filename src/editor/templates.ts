// The starting document, and the art library that binds to its rig by slot.
import { CHIBI_PARTS, CHIBI_RIG } from "../chibi/chibi";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from "../format/document";
import type { RigLabDocument } from "../format/document";
import type { Part } from "../hexframe/parts";

/** A new document: the chibi rig, with no animations yet. */
export function templateDocument(): RigLabDocument {
  return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, rig: CHIBI_RIG, animations: [] };
}

/** Art by slot: the chibi parts, keyed by the chibi bones' own `chibi_*` slots. */
export const ART_PARTS: Readonly<Record<string, Part>> = CHIBI_PARTS;
