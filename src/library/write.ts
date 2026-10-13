// Node only: put a save plan into the library folder, backing up what it replaces, and remember what RigLab wrote.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { CONFIG_FILE } from "./config";
import { BACKUP_DIR } from "./save";
import type { SavePlan } from "./save";

export const TEMP_MARK = ".riglab-tmp-";

export interface WriteResult {
  readonly written: readonly string[];
  readonly removed: readonly string[];
  /** Folder-relative backup folder holding the previous version of every replaced or removed file, or null. */
  readonly backup: string | null;
  /** Absolute paths RigLab touched, backups included, for the dev server to recognise its own changes. */
  readonly touched: readonly string[];
}

/** `2026-10-13T21-04-05-123Z`: a UTC timestamp that sorts and is a valid file name everywhere. */
export const backupStamp = (now: Date): string => now.toISOString().replace(/[:.]/g, "-");

/**
 * Write `plan` into the folder `dir`. Each file goes through a temporary file and a rename, `config.txt` is the last
 * write, and removals come after it, so the config never maps a file that is not there. Before anything changes, the
 * previous version of every file that will be replaced or removed is copied into `backups/<stamp>/`. Every path must
 * stay inside the folder's real path, symlinks included.
 */
export function writeLibrarySave(dir: string, plan: SavePlan, now = new Date()): WriteResult {
  const base = realpathSync(dir);
  const touched: string[] = [];
  const inside = (path: string): boolean => path === base || path.startsWith(base + sep);
  const target = (relative: string): string => {
    const path = resolve(base, relative);
    let existing = path;
    while (!existsSync(existing)) existing = dirname(existing);
    if (path === base || !inside(path) || !inside(realpathSync(existing))) {
      throw new Error(`${relative}: resolves outside the library folder`);
    }
    return path;
  };

  const order = Object.keys(plan.writes).sort((a, b) => Number(a === CONFIG_FILE) - Number(b === CONFIG_FILE));
  const paths = new Map([...order, ...plan.removes].map((relative) => [relative, target(relative)]));
  const replaced = [...order, ...plan.removes].filter((relative) => existsSync(paths.get(relative)!));
  const backup = replaced.length ? `${BACKUP_DIR}/${backupStamp(now)}` : null;
  for (const relative of replaced) {
    const copy = target(`${backup}/${relative}`);
    mkdirSync(dirname(copy), { recursive: true });
    writeFileSync(copy, readFileSync(paths.get(relative)!));
    touched.push(copy);
  }
  for (const relative of order) {
    const path = paths.get(relative)!;
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}${TEMP_MARK}${randomBytes(4).toString("hex")}`;
    writeFileSync(temporary, plan.writes[relative]!);
    renameSync(temporary, path);
    touched.push(path);
  }
  for (const relative of plan.removes) {
    rmSync(paths.get(relative)!, { force: true });
    touched.push(paths.get(relative)!);
  }
  return { written: order, removed: [...plan.removes], backup, touched };
}

/**
 * The paths RigLab itself just wrote, so the dev server's watcher can tell a save from an outside edit. A path counts
 * as RigLab's for `windowMs` after the save, which covers the several events a single write can raise.
 */
export class RecentWrites {
  private readonly until = new Map<string, number>();

  constructor(private readonly windowMs = 3_000, private readonly clock: () => number = Date.now) {}

  add(paths: readonly string[]): void {
    const until = this.clock() + this.windowMs;
    for (const path of paths) this.until.set(path, until);
  }

  /** True for a path RigLab wrote within the window, or for one of its temporary files. */
  owns(path: string): boolean {
    if (path.includes(TEMP_MARK)) return true;
    const until = this.until.get(path);
    if (until === undefined) return false;
    if (this.clock() <= until) return true;
    this.until.delete(path);
    return false;
  }
}
