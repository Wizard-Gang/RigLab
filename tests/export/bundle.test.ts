import { describe, expect, it } from "vitest";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { libraryModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { setKeyPose } from "../../src/editor/poseEdits";
import { bakeAnimation, frameCount } from "../../src/export/bake";
import { buildBundle, EXPORT_ROOT } from "../../src/export/bundle";
import { crc32, zip } from "../../src/export/zip";
import { poseFrames } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { chainEnd, dragInPose, engineOf, NO_CONSTRAINTS, place, playAt, togglePin } from "../../src/solve";
import { written } from "./written";

const rig = LIBRARY.rig;
const GENERATOR = "RigLab test";

/** A looping crouch, the unarmed idle, whose first two keys pin both feet while the pelvis drops, then a blank walk and hit. */
function authored(): LibraryModel {
  const rest = restPose(rig);
  let feet = NO_CONSTRAINTS;
  for (const chain of ["leg-front", "leg-back"]) {
    const result = togglePin(rig, rest, feet, chain);
    if (!result.ok) throw new Error(result.error);
    feet = result.constraints;
  }
  const planted = setKeyPose(rig, blankAnimation(rig, "idle"), 0, rest, feet);
  if (!planted.ok) throw new Error(planted.error);
  const low = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 3, y: -20 });
  if (low.status !== "ok") throw new Error(low.message ?? low.status);
  const keyed = setKeyPose(rig, planted.animation, 15, low.pose, low.constraints);
  if (!keyed.ok) throw new Error(keyed.error);
  return { ...libraryModel(LIBRARY), animations: [keyed.animation, blankAnimation(rig, "walk"), blankAnimation(rig, "hit")] };
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Read a ZIP's stored entries by their local headers: just enough to check what the writer wrote. */
function storedEntries(archive: Uint8Array): Map<string, { readonly crc: number; readonly bytes: Uint8Array }> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries = new Map<string, { readonly crc: number; readonly bytes: Uint8Array }>();
  for (let at = 0; view.getUint32(at, true) === 0x04034b50;) {
    expect(view.getUint16(at + 8, true), "method").toBe(0);
    const [size, nameEnd] = [view.getUint32(at + 18, true), at + 30 + view.getUint16(at + 26, true)];
    const start = nameEnd + view.getUint16(at + 28, true);
    entries.set(text(archive.subarray(at + 30, nameEnd)), { crc: view.getUint32(at + 14, true), bytes: archive.slice(start, start + size) });
    at = start + size;
  }
  return entries;
}

describe("riglab-export bundles", () => {
  it("lay out a manifest, the rig, every animation and optional baked frames", async () => {
    const files = await buildBundle(authored(), { baked: true, generator: GENERATOR });
    expect([...files.keys()]).toEqual([
      "manifest.json", "chibi.rig.json",
      "animations/unarmed-idle.anim.json", "animations/unarmed-walk.anim.json", "animations/unarmed-hit.anim.json",
      "baked/unarmed-idle.baked.json", "baked/unarmed-walk.baked.json", "baked/unarmed-hit.baked.json",
    ]);
    const manifest = JSON.parse(text(files.get("manifest.json")!));
    expect(manifest).toMatchObject({ format: "riglab.export", version: 1, generator: GENERATOR, rig: { name: "chibi", file: "chibi.rig.json" } });
    expect(manifest.animations.map((entry: { sha256: string }) => entry.sha256)).toHaveLength(3);
    expect(JSON.parse(text(files.get("animations/unarmed-idle.anim.json")!))).toMatchObject({ version: 3, class: "unarmed", kind: "idle", fps: 60, length: 60, loop: true });
    expect((await buildBundle(authored(), { baked: false, generator: GENERATOR })).has("baked/unarmed-idle.baked.json")).toBe(false);
  });

  it("pin every file by SHA-256, write the model's own rig and animations, and bake each one fresh", async () => {
    const model = authored();
    for (const baked of [true, false]) {
      const bundle = await written(await buildBundle(model, { baked, generator: GENERATOR }), model);
      expect([bundle.animations.length, bundle.weapons.length, bundle.baked.size]).toEqual([3, 0, baked ? 3 : 0]);
    }
  });

  it("bake every Hexframe tick as the engine plays it, through Hexframe's FK", () => {
    const animation = authored().animations[0]!;
    const baked = bakeAnimation(rig, animation);
    expect([baked.fps, baked.loop, baked.frames.length]).toEqual([60, true, 60]);
    expect(frameCount({ ...animation, loop: false })).toBe(61);
    const engine = engineOf(rig, animation);
    for (let frame = 0; frame < baked.frames.length; frame += 1) {
      const placed = place(rig, playAt(engine, frame).pose);
      baked.bones.forEach((bone, index) => {
        const [x, y, rotation] = baked.frames[frame]![index]!;
        const at = placed.get(bone)!;
        expect(Math.abs(x - at.x) + Math.abs(y - at.y) + Math.abs(rotation - (at.rotation * 180) / Math.PI)).toBeLessThan(3e-6);
      });
    }
    // Both feet hold their pins on Hexframe's poses up to the unpinned key at 30, and a bake has no `props` field.
    for (const frame of poseFrames(animation.length).filter((frame) => frame < 30)) {
      const played = playAt(engine, frame);
      expect(played.constraints.pins, `frame ${frame}`).toHaveLength(2);
      for (const pin of played.constraints.pins) {
        const end = chainEnd(rig, played.pose, rig.chains.find((chain) => chain.name === pin.chain)!);
        expect(Math.hypot(end.x - pin.x, end.y - pin.y), `${pin.chain} at frame ${frame}`).toBeLessThan(1e-5);
      }
    }
    expect(Object.keys(baked)).toEqual(["format", "version", "rig", "animation", "fps", "loop", "bones", "frames"]);
  });
});

describe("zip", () => {
  it("stores every bundle file under riglab-export/ with its bytes and CRC, the same way every time", async () => {
    const files = await buildBundle(authored(), { baked: true, generator: GENERATOR });
    const archive = zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])));
    const entries = storedEntries(archive);
    expect([...entries.keys()]).toEqual([...files.keys()].map((path) => `${EXPORT_ROOT}/${path}`));
    for (const [path, bytes] of files) expect(entries.get(`${EXPORT_ROOT}/${path}`), path).toEqual({ crc: crc32(bytes), bytes });
    // The central directory's end record counts every entry.
    expect(new DataView(archive.buffer).getUint16(archive.length - 22 + 10, true)).toBe(files.size);
    expect(zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])))).toEqual(archive);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
