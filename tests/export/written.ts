// What export writes, checked directly: the manifest (version 2) lists every other file and pins each by its byte length
// and SHA-256; the rig carries the paint order Hexframe resolves for every profile and facing and the clip map Hexframe's
// export writes; the animation, weapon and hold files parse back to the model's own; and each baked file equals a fresh
// bake of them.
import { expect } from "vitest";
import { visualPaintOrder } from "../../vendor/hexframe/src/rig";
import { bakeAnimation } from "../../src/export/bake";
import type { RigLabBaked } from "../../src/export/bake";
import { EXPORT_VERSION, MANIFEST, sha256 } from "../../src/export/bundle";
import type { Manifest, Pinned } from "../../src/export/bundle";
import { heldWeapons } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { createRigLabRig, HELD_PAINT, validateRig } from "../../src/format";
import type { RigLabAnimation, RigLabHold, RigLabRig, RigLabWeapon } from "../../src/format";
import { toHexframeRig } from "../../src/hexframe/adapter";

/** A bundle's files as written, parsed. */
export interface Written {
  readonly manifest: Manifest;
  readonly rig: RigLabRig;
  readonly animations: readonly RigLabAnimation[];
  readonly weapons: readonly RigLabWeapon[];
  /** Each held weapon's hold file by its name; a weapon whose bodies all ride a hand has none. */
  readonly holds: ReadonlyMap<string, RigLabHold>;
  /** Each baked file by its animation's name; empty when the bundle has none. */
  readonly baked: ReadonlyMap<string, RigLabBaked>;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** The rig's paint order, checked against Hexframe's own resolution and adapter; the rest must be the model's rig. */
function checkRig(rig: RigLabRig, model: LibraryModel): void {
  expect(validateRig(rig).ok).toBe(true);
  const { paintOrder, ...rest } = rig;
  const { paintOrder: _library, ...own } = model.rig;
  expect(rest).toEqual(own);
  if (!model.rig.depthProfiles) {
    expect(paintOrder).toBeUndefined();
    return;
  }
  const runtime = createRigLabRig(rig);
  for (const name of Object.keys(model.rig.depthProfiles.profiles)) {
    expect(paintOrder!.profiles[name], name).toEqual({ right: visualPaintOrder(runtime, 1, name), left: visualPaintOrder(runtime, -1, name) });
  }
  const hexframe = toHexframeRig(model.rig, model.animations);
  expect(hexframe.ok && paintOrder!.byClip).toEqual(hexframe.ok && hexframe.value.depthProfiles.byClip);
  expect(paintOrder!.held).toEqual(HELD_PAINT);
}

/** Check the files `buildBundle` wrote for `model`, and return them parsed: only the weapons its keys hold are written. */
export async function written(files: ReadonlyMap<string, Uint8Array>, model: LibraryModel): Promise<Written> {
  const parsed = <T>(file: string): T => JSON.parse(decoder.decode(files.get(file)!)) as T;
  const manifest = parsed<Manifest>(MANIFEST);
  expect(manifest.version).toBe(EXPORT_VERSION);
  const weaponFiles = (manifest.weapons ?? []).flatMap((entry): Pinned[] => (entry.hold ? [entry, entry.hold] : [entry]));
  const entries: Pinned[] = [manifest.rig, ...manifest.animations, ...weaponFiles, ...(manifest.baked ?? [])];
  expect([...files.keys()]).toEqual([MANIFEST, ...entries.map((entry) => entry.file)]);
  for (const entry of entries) {
    expect(files.get(entry.file)!.length, entry.file).toBe(entry.bytes);
    expect(await sha256(files.get(entry.file)!), entry.file).toBe(entry.sha256);
  }
  const rig = parsed<RigLabRig>(manifest.rig.file);
  checkRig(rig, model);
  const animations = manifest.animations.map((entry) => parsed<RigLabAnimation>(entry.file));
  const weapons = (manifest.weapons ?? []).map((entry) => parsed<RigLabWeapon>(entry.file));
  expect({ animations, weapons }).toEqual({ animations: model.animations, weapons: heldWeapons(model) });
  const holds = new Map((manifest.weapons ?? []).flatMap((entry) => (entry.hold ? [[entry.name, parsed<RigLabHold>(entry.hold.file)] as const] : [])));
  const expectedHolds = model.weapons.filter((item) => item.hold.bodies.length && weapons.some((weapon) => weapon.name === item.weapon.name));
  expect(holds).toEqual(new Map(expectedHolds.map((item) => [item.weapon.name, { format: "riglab.hold", version: 1, ...item.hold }])));
  const baked = new Map((manifest.baked ?? []).map((entry) => [entry.animation, parsed<RigLabBaked>(entry.file)]));
  expect([...baked.keys()]).toEqual(manifest.baked ? animations.map((animation) => animation.name) : []);
  for (const [name, bake] of baked) {
    expect(bake, name).toEqual(bakeAnimation(rig, animations.find((animation) => animation.name === name)!, weapons));
  }
  return { manifest, rig, animations, weapons, holds, baked };
}
