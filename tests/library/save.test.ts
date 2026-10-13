import { describe, expect, it } from "vitest";
import { planLibrarySave } from "../../src/library/save";
import type { SavePlan } from "../../src/library/save";
import type { LibraryFiles } from "../../src/library/files";
import { placeholderFiles, withChanges } from "./placeholder";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const original = placeholderFiles();
const parse = (path: string): Record<string, unknown> => JSON.parse(original[path]!);
const NAMES = ["idle", "walk", "jump", "attack", "hit"];
const animation = (name: string): Record<string, unknown> => parse(`animations/${name}.anim.json`);
const rig = parse("rigs/chibi.rig.json");
const current = () => ({ rig, animations: NAMES.map(animation) });

function plan(save: unknown, files: LibraryFiles = original): SavePlan {
  const result = planLibrarySave(files, save);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}
const errorsOf = (save: unknown, files: LibraryFiles = original): readonly string[] => {
  const result = planLibrarySave(files, save);
  return result.ok ? [] : result.errors;
};
const configLines = (text: string): readonly string[] => text.split("\n").filter((line) => line.startsWith("animation "));

describe("planning a library save", () => {
  it("changes nothing when the editor saves what the folder holds", () => {
    expect(plan(current())).toMatchObject({ writes: {}, removes: [] });
  });

  it("writes an edited animation to its own path, and only that file", () => {
    const walk = animation("walk");
    const keys = walk.keys as Record<string, unknown>[];
    const edited = { ...walk, keys: [{ ...keys[0], interpolation: "linear" }, ...keys.slice(1)] };
    const result = plan({ rig, animations: NAMES.map((name) => (name === "walk" ? edited : animation(name))) });
    expect(result.writes).toEqual({ "animations/walk.anim.json": json(edited) });
    expect(result.removes).toEqual([]);
  });

  it("writes the rig to the path its rig line maps", () => {
    const edited = { ...rig, bones: (rig.bones as Record<string, unknown>[]).map((bone) => (bone.name === "head" ? { ...bone, artHeight: 40 } : bone)) };
    expect(Object.keys(plan({ ...current(), rig: edited }).writes)).toEqual(["rigs/chibi.rig.json"]);
  });

  it("puts a new animation in animations/ and maps it after the others", () => {
    const sway = { ...animation("idle"), name: "sway" };
    const result = plan({ rig, animations: [...NAMES.map(animation), sway] });
    expect(Object.keys(result.writes).sort()).toEqual(["animations/sway.anim.json", "config.txt"]);
    expect(configLines(result.writes["config.txt"]!).at(-1)).toBe("animation sway = animations/sway.anim.json");
    expect(result.writes["config.txt"]!.replace("animation sway = animations/sway.anim.json\n", "")).toBe(original["config.txt"]);
  });

  it("renames in place: the new file and line replace the old ones, in the same order", () => {
    const stride = { ...animation("walk"), name: "stride" };
    const result = plan({ rig, animations: NAMES.map((name) => (name === "walk" ? stride : animation(name))) });
    expect(Object.keys(result.writes).sort()).toEqual(["animations/stride.anim.json", "config.txt"]);
    expect(result.removes).toEqual(["animations/walk.anim.json"]);
    expect(configLines(result.writes["config.txt"]!)).toEqual([
      "animation idle = animations/idle.anim.json",
      "animation stride = animations/stride.anim.json",
      "animation jump = animations/jump.anim.json",
      "animation attack = animations/attack.anim.json",
      "animation hit = animations/hit.anim.json",
    ]);
    expect(result.files["animations/walk.anim.json"]).toBeUndefined();
  });

  it("deletes an animation's file and line, and follows the editor's order", () => {
    const result = plan({ rig, animations: ["hit", "attack", "jump", "idle"].map(animation) });
    expect(result.removes).toEqual(["animations/walk.anim.json"]);
    expect(Object.keys(result.writes)).toEqual(["config.txt"]);
    expect(configLines(result.writes["config.txt"]!).map((line) => line.split(" ")[1])).toEqual(["hit", "attack", "jump", "idle"]);
  });

  it("keeps every other config line, comment and blank line, and the file's line endings", () => {
    const config = original["config.txt"]!.replace("animation jump", "# jump is the long one\nanimation jump").replaceAll("\n", "\r\n");
    const result = plan({ rig, animations: ["idle", "walk", "attack", "hit"].map(animation) }, withChanges({ "config.txt": config }));
    const lines = result.writes["config.txt"]!.split("\r\n");
    expect(result.writes["config.txt"]!.replaceAll("\r\n", "")).not.toContain("\n");
    expect(lines.filter((line) => !line.startsWith("animation "))).toEqual(config.split("\r\n").filter((line) => !line.startsWith("animation ")));
    expect(lines.indexOf("animation idle = animations/idle.anim.json")).toBe(config.split("\r\n").indexOf("animation idle = animations/idle.anim.json"));
  });

  it("appends animation lines to a config that has none", () => {
    const config = configLines(original["config.txt"]!).reduce((text, line) => text.replace(`${line}\n`, ""), original["config.txt"]!);
    const bare = withChanges({ "config.txt": config });
    const result = plan({ rig, animations: [animation("idle")] }, bare);
    expect(result.writes["config.txt"]).toBe(`${config.replace(/\n+$/, "")}\n\nanimation idle = animations/idle.anim.json\n`);
  });

  it("refuses to save over a path another entry maps", () => {
    const files = withChanges({ "config.txt": original["config.txt"]!.replace("animation idle = animations/idle.anim.json", "animation idle = skins/plain/idle.json") });
    expect(errorsOf(current(), files)).toEqual(["skins/plain/idle.json: animation 'idle' cannot be saved over skin 'plain'"]);
  });

  it("refuses a save the library could not load, naming the files", () => {
    const bones = rig.bones as Record<string, unknown>[];
    const tail = { name: "tail", parent: "pelvis", offset: [0, 2], tip: [0, 8], slot: "chibi_tail", artHeight: 6, hand: null, limits: null };
    const errors = errorsOf({ ...current(), rig: { ...rig, bones: [...bones, tail] } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.startsWith("skins/plain"))).toBe(true);
    expect(errorsOf({ ...current(), rig: { ...rig, name: "imp" } }).join("\n")).toMatch(/rigs\/chibi\.rig\.json: is named 'imp'/);
  });

  it("refuses a body that is not a rig and named animations", () => {
    expect(errorsOf({ rig })).toEqual(["$: is missing 'animations'"]);
    expect(errorsOf({ ...current(), weapons: [] })).toEqual(["$: has unknown field 'weapons'"]);
    expect(errorsOf({ rig, animations: {} })).toEqual(["$.animations: must be an array"]);
    expect(errorsOf({ rig, animations: [{ name: "1st" }] })).toEqual(["$.animations[0].name: must be a name"]);
    expect(errorsOf({ rig, animations: [animation("idle"), animation("idle")] })).toEqual(["$.animations[1].name: duplicates animation 'idle'"]);
  });
});
