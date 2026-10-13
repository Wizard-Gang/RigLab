// Starting documents, and the art library that binds to their rigs by slot.
import { CHIBI_ANIMATIONS, CHIBI_PARTS, CHIBI_RIG } from "../chibi/chibi";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from "../format/document";
import type { RigLabDocument } from "../format/document";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../hexframe/humanoid";
import { HEXFRAME_PARTS } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";

export type TemplateId = "humanoid" | "chibi";

export const TEMPLATES: readonly { readonly id: TemplateId; readonly label: string }[] = [
  { id: "humanoid", label: "Hexframe humanoid" },
  { id: "chibi", label: "Chibi" },
];

/** A new document: a rig with Hexframe's 13 clips as reference animations. */
export function templateDocument(id: TemplateId = "humanoid"): RigLabDocument {
  const [rig, animations] = id === "chibi" ? [CHIBI_RIG, CHIBI_ANIMATIONS] : [HUMANOID_RIG, HUMANOID_ANIMATIONS];
  return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, rig, animations: Object.values(animations) };
}

/** Every art set by slot. Each rig's slots are its own, so each rig draws its own art. */
export const ART_PARTS: Readonly<Record<string, Part>> = Object.freeze({ ...HEXFRAME_PARTS, ...CHIBI_PARTS });
