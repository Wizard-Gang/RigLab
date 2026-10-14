import { describe, expect, it } from "vitest";
import { planLibrarySave } from "../../src/library/save";
import type { SavePlan } from "../../src/library/save";
import type { LibraryFiles } from "../../src/library/files";
import { placeholderFiles, savedWeapons, withChanges } from "./placeholder";

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
const weapons = () => savedWeapons(original);
const current = () => ({ rig, weapons: weapons(), animations: NAMES.map(animation) });

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
    const result = plan({ rig, weapons: weapons(), animations: NAMES.map((name) => (name === "unarmed-walk" ? edited : animation(name))) });
    expect(result.writes).toEqual({ "animations/unarmed-walk.anim.json": json(edited) });
    expect(result.removes).toEqual([]);
  });

  it("writes the rig to the path its rig line maps", () => {
    const edited = { ...rig, bones: (rig.bones as Record<string, unknown>[]).map((bone) => (bone.name === "head" ? { ...bone, artHeight: 40 } : bone)) };
    expect(Object.keys(plan({ ...current(), rig: edited }).writes)).toEqual(["rigs/chibi.rig.json"]);
  });

  it("puts a new animation in animations/ and maps it after the others", () => {
    const result = plan({ rig, weapons: weapons(), animations: [...NAMES.map(animation), daggers("unarmed-idle")] });
    expect(Object.keys(result.writes).sort()).toEqual(["animations/daggers-idle.anim.json", "config.txt"]);
    expect(configLines(result.writes["config.txt"]!).at(-1)).toBe("animation daggers-idle = animations/daggers-idle.anim.json");
    expect(result.writes["config.txt"]!.replace("animation daggers-idle = animations/daggers-idle.anim.json\n", "")).toBe(original["config.txt"]);
  });

  it("replaces in place: the new file and line take the old ones' place, in the same order", () => {
    const result = plan({ rig, weapons: weapons(), animations: NAMES.map((name) => (name === "unarmed-walk" ? daggers(name) : animation(name))) });
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
    const result = plan({ rig, weapons: weapons(), animations: ["unarmed-hit", "unarmed-attack", "unarmed-jump", "unarmed-idle"].map(animation) });
    expect(result.removes).toEqual(["animations/unarmed-walk.anim.json"]);
    expect(Object.keys(result.writes)).toEqual(["config.txt"]);
    expect(configLines(result.writes["config.txt"]!).map((line) => line.split(" ")[1])).toEqual(["unarmed-hit", "unarmed-attack", "unarmed-jump", "unarmed-idle"]);
  });

  it("keeps every other config line, comment and blank line, and the file's line endings", () => {
    const config = original["config.txt"]!.replace("animation unarmed-jump", "# jump is the long one\nanimation unarmed-jump").replaceAll("\n", "\r\n");
    const result = plan({ rig, weapons: weapons(), animations: ["unarmed-idle", "unarmed-walk", "unarmed-attack", "unarmed-hit"].map(animation) }, withChanges({ "config.txt": config }));
    const lines = result.writes["config.txt"]!.split("\r\n");
    expect(result.writes["config.txt"]!.replaceAll("\r\n", "")).not.toContain("\n");
    expect(lines.filter((line) => !line.startsWith("animation "))).toEqual(config.split("\r\n").filter((line) => !line.startsWith("animation ")));
    expect(lines.indexOf("animation unarmed-idle = animations/unarmed-idle.anim.json")).toBe(config.split("\r\n").indexOf("animation unarmed-idle = animations/unarmed-idle.anim.json"));
  });

  it("appends animation lines to a config that has none", () => {
    const config = configLines(original["config.txt"]!).reduce((text, line) => text.replace(`${line}\n`, ""), original["config.txt"]!);
    const bare = withChanges({ "config.txt": config });
    const result = plan({ rig, weapons: weapons(), animations: [animation("unarmed-idle")] }, bare);
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
    expect(errorsOf({ rig, weapons: weapons(), animations: NAMES.map((name) => (name === "unarmed-walk" ? stride : animation(name))) }))
      .toEqual(["animations/stride.anim.json: $.name: must be 'unarmed-walk': an animation is named after its class and kind"]);
  });

  it("refuses a body that is not a rig, the library's weapons and named animations", () => {
    expect(errorsOf({ rig, weapons: weapons() })).toEqual(["$: is missing 'animations'"]);
    expect(errorsOf({ rig, animations: [] })).toEqual(["$: is missing 'weapons'"]);
    expect(errorsOf({ ...current(), extra: 1 })).toEqual(["$: has unknown field 'extra'"]);
    expect(errorsOf({ ...current(), weapons: {} })).toEqual(["$.weapons: must be an array"]);
    expect(errorsOf({ ...current(), weapons: [{ weapon: 1, hold: "x" }] })).toEqual(["$.weapons[0].weapon: must be an object", "$.weapons[0].hold: must be an object or null"]);
    expect(errorsOf({ rig, weapons: weapons(), animations: {} })).toEqual(["$.animations: must be an array"]);
    expect(errorsOf({ rig, weapons: weapons(), animations: [{ name: "1st" }] })).toEqual(["$.animations[0].name: must be a name"]);
    expect(errorsOf({ rig, weapons: weapons(), animations: [animation("unarmed-idle"), animation("unarmed-idle")] })).toEqual(["$.animations[1].name: duplicates animation 'unarmed-idle'"]);
  });
});

