import { describe, expect, it } from "vitest";
import { libraryModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { bakeAnimation } from "../../src/export/bake";
import { buildBundle, MANIFEST } from "../../src/export/bundle";
import { clipNotes, toHexframeClip } from "../../src/hexframe/adapter";
import { LIBRARY } from "../../src/library/active";
import { engineOf } from "../../src/solve";
import { heldAnimation } from "../format/weapon-fixtures";
import { written } from "./written";

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const held = (name: string) => LIBRARY.weapons.find((item) => item.name === name)!;

/** The library's unarmed animations, a daggers idle and a sword attack, each holding its class weapon on every key. */
function armed(): LibraryModel {
  const model = libraryModel(LIBRARY);
  const daggers = heldAnimation(LIBRARY.rig, held("daggers").weapon, held("daggers").hold, "idle");
  const sword = heldAnimation(LIBRARY.rig, held("sword").weapon, held("sword").hold, "attack");
  return { ...model, animations: [...model.animations, daggers, sword] };
}

describe("export bundles with weapons", () => {
  it("write each class weapon by name in config order and pin it in the manifest, with the library's own weapons and bakes", async () => {
    const model = armed();
    const files = await buildBundle(model, { baked: true, generator: "RigLab test" });
    const manifest = JSON.parse(text(files.get(MANIFEST)!));
    expect(manifest.weapons.map((entry: { file: string }) => entry.file)).toEqual(["weapons/sword.weapon.json", "weapons/daggers.weapon.json"]);
    expect(JSON.parse(text(files.get("weapons/sword.weapon.json")!))).toEqual(held("sword").weapon);
    expect(manifest.weapons.map((entry: { hold?: { file: string } }) => entry.hold?.file ?? null)).toEqual(["weapons/sword.hold.json", null]);
    const bundle = await written(files, model);
    expect(bundle.weapons).toEqual([held("sword").weapon, held("daggers").weapon]);
    expect(bundle.holds).toEqual(new Map([["sword", { format: "riglab.hold", version: 1, ...held("sword").hold }]]));
    expect(bundle.rig.paintOrder!.byClip).toMatchObject({ "sword-attack": "both-front" });
    expect(bundle.rig.paintOrder!.byClip).not.toHaveProperty("daggers-idle");
  });

  it("bake every body's transform on every frame of an armed class, and none for an unarmed one", () => {
    const model = armed();
    const named = (name: string) => model.animations.find((animation) => animation.name === name)!;
    const baked = bakeAnimation(model.rig, named("sword-attack"), weaponRigs(model));
    expect(baked.weapons!.map((entry) => entry?.name ?? null)).toEqual(Array(25).fill("sword"));
    expect(Object.keys(baked.weapons![0]!.bodies)).toEqual(["sword"]);
    const idle = bakeAnimation(model.rig, named("daggers-idle"), weaponRigs(model));
    expect(Object.keys(idle.weapons![0]!.bodies)).toEqual(["dagger-front", "dagger-back"]);
    expect("weapons" in bakeAnimation(model.rig, named("unarmed-attack"), weaponRigs(model))).toBe(false);
  });

  it("export Hexframe's clip with the held poses and say the weapon transforms are left out", () => {
    const model = armed();
    const attack = model.animations.find((animation) => animation.name === "sword-attack")!;
    expect(toHexframeClip(model.rig, attack, weaponRigs(model)).poses).toEqual(engineOf(model.rig, attack, weaponRigs(model)).clip.poses);
    expect(clipNotes(attack)).toEqual(["Hexframe's clip has no weapon channel, so the sword transforms are left out; the baked frames carry them"]);
    expect(clipNotes(model.animations[0]!)).toEqual([]);
  });
});
