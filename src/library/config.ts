// config.txt: a library folder's map from each rig, skin, weapon and animation to its path inside the folder.
import { NAME } from "../format/validate";
import type { Validation } from "../format/validate";

export const CONFIG_FILE = "config.txt";

export const LIBRARY_KINDS = ["rig", "skin", "weapon", "animation"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export interface ConfigEntry {
  readonly kind: LibraryKind;
  readonly name: string;
  /** Relative to the folder: a file for a rig or an animation, a directory for a skin or a weapon. */
  readonly path: string;
  /** 1-based, for error messages. */
  readonly line: number;
}

const ENTRY = /^(\S+)\s+(\S+)\s*=\s*(\S+)$/;
const SEGMENTS = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

/** A relative path of plain segments: `/` separators, no `.` or `..` segment, no `\`, no leading or trailing `/`. */
export function isLibraryPath(path: string): boolean {
  return SEGMENTS.test(path) && path.split("/").every((segment) => segment !== "." && segment !== "..");
}

const isKind = (value: string): value is LibraryKind => (LIBRARY_KINDS as readonly string[]).includes(value);

/** Parse `config.txt`: blank lines and `#` comments are skipped, and every other line is `<kind> <name> = <path>`. */
export function parseConfig(text: string): Validation<readonly ConfigEntry[]> {
  const errors: string[] = [];
  const entries: ConfigEntry[] = [];
  const seen = new Map<string, number>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const at = `${CONFIG_FILE}:${line}`;
    const content = raw.trim();
    if (!content || content.startsWith("#")) return;
    const match = ENTRY.exec(content);
    if (!match) {
      errors.push(`${at}: expected '<kind> <name> = <path>'`);
      return;
    }
    const [, kind, name, path] = match as unknown as [string, string, string, string];
    if (!isKind(kind)) {
      errors.push(`${at}: unknown kind '${kind}'; use ${LIBRARY_KINDS.join(", ")}`);
      return;
    }
    if (!NAME.test(name)) errors.push(`${at}: '${name}' must be a name of 1-64 letters, digits, '_' or '-', starting with a letter`);
    if (!isLibraryPath(path)) errors.push(`${at}: path '${path}' must be relative to the folder, with '/' separators and no '..'`);
    const key = `${kind} ${name}`;
    const first = seen.get(key);
    if (first !== undefined) errors.push(`${at}: ${kind} '${name}' is already mapped on line ${first}`);
    else seen.set(key, line);
    entries.push({ kind, name, path, line });
  });
  const rigs = entries.filter((entry) => entry.kind === "rig");
  if (!rigs.length) errors.push(`${CONFIG_FILE}: needs one 'rig' line`);
  for (const extra of rigs.slice(1)) errors.push(`${CONFIG_FILE}:${extra.line}: a library has one rig; line ${rigs[0]!.line} already maps it`);
  return errors.length ? { ok: false, errors } : { ok: true, value: entries };
}
