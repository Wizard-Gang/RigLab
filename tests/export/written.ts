// What export writes, checked directly: the manifest lists every other file and pins each by SHA-256, the rig,
// animation and weapon files parse back to the model's own, and each baked file equals a fresh bake of them.
import { expect } from "vitest";
import { bakeAnimation } from "../../src/export/bake";
import type { RigLabBaked } from "../../src/export/bake";
import { MANIFEST, sha256 } from "../../src/export/bundle";
import type { Manifest } from "../../src/export/bundle";
import { heldWeapons } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import type { RigLabAnimation, RigLabRig, RigLabWeapon } from "../../src/format";

/** A bundle's files as written, parsed. */
export interface Written {
  readonly manifest: Manifest;
  readonly rig: RigLabRig;
  readonly animations: readonly RigLabAnimation[];
  readonly weapons: readonly RigLabWeapon[];
  /** Each baked file by its animation's name; empty when the bundle has none. */
  readonly baked: ReadonlyMap<string, RigLabBaked>;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Check the files `buildBundle` wrote for `model`, and return them parsed: only the weapons its keys hold are written. */
export async function written(files: ReadonlyMap<string, Uint8Array>, model: LibraryModel): Promise<Written> {
  const parsed = <T>(file: string): T => JSON.parse(decoder.decode(files.get(file)!)) as T;
  const manifest = parsed<Manifest>(MANIFEST);
  const entries = [manifest.rig, ...manifest.animations, ...(manifest.weapons ?? []), ...(manifest.baked ?? [])];
  expect([...files.keys()]).toEqual([MANIFEST, ...entries.map((entry) => entry.file)]);
  for (const entry of entries) expect(await sha256(files.get(entry.file)!), entry.file).toBe(entry.sha256);
  const rig = parsed<RigLabRig>(manifest.rig.file);
  const animations = manifest.animations.map((entry) => parsed<RigLabAnimation>(entry.file));
  const weapons = (manifest.weapons ?? []).map((entry) => parsed<RigLabWeapon>(entry.file));
  expect({ rig, animations, weapons }).toEqual({ rig: model.rig, animations: model.animations, weapons: heldWeapons(model) });
  const baked = new Map((manifest.baked ?? []).map((entry) => [entry.animation, parsed<RigLabBaked>(entry.file)]));
  expect([...baked.keys()]).toEqual(manifest.baked ? animations.map((animation) => animation.name) : []);
  for (const [name, bake] of baked) {
    expect(bake, name).toEqual(bakeAnimation(rig, animations.find((animation) => animation.name === name)!, weapons));
  }
  return { manifest, rig, animations, weapons, baked };
}