describe("saving the library's weapons", () => {
  type Saved = ReturnType<typeof weapons>[number];
  /** The library's weapons with the one named `name` changed. */
  const changed = (name: string, change: (item: Saved) => Saved) => weapons().map((item) => (item.weapon.name === name ? change(item) : item));
  const sword = (item: Saved) => item.weapon as { bodies: { slot: string; grips: { at: number[] }[] }[] };

  it("writes an edited grip to weapon.json alone, and an edited hold to hold.json alone", () => {
    const grip = changed("sword", (item) => {
      const [body] = sword(item).bodies;
      return { ...item, weapon: { ...item.weapon, bodies: [{ ...body, grips: [body!.grips[0], { ...body!.grips[1], at: [0, 13] }] }] } };
    });
    const regripped = plan({ ...current(), weapons: grip });
    expect(Object.keys(regripped.writes)).toEqual(["weapons/sword/weapon.json"]);
    expect(regripped.writes["weapons/sword/weapon.json"]).toBe(json(grip[0]!.weapon));
    const held = changed("spear", (item) => ({ ...item, hold: { ...item.hold, bodies: [{ body: "spear", x: 2, y: -33, rotation: 5 }] } }));
    const moved = plan({ ...current(), weapons: held });
    expect(moved.writes).toEqual({ "weapons/spear/hold.json": json({ format: "riglab.hold", version: 1, name: "spear", bodies: [{ body: "spear", x: 2, y: -33, rotation: 5 }] }) });
    expect(moved.removes).toEqual([]);
    expect(plan(current()).writes).toEqual({});
  });

  it("refuses an unmapped, renamed, moved or missing weapon, writing nothing", () => {
    const flail = { ...weapons()[0]!, weapon: { ...weapons()[0]!.weapon, name: "flail" } };
    expect(errorsOf({ ...current(), weapons: [...weapons(), flail] })).toEqual(["$.weapons[4].weapon.name: no 'weapon' line in config.txt maps 'flail'"]);
    expect(errorsOf({ ...current(), weapons: changed("sword", (item) => ({ ...item, weapon: { ...item.weapon, name: "blade" } })) }))
      .toEqual(["$.weapons[0].weapon.name: is 'blade', but config.txt:10 maps this weapon as 'sword'"]);
    const [first, second, ...rest] = weapons();
    expect(errorsOf({ ...current(), weapons: [second, first, ...rest] })).toEqual([
      "$.weapons[0].weapon.name: 'spear' is out of config order; config.txt:11 maps it",
      "$.weapons[1].weapon.name: 'sword' is out of config order; config.txt:10 maps it",
    ]);
    expect(errorsOf({ ...current(), weapons: weapons().slice(0, 3) })).toEqual(["$.weapons: must list every library weapon; 'daggers' (config.txt:13) is missing"]);
  });

  it("refuses a hold for the daggers, and none for the sword", () => {
    expect(errorsOf({ ...current(), weapons: changed("daggers", (item) => ({ ...item, hold: { name: "daggers", bodies: [] } })) }))
      .toEqual(["$.weapons[3].hold: must be null: every body of the daggers rides a hand, so it has no hold"]);
    expect(errorsOf({ ...current(), weapons: changed("sword", (item) => ({ ...item, hold: null })) })).toEqual(["$.weapons[0].hold: must place the sword's free bodies"]);
  });

  it("refuses a weapon the library could not load, such as a body slot with no part", () => {
    const errors = errorsOf({ ...current(), weapons: changed("sword", (item) => ({ ...item, weapon: { ...item.weapon, bodies: sword(item).bodies.map((body) => ({ ...body, slot: "weapon_saber" })) } })) });
    expect(errors).toContain("weapons/sword/saber.svg: is missing; it draws slot 'weapon_saber'");
    const invalid = errorsOf({ ...current(), weapons: changed("axe", (item) => ({ ...item, weapon: { ...item.weapon, bodies: [] } })) });
    expect(invalid).toEqual(["$.weapons[2].weapon.bodies: must be a non-empty array"]);
  });
});
