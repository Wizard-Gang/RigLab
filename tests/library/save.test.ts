import { describe, expect, it } from "vitest";
import { planLibrarySave } from "../../src/library/save";
import type { SavePlan } from "../../src/library/save";
import type { LibraryFiles } from "../../src/library/files";
import { placeholderFiles, withChanges } from "./placeholder";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const original = placeholderFiles();
const parse = (path: string): Record<string, unknown> => JSON.parse(original[path]!);
const NAMES = ["unarmed-idle", "unarmed-walk", "unarmed-jump", "unarmed-attack", "unarmed-hit"];
const animation = (name: string): Record<string, unknown> => parse(`animations/${name}.anim.json`);
/** An unarmed animation as the daggers' of its kind: the daggers ride the hands, so its keys need no change. */
const daggers = (name: string): Record<string, unknown> => {
  const source = animation(name);
  return { ...source, name: `daggers-${source.kind as string}`, class: "daggers" };
};
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
    const walk = animation("unarmed-walk");
    const keys = walk.keys as Record<string, unknown>[];
    const edited = { ...walk, keys: [{ ...keys[0], interpolation: "linear" }, ...keys.slice(1)] };
    const result = plan({ rig, animations: NAMES.map((name) => (name === "unarmed-walk" ? edited : animation(name))) });
    expect(result.writes).toEqual({ "animations/unarmed-walk.anim.json": json(edited) });
    expect(result.removes).toEqual([]);
  });

  it("writes the rig to the path its rig line maps", () => {
    const edited = { ...rig, bones: (rig.bones as Record<string, unknown>[]).map((bone) => (bone.name === "head" ? { ...bone, artHeight: 40 } : bone)) };
    expect(Object.keys(plan({ ...current(), rig: edited }).writes)).toEqual(["rigs/chibi.rig.json"]);
  });

  it("puts a new animation in animations/ and maps it after the others", () => {
    const result = plan({ rig, animations: [...NAMES.map(animation), daggers("unarmed-idle")] });
    expect(Object.keys(result.writes).sort()).toEqual(["animations/daggers-idle.anim.json", "config.txt"]);
    expect(configLines(result.writes["config.txt"]!).at(-1)).toBe("animation daggers-idle = animations/daggers-idle.anim.json");
    expect(result.writes["config.txt"]!.replace("animation daggers-idle = animations/daggers-idle.anim.json\n", "")).toBe(original["config.txt"]);
  });

  it("replaces in place: the new file and line take the old ones' place, in the same order", () => {
    const result = plan({ rig, animations: NAMES.map((name) => (name === "unarmed-walk" ? daggers(name) : animation(name))) });
    expect(Object.keys(result.writes).sort()).toEqual(["animations/daggers-walk.anim.json", "config.txt"]);
    expect(result.removes).toEqual(["animations/unarmed-walk.anim.json"]);
    expect(configLines(result.writes["config.txt"]!)).toEqual([
      "animation unarmed-idle = animations/unarmed-idle.anim.json",
      "animation daggers-walk = animations/daggers-walk.anim.json",
      "animation unarmed-jump = animations/unarmed-jump.anim.json",
      "animation unarmed-attack = animations/unarmed-attack.anim.json",
      "animation unarmed-hit = animations/unarmed-hit.anim.json",
    ]);
    expect(result.files["animations/unarmed-walk.anim.json"]).toBeUndefined();
  });

  it("deletes an animation's file and line, and follows the editor's order", () => {
    const result = plan({ rig, animations: ["unarmed-hit", "unarmed-attack", "unarmed-jump", "unarmed-idle"].map(animation) });
    expect(result.removes).toEqual(["animations/unarmed-walk.anim.json"]);
    expect(Object.keys(result.writes)).toEqual(["config.txt"]);
    expect(configLines(result.writes["config.txt"]!).map((line) => line.split(" ")[1])).toEqual(["unarmed-hit", "unarmed-attack", "unarmed-jump", "unarmed-idle"]);
  });

  it("keeps every other config line, comment and blank line, and the file's line endings", () => {
    const config = original["config.txt"]!.replace("animation unarmed-jump", "# jump is the long one\nanimation unarmed-jump").replaceAll("\n", "\r\n");
    const result = plan({ rig, animations: ["unarmed-idle", "unarmed-walk", "unarmed-attack", "unarmed-hit"].map(animation) }, withChanges({ "config.txt": config }));
    const lines = result.writes["config.txt"]!.split("\r\n");
    expect(result.writes["config.txt"]!.replaceAll("\r\n", "")).not.toContain("\n");
    expect(lines.filter((line) => !line.startsWith("animation "))).toEqual(config.split("\r\n").filter((line) => !line.startsWith("animation ")));
    expect(lines.indexOf("animation unarmed-idle = animations/unarmed-idle.anim.json")).toBe(config.split("\r\n").indexOf("animation unarmed-idle = animations/unarmed-idle.anim.json"));
  });

  it("appends animation lines to a config that has none", () => {
    const config = configLines(original["config.txt"]!).reduce((text, line) => text.replace(`${line}\n`, ""), original["config.txt"]!);
    const bare = withChanges({ "config.txt": config });
    const result = plan({ rig, animations: [animation("unarmed-idle")] }, bare);
    expect(result.writes["config.txt"]).toBe(`${config.replace(/\n+$/, "")}\n\nanimation unarmed-idle = animations/unarmed-idle.anim.json\n`);
  });

  it("refuses to save over a path another entry maps", () => {
    const files = withChanges({ "config.txt": original["config.txt"]!.replace("animation unarmed-idle = animations/unarmed-idle.anim.json", "animation unarmed-idle = skins/plain/idle.json") });
    expect(errorsOf(current(), files)).toEqual(["skins/plain/idle.json: animation 'unarmed-idle' cannot be saved over skin 'plain'"]);
  });

  it("refuses a save the library could not load, naming the files", () => {
    const bones = rig.bones as Record<string, unknown>[];
    const tail = { name: "tail", parent: "pelvis", offset: [0, 2], tip: [0, 8], slot: "chibi_tail", artHeight: 6, hand: null, limits: null };
    const errors = errorsOf({ ...current(), rig: { ...rig, bones: [...bones, tail] } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.startsWith("skins/plain"))).toBe(true);
    expect(errorsOf({ ...current(), rig: { ...rig, name: "imp" } }).join("\n")).toMatch(/rigs\/chibi\.rig\.json: is named 'imp'/);
    const stride = { ...animation("unarmed-walk"), name: "stride" };
    expect(errorsOf({ rig, animations: NAMES.map((name) => (name === "unarmed-walk" ? stride : animation(name))) }))
      .toEqual(["animations/stride.anim.json: $.name: must be 'unarmed-walk': an animation is named after its class and kind"]);
  });

  it("refuses a body that is not a rig and named animations", () => {
    expect(errorsOf({ rig })).toEqual(["$: is missing 'animations'"]);
    expect(errorsOf({ ...current(), weapons: [] })).toEqual(["$: has unknown field 'weapons'"]);
    expect(errorsOf({ rig, animations: {} })).toEqual(["$.animations: must be an array"]);
    expect(errorsOf({ rig, animations: [{ name: "1st" }] })).toEqual(["$.animations[0].name: must be a name"]);
    expect(errorsOf({ rig, animations: [animation("unarmed-idle"), animation("unarmed-idle")] })).toEqual(["$.animations[1].name: duplicates animation 'unarmed-idle'"]);
  });
});
