// riglab.part version 1: one pixel-art part as a grid of palette keys, placed on its bone by the grid's top-left pixel.
import { CLASS_TOKEN } from "./palette";
import { checkInteger, checkName, closedObject, isObject, Issues } from "./validate";
import type { Validation } from "./validate";

export const PART_FORMAT = "riglab.part";
export const PART_VERSION = 1;
export const PART_EXTENSION = ".part.json";
/** Rig units per pixel: every pixel is a 2 × 2 cell in its bone's frame. */
export const PIXEL_UNITS = 2;
/** The one row character that draws nothing. */
export const TRANSPARENT = ".";
export const MAX_PART_PIXELS = 256;
export const MAX_PART_ORIGIN = 1024;

/** A key is one printable ASCII character other than a space and `.`. */
const KEY = /^[!-~]$/;

export interface RigLabPart {
  readonly format: typeof PART_FORMAT;
  readonly version: typeof PART_VERSION;
  /** The bone the part is drawn for. */
  readonly bone: string;
  /** The top-left pixel's position in the bone's frame, in pixels of `PIXEL_UNITS` rig units. */
  readonly origin: readonly [number, number];
  /** Width and height in pixels. */
  readonly size: readonly [number, number];
  /** One string per pixel row, top to bottom, each `size[0]` characters long. */
  readonly rows: readonly string[];
  /** Each row character's class tokens, in the palette's cascade order, such as `part part--ink`. */
  readonly keys: Readonly<Record<string, string>>;
}

function checkClasses(issues: Issues, path: string, value: unknown): void {
  const tokens = typeof value === "string" ? value.split(" ") : [];
  if (!tokens.length || tokens.some((token) => !CLASS_TOKEN.test(token)) || new Set(tokens).size !== tokens.length) {
    issues.add(path, "must be distinct class tokens separated by single spaces, such as 'part part--ink'");
  }
}

/**
 * A closed grid: every row is `size[0]` characters, there are `size[1]` rows, and every character is `.` or a key.
 * Every key is used, and the part draws at least one pixel, so one picture has exactly one file.
 */
export function validatePart(value: unknown): Validation<RigLabPart> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "bone", "origin", "size", "rows", "keys"])) return issues.result(value);
  if (value.format !== PART_FORMAT) issues.add("$.format", `must be '${PART_FORMAT}'`);
  if (value.version !== PART_VERSION) issues.add("$.version", `must be ${PART_VERSION}`);
  checkName(issues, "$.bone", value.bone);
  const pair = (field: "origin" | "size", min: number, max: number): readonly number[] | null => {
    const item = value[field];
    if (!Array.isArray(item) || item.length !== 2) {
      issues.add(`$.${field}`, "must be two integers");
      return null;
    }
    return item.every((n, index) => checkInteger(issues, `$.${field}[${index}]`, n, min, max)) ? item : null;
  };
  pair("origin", -MAX_PART_ORIGIN, MAX_PART_ORIGIN);
  const size = pair("size", 1, MAX_PART_PIXELS);
  const keys = value.keys;
  const known = new Set<string>();
  if (!isObject(keys)) issues.add("$.keys", "must be an object");
  else {
    for (const [key, classes] of Object.entries(keys)) {
      if (!KEY.test(key) || key === TRANSPARENT) issues.add(`$.keys`, `key '${key}' must be one printable character other than a space and '${TRANSPARENT}'`);
      else known.add(key);
      checkClasses(issues, `$.keys['${key}']`, classes);
    }
  }
  const rows = value.rows;
  if (!Array.isArray(rows) || !rows.every((row) => typeof row === "string")) {
    issues.add("$.rows", "must be an array of strings");
    return issues.result(value);
  }
  if (size && rows.length !== size[1]) issues.add("$.rows", `must hold ${size[1]} rows, as size[1] says; found ${rows.length}`);
  const used = new Set<string>();
  rows.forEach((row: string, y) => {
    if (size && row.length !== size[0]) issues.add(`$.rows[${y}]`, `must be ${size[0]} characters, as size[0] says; found ${row.length}`);
    [...row].forEach((char, x) => {
      if (char === TRANSPARENT) return;
      if (known.has(char)) used.add(char);
      else issues.add(`$.rows[${y}]`, `pixel ${x} '${char}' is not '${TRANSPARENT}' or a key`);
    });
  });
  for (const key of known) if (!used.has(key)) issues.add(`$.keys['${key}']`, "is never used");
  if (!used.size && !issues.errors.length) issues.add("$.rows", "must draw at least one pixel");
  return issues.result(value);
}

/** Every drawn pixel as its key and its top-left corner in the bone's frame, in rig units, row by row. */
export function partPixels(part: RigLabPart): readonly { readonly key: string; readonly x: number; readonly y: number }[] {
  const [left, top] = part.origin;
  return part.rows.flatMap((row, y) => [...row].flatMap((key, x) =>
    key === TRANSPARENT ? [] : [{ key, x: (left + x) * PIXEL_UNITS, y: (top + y) * PIXEL_UNITS }]));
}

/** The canonical file text: two-space JSON with a trailing newline, a pair on one line and one line per row and key. */
export function serializePart(part: RigLabPart): string {
  const text = JSON.stringify;
  const pair = ([a, b]: readonly [number, number]) => `[${a}, ${b}]`;
  const block = (lines: readonly string[]) => lines.map((line) => `    ${line}`).join(",\n");
  return [
    "{",
    `  "format": ${text(part.format)},`,
    `  "version": ${part.version},`,
    `  "bone": ${text(part.bone)},`,
    `  "origin": ${pair(part.origin)},`,
    `  "size": ${pair(part.size)},`,
    `  "rows": [\n${block(part.rows.map((row) => text(row)))}\n  ],`,
    `  "keys": {\n${block(Object.entries(part.keys).map(([key, classes]) => `${text(key)}: ${text(classes)}`))}\n  }`,
    "}",
    "",
  ].join("\n");
}
