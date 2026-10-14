// Saving the editor's rig, weapons and animations into a library folder: which files change, and the config.txt that
// maps them. Pure, so the dev server and the tests plan a save the same way; src/library/write.ts puts a plan on disk.
import { HOLD_FILE, HOLD_FORMAT, HOLD_VERSION } from "../format/hold";
import { closedObject, isObject, Issues, NAME } from "../format/validate";
import type { JsonObject, Validation } from "../format/validate";
import { freeBodies, validateWeapon } from "../format/weapon";
import { CONFIG_FILE, parseConfig } from "./config";
import type { ConfigEntry } from "./config";
import type { LibraryFiles } from "./files";
import { loadLibrary, WEAPON_FILE } from "./load";

/** The dev server's save endpoint, and the event it sends every page after writing the folder. */
export const SAVE_ROUTE = "/__riglab/library";
export const SAVED_EVENT = "riglab:library-saved";
export const ANIMATION_DIR = "animations";
export const BACKUP_DIR = "backups";

export interface SavePlan {
  /** Folder-relative path to the new text of every file that changes; `config.txt` only when its mapping does. */
  readonly writes: Readonly<Record<string, string>>;
  /** Folder-relative paths of animation files that leave the library. */
  readonly removes: readonly string[];
  /** The library's files after the save. */
  readonly files: LibraryFiles;
}

/** What `SAVED_EVENT` carries: the save's ID, so the page that saved can tell its own save from another's. */
export interface SavedEvent {
  readonly saveId: string;
  readonly written: readonly string[];
  readonly removed: readonly string[];
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const animationPath = (name: string): string => `${ANIMATION_DIR}/${name}.anim.json`;

/** One library weapon in a save: its rig, and its hold when it has free bodies (null when every body rides a hand). */
interface SavedWeapon {
  readonly weapon: JsonObject;
  readonly hold: JsonObject | null;
}

interface SaveBody {
  readonly rig: JsonObject;
  readonly weapons: readonly SavedWeapon[];
  readonly animations: readonly JsonObject[];
}

/** The body's weapons: each `{ weapon, hold }`, a weapon object and a hold object or null. */
function checkWeapons(issues: Issues, value: unknown): void {
  if (!Array.isArray(value)) {
    issues.add("$.weapons", "must be an array");
    return;
  }
  value.forEach((item: unknown, index) => {
    const path = `$.weapons[${index}]`;
    if (!closedObject(issues, path, item, ["weapon", "hold"])) return;
    if (!isObject(item.weapon)) issues.add(`${path}.weapon`, "must be an object");
    if (item.hold !== null && !isObject(item.hold)) issues.add(`${path}.hold`, "must be an object or null");
  });
}

/** The request body: a rig, the library's weapons and a list of named animations. The loader validates the rest once they are merged. */
function readSave(value: unknown): Validation<SaveBody> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["rig", "weapons", "animations"], []) || issues.errors.length) return issues.result(value);
  if (!isObject(value.rig)) issues.add("$.rig", "must be an object");
  checkWeapons(issues, value.weapons);
  if (!Array.isArray(value.animations)) {
    issues.add("$.animations", "must be an array");
    return issues.result(value);
  }
  const names = new Set<string>();
  value.animations.forEach((animation: unknown, index) => {
    const name = isObject(animation) ? animation.name : undefined;
    if (typeof name !== "string" || !NAME.test(name)) issues.add(`$.animations[${index}].name`, "must be a name");
    else if (names.has(name)) issues.add(`$.animations[${index}].name`, `duplicates animation '${name}'`);
    else names.add(name);
  });
  return issues.result(value);
}

/** `config.txt` with its animation lines replaced by `lines`, where the first one stood (appended when none did). */
function withAnimationLines(text: string, entries: readonly ConfigEntry[], lines: readonly string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const source = text.split(/\r?\n/);
  const old = new Set(entries.filter((entry) => entry.kind === "animation").map((entry) => entry.line - 1));
  const first = Math.min(...old);
  const kept = source.flatMap((line, index) => {
    if (index === first) return [...lines];
    return old.has(index) ? [] : [line];
  });
  if (!old.size) {
    const end = kept.at(-1) === "" ? kept.length - 1 : kept.length;
    const gap = end > 0 && kept[end - 1] !== "" && lines.length ? [""] : [];
    kept.splice(end, 0, ...gap, ...lines);
  }
  return kept.join(eol);
}

/**
 * Each weapon's `weapon.json`, and `hold.json` for one with free bodies, in the directory its line maps. The weapons are
 * the library's, one per `weapon` line in config order, so a save never adds, renames, moves or removes one.
 */
