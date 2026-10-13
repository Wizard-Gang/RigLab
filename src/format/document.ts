// riglab.document version 1: the editor's in-memory model, one rig, the animations authored against it and the weapons
// they hold. It is never a file: the library folder holds the rig and animations, and Save writes them there.
import { validateAnimation } from "./animation";
import type { RigLabAnimation } from "./animation";
import { validateRig } from "./rig";
import type { RigLabRig } from "./rig";
import { closedObject, isObject, Issues } from "./validate";
import type { Validation } from "./validate";
import { validateWeapon } from "./weapon";
import type { RigLabWeapon } from "./weapon";

export const DOCUMENT_FORMAT = "riglab.document";
export const DOCUMENT_VERSION = 1;

export interface RigLabDocument {
  readonly format: typeof DOCUMENT_FORMAT;
  readonly version: typeof DOCUMENT_VERSION;
  readonly rig: RigLabRig;
  readonly animations: readonly RigLabAnimation[];
  /** A copy of each weapon rig its keys hold, so the document stays self-contained; omitted when there are none. */
  readonly weapons?: readonly RigLabWeapon[];
}

/** Re-root a nested validator's `$`-relative messages at `path`. */
function nested(issues: Issues, path: string, errors: readonly string[]): void {
  for (const error of errors) issues.errors.push(`${path}${error.slice(1)}`);
}

/** The document's weapons, each valid for its rig and uniquely named, or null when any is not. */
function validateWeapons(issues: Issues, value: unknown, rig: RigLabRig): readonly RigLabWeapon[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.add("$.weapons", "must be an array");
    return null;
  }
  const before = issues.errors.length;
  const names = new Set<string>();
  const weapons = value.flatMap((weapon: unknown, index) => {
    const result = validateWeapon(weapon, rig);
    if (!result.ok) {
      nested(issues, `$.weapons[${index}]`, result.errors);
      return [];
    }
    if (names.has(result.value.name)) issues.add(`$.weapons[${index}].name`, `duplicates weapon '${result.value.name}'`);
    names.add(result.value.name);
    return [result.value];
  });
  return issues.errors.length === before ? weapons : null;
}

export function validateDocument(value: unknown): Validation<RigLabDocument> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "rig", "animations"], ["weapons"])) return issues.result(value);
  if (value.format !== DOCUMENT_FORMAT) issues.add("$.format", `must be '${DOCUMENT_FORMAT}'`);
  if (value.version !== DOCUMENT_VERSION) issues.add("$.version", `must be ${DOCUMENT_VERSION}`);
  const rig = validateRig(value.rig);
  if (!rig.ok) {
    nested(issues, "$.rig", rig.errors);
    return issues.result(value);
  }
  const weapons = validateWeapons(issues, value.weapons, rig.value);
  if (!weapons) return issues.result(value);
  if (!Array.isArray(value.animations)) {
    issues.add("$.animations", "must be an array");
    return issues.result(value);
  }
  const names = new Set<string>();
  value.animations.forEach((animation: unknown, index) => {
    const path = `$.animations[${index}]`;
    const result = validateAnimation(animation, rig.value, weapons);
    if (!result.ok) nested(issues, path, result.errors);
    const name = isObject(animation) ? animation.name : undefined;
    if (typeof name === "string") {
      if (names.has(name)) issues.add(`${path}.name`, `duplicates animation '${name}'`);
      names.add(name);
    }
  });
  return issues.result(value);
}

export function serializeDocument(document: RigLabDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Parse and validate a saved document; a failure names the first offending path and changes nothing. */
export function parseDocument(text: string): Validation<RigLabDocument> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`$: is not valid JSON (${(error as Error).message})`] };
  }
  return validateDocument(value);
}
