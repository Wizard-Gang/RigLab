// riglab.document version 1: the editor's save file, one rig and the animations authored against it.
import { validateAnimation } from "./animation";
import type { RigLabAnimation } from "./animation";
import { validateRig } from "./rig";
import type { RigLabRig } from "./rig";
import { closedObject, isObject, Issues } from "./validate";
import type { Validation } from "./validate";

export const DOCUMENT_FORMAT = "riglab.document";
export const DOCUMENT_VERSION = 1;
export const DOCUMENT_EXTENSION = ".riglab.json";

export interface RigLabDocument {
  readonly format: typeof DOCUMENT_FORMAT;
  readonly version: typeof DOCUMENT_VERSION;
  readonly rig: RigLabRig;
  readonly animations: readonly RigLabAnimation[];
}

/** Re-root a nested validator's `$`-relative messages at `path`. */
function nested(issues: Issues, path: string, errors: readonly string[]): void {
  for (const error of errors) issues.errors.push(`${path}${error.slice(1)}`);
}

export function validateDocument(value: unknown): Validation<RigLabDocument> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "rig", "animations"])) return issues.result(value);
  if (value.format !== DOCUMENT_FORMAT) issues.add("$.format", `must be '${DOCUMENT_FORMAT}'`);
  if (value.version !== DOCUMENT_VERSION) issues.add("$.version", `must be ${DOCUMENT_VERSION}`);
  const rig = validateRig(value.rig);
  if (!rig.ok) {
    nested(issues, "$.rig", rig.errors);
    return issues.result(value);
  }
  if (!Array.isArray(value.animations)) {
    issues.add("$.animations", "must be an array");
    return issues.result(value);
  }
  const names = new Set<string>();
  value.animations.forEach((animation: unknown, index) => {
    const path = `$.animations[${index}]`;
    const result = validateAnimation(animation, rig.value);
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
