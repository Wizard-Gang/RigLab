import { describe, expect, it } from "vitest";
import { documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { bakeAnimation } from "../../src/export/bake";
import { buildBundle, MANIFEST } from "../../src/export/bundle";
import type { RigLabDocument } from "../../src/format";
import { clipNotes, toHexframeClip } from "../../src/hexframe/adapter";
import { engineOf } from "../../src/solve";
import { written } from "./written";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** An attack holding the sword from key 0 to key 8, and an idle holding the daggers on its first key. */
function armed(): RigLabDocument {
  return documentOf(run(
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
  it("write each weapon by name and pin it in the manifest, with the document's own weapons and bakes", async () => {
    const document = armed();
    expect(document.weapons!.map((weapon) => weapon.name)).toEqual(["daggers", "sword"]);
    const files = await buildBundle(document, { baked: true, generator: "RigLab test" });
    const manifest = JSON.parse(text(files.get(MANIFEST)!));
    expect(manifest.weapons.map((entry: { file: string }) => entry.file)).toEqual(["weapons/daggers.weapon.json", "weapons/sword.weapon.json"]);
    expect(JSON.parse(text(files.get("weapons/sword.weapon.json")!))).toEqual(document.weapons![1]);
    expect((await written(files, document)).weapons).toEqual(document.weapons);
  });

  it("bake every body's transform on each frame that holds a weapon", async () => {
    const document = armed();
    const attack = document.animations.find((animation) => animation.name === "attack")!;
    const baked = bakeAnimation(document.rig, attack, document.weapons);
    expect(baked.weapons!.map((entry) => entry?.name ?? null)).toEqual([...Array(8).fill("sword"), ...Array(17).fill(null)]);
    expect(Object.keys(baked.weapons![0]!.bodies)).toEqual(["sword"]);
    const idle = bakeAnimation(document.rig, document.animations.find((animation) => animation.name === "idle")!, document.weapons);
    expect(Object.keys(idle.weapons![0]!.bodies)).toEqual(["dagger-front", "dagger-back"]);
    expect("weapons" in bakeAnimation(document.rig, { ...attack, keys: attack.keys.map(({ weapon: _held, ...key }) => key) })).toBe(false);
  });

  it("export Hexframe's clip with the held poses and say the weapon transforms are left out", () => {
    const document = armed();
    const attack = document.animations.find((animation) => animation.name === "attack")!;
    expect(toHexframeClip(document.rig, attack, document.weapons).poses).toEqual(engineOf(document.rig, attack, document.weapons).clip.poses);
    expect(clipNotes(attack)).toEqual(["Hexframe's clip has no weapon channel, so the sword transforms are left out; the baked frames carry them"]);
    expect(clipNotes({ ...attack, keys: attack.keys.map(({ weapon: _held, ...key }) => key) })).toEqual([]);
  });
});