function weaponWrites(weapons: readonly SavedWeapon[], entries: readonly ConfigEntry[], errors: string[]): readonly (readonly [string, string])[] {
  const lines = entries.filter((entry) => entry.kind === "weapon");
  const writes = weapons.flatMap((item, index) => {
    const path = `$.weapons[${index}]`;
    const name = item.weapon.name;
    const line = lines[index];
    if (!line || name !== line.name) {
      const mapped = lines.find((candidate) => candidate.name === name);
      if (mapped) errors.push(`${path}.weapon.name: '${String(name)}' is out of config order; ${CONFIG_FILE}:${mapped.line} maps it`);
      else if (line) errors.push(`${path}.weapon.name: is '${String(name)}', but ${CONFIG_FILE}:${line.line} maps this weapon as '${line.name}'`);
      else errors.push(`${path}.weapon.name: no 'weapon' line in ${CONFIG_FILE} maps '${String(name)}'`);
      return [];
    }
    const checked = validateWeapon(item.weapon);
    if (!checked.ok) {
      errors.push(...checked.errors.map((error) => `${path}.weapon${error.slice(1)}`));
      return [];
    }
    const free = freeBodies(checked.value).length > 0;
    if (!free && item.hold !== null) {
      errors.push(`${path}.hold: must be null: every body of the ${name} rides a hand, so it has no hold`);
      return [];
    }
    if (free && item.hold === null) {
      errors.push(`${path}.hold: must place the ${name}'s free bodies`);
      return [];
    }
    const own = [[`${line.path}/${WEAPON_FILE}`, json(item.weapon)] as const];
    return item.hold ? [...own, [`${line.path}/${HOLD_FILE}`, json({ format: HOLD_FORMAT, version: HOLD_VERSION, ...item.hold })] as const] : own;
  });
  for (const line of lines.slice(weapons.length)) errors.push(`$.weapons: must list every library weapon; '${line.name}' (${CONFIG_FILE}:${line.line}) is missing`);
  return writes;
}

/**
 * Plan writing `save` ({ rig, weapons, animations }) into the library `files`. The rig goes to the path its `rig` line
 * maps; each weapon's `weapon.json` and `hold.json` to the directory its line maps; each animation to its own mapped
 * path, or `animations/<name>.anim.json` when new; the `animation` lines follow the save's order; and a removed or
 * renamed animation's old file leaves. Only files whose text changes are written. A plan whose library would not load
 * is refused.
 */
export function planLibrarySave(files: LibraryFiles, save: unknown): Validation<SavePlan> {
  const body = readSave(save);
  if (!body.ok) return body;
  const configText = files[CONFIG_FILE];
  if (configText === undefined) return { ok: false, errors: [`${CONFIG_FILE}: is missing`] };
  const config = parseConfig(configText);
  if (!config.ok) return config;
  const entries = config.value;
  const rigEntry = entries.find((entry) => entry.kind === "rig")!;
  const mapped = new Map(entries.filter((entry) => entry.kind === "animation").map((entry) => [entry.name, entry.path]));
  const errors: string[] = [];

  const targets = body.value.animations.map((animation) => {
    const name = animation.name as string;
    return { name, path: mapped.get(name) ?? animationPath(name), text: json(animation) };
  });
  const owners = new Map<string, string>([[rigEntry.path, `rig '${rigEntry.name}'`]]);
  for (const entry of entries) {
    if (entry.kind === "skin" || entry.kind === "weapon") owners.set(`${entry.path}/`, `${entry.kind} '${entry.name}'`);
  }
  for (const { name, path } of targets) {
    const taken = [...owners].find(([owned]) => (owned.endsWith("/") ? path.startsWith(owned) : path === owned));
    if (taken) errors.push(`${path}: animation '${name}' cannot be saved over ${taken[1]}`);
    else owners.set(path, `animation '${name}'`);
  }
  const weapons = weaponWrites(body.value.weapons, entries, errors);
  if (errors.length) return { ok: false, errors };

  const writes: Record<string, string> = {};
  const write = (path: string, text: string): void => {
    if (files[path] !== text) writes[path] = text;
  };
  write(rigEntry.path, json(body.value.rig));
  for (const [path, text] of weapons) write(path, text);
  for (const { path, text } of targets) write(path, text);
  const lines = targets.map(({ name, path }) => `animation ${name} = ${path}`);
  write(CONFIG_FILE, withAnimationLines(configText, entries, lines));
  const kept = new Set(targets.map(({ path }) => path));
  const removes = [...mapped.values()].filter((path) => !kept.has(path) && files[path] !== undefined);

  const after: Record<string, string> = { ...files };
  for (const path of removes) delete after[path];
  Object.assign(after, writes);
  const loaded = loadLibrary(after);
  if (!loaded.ok) return loaded;
  return { ok: true, value: { writes, removes, files: after } };
}
