// Path-aware helpers for the closed RigLab format validators. Every failure names the JSON path it refers to.

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export type JsonObject = Readonly<Record<string, unknown>>;

export class Issues {
  readonly errors: string[] = [];

  add(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  result<T>(value: unknown): Validation<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value: value as T };
  }
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPoint(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

/** Require an object with exactly the allowed keys: `required` must be present, `optional` may be. */
export function closedObject(
  issues: Issues,
  path: string,
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonObject {
  if (!isObject(value)) {
    issues.add(path, "must be an object");
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) issues.add(path, `is missing '${key}'`);
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) issues.add(path, `has unknown field '${key}'`);
  }
  return true;
}

export const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function checkName(issues: Issues, path: string, value: unknown): value is string {
  if (typeof value !== "string" || !NAME.test(value)) {
    issues.add(path, "must be a name of 1-64 letters, digits, '_' or '-', starting with a letter");
    return false;
  }
  return true;
}

export function checkInteger(issues: Issues, path: string, value: unknown, min: number, max: number): value is number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.add(path, `must be an integer from ${min} to ${max}`);
    return false;
  }
  return true;
}
