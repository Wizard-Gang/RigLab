import { describe, expect, it } from "vitest";
import { weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { bakeAnimation } from "../../src/export/bake";
import { buildBundle, MANIFEST } from "../../src/export/bundle";
import { clipNotes, toHexframeClip } from "../../src/hexframe/adapter";
import { engineOf } from "../../src/solve";
import { written } from "./written";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** An attack holding the sword from key 0 to key 8, and an idle holding the daggers on its first key. */
function armed(): LibraryModel {
  return modelOf(run(
    initialState(),
    { type: "activateAnimation", name: "attack" },
    { type: "activateAnimation", name: "idle" },
    { type: "setMode", mode: "pose" },
    { type: "holdWeapon", name: "daggers" },
    { type: "activateAnimation", name: "attack" },
    { type: "holdWeapon", name: "sword" },
  ));
}

describe("export bundles with weapons", () => {
  it("write each held weapon by name in config order and pin it in the manifest, with the library's own weapons and bakes", async () => {
    const model = armed();
    const files = await buildBundle(model, { baked: true, generator: "RigLab test" });
    const manifest = JSON.parse(text(files.get(MANIFEST)!));
    expect(manifest.weapons.map((entry: { file: string }) => entry.file)).toEqual(["weapons/sword.weapon.json", "weapons/daggers.weapon.json"]);
    expect(JSON.parse(text(files.get("weapons/sword.weapon.json")!))).toEqual(model.weapons[0]!.weapon);
    expect((await written(files, model)).weapons).toEqual([model.weapons[0]!.weapon, model.weapons[3]!.weapon]);
  });

  it("bake every body's transform on each frame that holds a weapon", async () => {
    const model = armed();
    const attack = model.animations.find((animation) => animation.name === "attack")!;
    const baked = bakeAnimation(model.rig, attack, weaponRigs(model));
    expect(baked.weapons!.map((entry) => entry?.name ?? null)).toEqual([...Array(8).fill("sword"), ...Array(17).fill(null)]);
    expect(Object.keys(baked.weapons![0]!.bodies)).toEqual(["sword"]);
    const idle = bakeAnimation(model.rig, model.animations.find((animation) => animation.name === "idle")!, weaponRigs(model));
    expect(Object.keys(idle.weapons![0]!.bodies)).toEqual(["dagger-front", "dagger-back"]);
    expect("weapons" in bakeAnimation(model.rig, { ...attack, keys: attack.keys.map(({ weapon: _held, ...key }) => key) })).toBe(false);
  });

  it("export Hexframe's clip with the held poses and say the weapon transforms are left out", () => {
    const model = armed();
    const attack = model.animations.find((animation) => animation.name === "attack")!;
    expect(toHexframeClip(model.rig, attack, weaponRigs(model)).poses).toEqual(engineOf(model.rig, attack, weaponRigs(model)).clip.poses);
    expect(clipNotes(attack)).toEqual(["Hexframe's clip has no weapon channel, so the sword transforms are left out; the baked frames carry them"]);
    expect(clipNotes({ ...attack, keys: attack.keys.map(({ weapon: _held, ...key }) => key) })).toEqual([]);
  });
});
