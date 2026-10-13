import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLibraryFolder } from "../../src/library/folder";
import { loadLibrary } from "../../src/library/load";
import { planLibrarySave } from "../../src/library/save";
import { backupStamp, RecentWrites, TEMP_MARK, writeLibrarySave } from "../../src/library/write";
import { PLACEHOLDER } from "./placeholder";

let scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "riglab-write-"));
  scratch.push(dir);
  return dir;
};
const copy = (): string => {
  const dir = join(temp(), "library");
  cpSync(PLACEHOLDER, dir, { recursive: true });
  return dir;
};
const read = (dir: string, path: string): string => readFileSync(join(dir, path), "utf8");
const NAMES = ["idle", "walk", "jump", "attack", "hit"];
const NOW = new Date("2026-10-13T21:04:05.123Z");
const allFiles = (dir: string): readonly string[] => readdirSync(dir, { recursive: true }).map(String);

function renameWalk(dir: string) {
  const files = readLibraryFolder(dir).files;
  const animation = (name: string) => JSON.parse(files[`animations/${name}.anim.json`]!);
  const save = {
    rig: JSON.parse(files["rigs/chibi.rig.json"]!),
    animations: NAMES.map((name) => (name === "walk" ? { ...animation("walk"), name: "stride" } : animation(name))),
  };
  const plan = planLibrarySave(files, save);
  if (!plan.ok) throw new Error(plan.errors.join("\n"));
  return { files, plan: plan.value };
}

describe("writing a library save", () => {
  it("writes the plan, backs up what it replaces, and leaves no temporary file", () => {
    const dir = copy();
    const { files, plan } = renameWalk(dir);
    const result = writeLibrarySave(dir, plan, NOW);
    expect(result.written).toEqual(["animations/stride.anim.json", "config.txt"]);
    expect(result.removed).toEqual(["animations/walk.anim.json"]);
    expect(result.backup).toBe("backups/2026-10-13T21-04-05-123Z");
    expect(read(dir, "animations/stride.anim.json")).toBe(plan.writes["animations/stride.anim.json"]);
    expect(read(dir, "config.txt")).toBe(plan.writes["config.txt"]);
    expect(existsSync(join(dir, "animations/walk.anim.json"))).toBe(false);
    expect(read(dir, `${result.backup}/config.txt`)).toBe(files["config.txt"]);
    expect(read(dir, `${result.backup}/animations/walk.anim.json`)).toBe(files["animations/walk.anim.json"]);
    expect(existsSync(join(dir, `${result.backup}/animations/stride.anim.json`))).toBe(false);
    expect(allFiles(dir).filter((path) => path.includes(TEMP_MARK))).toEqual([]);
    const real = realpathSync(dir);
    expect(result.touched).toEqual(expect.arrayContaining([join(real, "backups"), join(real, result.backup!), join(real, result.backup!, "animations"), join(real, "config.txt")]));
    expect(result.touched).not.toContain(real);
    expect(readLibraryFolder(dir).errors).toEqual([]);
    const reloaded = loadLibrary(readLibraryFolder(dir).files);
    expect(reloaded.ok && reloaded.value.animations.map((item) => item.name)).toEqual(["idle", "stride", "jump", "attack", "hit"]);
  });

  it("makes no backup when nothing it writes existed before", () => {
    const dir = copy();
    const { files } = renameWalk(dir);
    const result = writeLibrarySave(dir, { writes: { "animations/new.anim.json": "{}\n" }, removes: [], files }, NOW);
    expect(result.backup).toBeNull();
    expect(existsSync(join(dir, "backups"))).toBe(false);
  });

  it("refuses a path that leaves the folder, through .. or a symlink, before writing anything", () => {
    const dir = copy();
    const { files, plan } = renameWalk(dir);
    expect(() => writeLibrarySave(dir, { writes: { "../escape.txt": "x" }, removes: [], files }, NOW)).toThrow(/resolves outside the library folder/);
    const outside = temp();
    rmSync(join(dir, "animations"), { recursive: true });
    mkdirSync(join(outside, "animations"));
    symlinkSync(join(outside, "animations"), join(dir, "animations"));
    const before = read(dir, "config.txt");
    expect(() => writeLibrarySave(dir, plan, NOW)).toThrow(/animations\/stride\.anim\.json: resolves outside the library folder/);
    expect(read(dir, "config.txt")).toBe(before);
    expect(readdirSync(join(outside, "animations"))).toEqual([]);
    expect(existsSync(join(dir, "backups"))).toBe(false);
  });

  it("stamps backups in sortable UTC", () => {
    expect(backupStamp(NOW)).toBe("2026-10-13T21-04-05-123Z");
  });
});

describe("recognising RigLab's own writes", () => {
  it("owns a written path for its window, and every temporary file", () => {
    let now = 1_000;
    const recent = new RecentWrites(3_000, () => now);
    recent.add(["/lib/config.txt"]);
    expect(recent.owns("/lib/config.txt")).toBe(true);
    expect(recent.owns("/lib/skins/plain/head.svg")).toBe(false);
    expect(recent.owns(`/lib/config.txt${TEMP_MARK}0a1b2c3d`)).toBe(true);
    now = 4_001;
    expect(recent.owns("/lib/config.txt")).toBe(false);
  });
});
