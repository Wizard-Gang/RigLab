import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { ANIMATION_KINDS } from "../../src/format/timing";
import { loadLibrary } from "../../src/library/load";
import type { LibraryFiles } from "../../src/library/files";
import { readyHold, WEAPONS } from "../../src/weapons/weapons";
import { placeholderFiles, withChanges } from "./placeholder";

const errorsOf = (files: LibraryFiles): readonly string[] => {
  const result = loadLibrary(files);
  return result.ok ? [] : result.errors;
};
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const original = placeholderFiles();
const edited = (path: string, edit: (value: Record<string, unknown>) => unknown): string => json(edit(JSON.parse(original[path]!)));

describe("library loading", () => {
  it("loads the placeholder: today's chibi rig and weapons, three skins, holds and one animation per kind", () => {
    const result = loadLibrary(original);
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (!result.ok) return;
    const { rig, skins, weapons, animations } = result.value;
    expect(rig).toEqual(CHIBI_RIG);
    expect(weapons.map((item) => item.weapon)).toEqual(WEAPONS);
    expect(weapons.map((item) => item.hold)).toEqual(WEAPONS.map(readyHold));
    expect(skins.map((skin) => skin.name)).toEqual(["plain", "block", "pixel"]);
    for (const skin of skins) {
      expect(Object.keys(skin.parts).sort()).toEqual(rig.bones.map((bone) => bone.slot).sort());
      for (const bone of rig.bones) expect(skin.parts[bone.slot]).toMatchObject({ bone: bone.name, set: skin.name });
    }
    expect(Object.keys(weapons.find((item) => item.name === "daggers")!.parts)).toEqual(["weapon_dagger"]);
    expect(animations.map((animation) => animation.kind)).toEqual(ANIMATION_KINDS);
  });

  it("needs a config.txt and at least one skin", () => {
    expect(errorsOf(withChanges({ "config.txt": null }))).toEqual(["config.txt: is missing"]);
    const noSkins = original["config.txt"]!.replace(/^skin .*$/gm, "");
    expect(errorsOf(withChanges({ "config.txt": noSkins }))).toEqual(["config.txt: needs at least one 'skin' line"]);
  });

  it("refuses a skin with a missing or extra part, a wrong bone or an undefined class token", () => {
    expect(errorsOf(withChanges({ "skins/plain/head.svg": null }))).toEqual(["skins/plain/head.svg: is missing; it draws slot 'chibi_head'"]);
    const head = original["skins/plain/head.svg"]!;
    expect(errorsOf(withChanges({ "skins/plain/hat.svg": head }))).toEqual(["skins/plain/hat.svg: draws none of the slots this directory is for"]);
    expect(errorsOf(withChanges({ "skins/plain/head.svg": head.replace('data-bone="head"', 'data-bone="torso"') }))).toEqual(["skins/plain/head.svg: data-bone 'torso' must be 'head'"]);
    expect(errorsOf(withChanges({ "skins/plain/head.svg": head.replace('class="part"', 'class="part part--hat"') }))).toEqual(["skins/plain/head.svg: class 'part--hat' is not defined in skins/plain/palette.json"]);
    expect(errorsOf(withChanges({ "skins/plain/head.svg": head.replace("<path", '<image href="x"/><path') }))[0]).toMatch(/^skins\/plain\/head\.svg: part 'head': unexpected content/);
    expect(errorsOf(withChanges({ "skins/plain/notes.json": "{}" }))).toEqual(["skins/plain/notes.json: is not a file this directory takes"]);
  });

  it("refuses a palette with an unknown field or a bad color, under its file", () => {
    const path = "skins/block/palette.json";
    expect(errorsOf(withChanges({ [path]: edited(path, (value) => ({ ...value, label: "Block" })) }))).toEqual([`${path}: $: has unknown field 'label'`]);
    expect(errorsOf(withChanges({ [path]: edited(path, (value) => ({ ...value, classes: { part: { fill: "url(#x)" } } })) }))).toEqual([`${path}: $.classes.part.fill: must be '#rrggbb' or 'none'`]);
    expect(errorsOf(withChanges({ [path]: "{" }))[0]).toMatch(/^skins\/block\/palette\.json: is not valid JSON/);
  });

  it("refuses a weapon whose name, hold or slots do not fit", () => {
    const weapon = "weapons/sword/weapon.json";
    expect(errorsOf(withChanges({ [weapon]: edited(weapon, (value) => ({ ...value, name: "blade" })) }))).toEqual(["weapons/sword/weapon.json: is named 'blade', but config.txt:10 maps it as 'sword'"]);
    expect(errorsOf(withChanges({ "weapons/sword/hold.json": null }))).toEqual(["weapons/sword/hold.json: is missing"]);
    const hold = "weapons/spear/hold.json";
    expect(errorsOf(withChanges({ [hold]: edited(hold, (value) => ({ ...value, bodies: [] })) }))).toEqual([`${hold}: $.bodies: must place free body 'spear'`]);
    expect(errorsOf(withChanges({ [hold]: edited(hold, (value) => ({ ...value, name: "axe" })) }))).toEqual([`${hold}: $.name: must be 'spear'`]);
    const axe = "weapons/axe/weapon.json";
    const clash = edited(axe, (value) => ({ ...value, bodies: (value.bodies as object[]).map((body) => ({ ...body, slot: "weapon_sword" })) }));
    expect(errorsOf(withChanges({ [axe]: clash, "weapons/axe/axe.svg": null, "weapons/axe/sword.svg": original["weapons/sword/sword.svg"]! }))).toEqual(["weapons/axe/sword.svg: slot 'weapon_sword' is already drawn by weapon 'sword'"]);
  });

  it("refuses an animation for another rig or under another name", () => {
    const path = "animations/walk.anim.json";
    expect(errorsOf(withChanges({ [path]: edited(path, (value) => ({ ...value, rig: "fighter" })) }))).toEqual([`${path}: $.rig: must name rig 'chibi'`]);
    expect(errorsOf(withChanges({ [path]: edited(path, (value) => ({ ...value, name: "stroll" })) }))).toEqual([`${path}: is named 'stroll', but config.txt:16 maps it as 'walk'`]);
  });

  it("names a rig file that is missing or not a rig", () => {
    expect(errorsOf(withChanges({ "rigs/chibi.rig.json": null }))).toEqual(["rigs/chibi.rig.json: is missing"]);
    expect(errorsOf(withChanges({ "rigs/chibi.rig.json": json({ format: "riglab.rig" }) }))[0]).toMatch(/^rigs\/chibi\.rig\.json: \$/);
  });
});
