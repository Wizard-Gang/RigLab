import { describe, expect, it } from "vitest";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { libraryDocument } from "../../src/editor/templates";
import { setKeyPose } from "../../src/editor/poseEdits";
import { bakeAnimation, frameCount } from "../../src/export/bake";
import { buildBundle, EXPORT_ROOT, readBundle } from "../../src/export/bundle";
import { crc32, unzip, zip } from "../../src/export/zip";
import { poseFrames } from "../../src/format";
import type { RigLabDocument } from "../../src/format";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { chainEnd, dragInPose, engineOf, NO_CONSTRAINTS, place, playAt, togglePin } from "../../src/solve";

const rig = CHIBI_RIG;
const GENERATOR = "RigLab test";

/** A blank idle and walk, plus a looping crouch whose first two keys pin both feet while the pelvis drops. */
function authored(): RigLabDocument {
  const rest = restPose(rig);
  let feet = NO_CONSTRAINTS;
  for (const chain of ["leg-front", "leg-back"]) {
    const result = togglePin(rig, rest, feet, chain);
    if (!result.ok) throw new Error(result.error);
    feet = result.constraints;
  }
  const planted = setKeyPose(rig, blankAnimation(rig, "crouch", "idle"), 0, rest, feet);
  if (!planted.ok) throw new Error(planted.error);
  const low = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 3, y: -20 });
  if (low.status !== "ok") throw new Error(low.message ?? low.status);
  const keyed = setKeyPose(rig, planted.animation, 15, low.pose, low.constraints);
  if (!keyed.ok) throw new Error(keyed.error);
  return { ...libraryDocument(), animations: [blankAnimation(rig, "idle", "idle"), blankAnimation(rig, "walk", "walk"), keyed.animation] };
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

async function refusal(change: (files: Map<string, Uint8Array>) => void | Promise<void>): Promise<string> {
  const files = await buildBundle(authored(), { baked: true, generator: GENERATOR });
  await change(files);
  const result = await readBundle(files);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("riglab-export bundles", () => {
  it("lay out a manifest, the rig, every animation and optional baked frames", async () => {
    const files = await buildBundle(authored(), { baked: true, generator: GENERATOR });
    expect([...files.keys()]).toEqual([
      "manifest.json", "chibi.rig.json",
      "animations/idle.anim.json", "animations/walk.anim.json", "animations/crouch.anim.json",
      "baked/idle.baked.json", "baked/walk.baked.json", "baked/crouch.baked.json",
    ]);
    const manifest = JSON.parse(text(files.get("manifest.json")!));
    expect(manifest).toMatchObject({ format: "riglab.export", version: 1, generator: GENERATOR, rig: { name: "chibi", file: "chibi.rig.json" } });
    expect(manifest.animations.map((entry: { sha256: string }) => entry.sha256)).toHaveLength(3);
    expect(JSON.parse(text(files.get("animations/crouch.anim.json")!))).toMatchObject({ version: 2, kind: "idle", fps: 60, length: 60, loop: true });
    expect((await buildBundle(authored(), { baked: false, generator: GENERATOR })).has("baked/idle.baked.json")).toBe(false);
  });

  it("re-import deep-equal, from the folder layout or from a zip", async () => {
    const document = authored();
    const files = await buildBundle(document, { baked: true, generator: GENERATOR });
    expect(await readBundle(files)).toEqual({ ok: true, value: document });
    const archive = zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])));
    expect(zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])))).toEqual(archive);
    expect(await readBundle(await unzip(archive))).toEqual({ ok: true, value: document });
  });

  it("bake every Hexframe tick as the engine plays it, through Hexframe's FK", () => {
    const animation = authored().animations[2]!;
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

  it("refuse a tampered file, an unknown version and a missing or dangling reference", async () => {
    expect(await refusal((files) => {
      const bytes = files.get("animations/walk.anim.json")!;
      bytes[40] = bytes[40]! ^ 1;
    })).toBe("manifest.json $.animations[1].sha256: does not match animations/walk.anim.json");
    expect(await refusal((files) => {
      files.set("manifest.json", bytesOf({ ...JSON.parse(text(files.get("manifest.json")!)), version: 2 }));
    })).toBe("manifest.json $.version: must be 1");
    expect(await refusal((files) => { files.delete("baked/idle.baked.json"); }))
      .toBe("manifest.json $.baked[0].file: names missing file baked/idle.baked.json");
    expect(await refusal((files) => {
      const manifest = JSON.parse(text(files.get("manifest.json")!));
      manifest.baked[0].animation = "ghost";
      manifest.baked[0].file = "baked/ghost.baked.json";
      files.set("baked/ghost.baked.json", files.get("baked/idle.baked.json")!);
      files.set("manifest.json", bytesOf(manifest));
    })).toBe("manifest.json $.baked[0].animation: names no animation in the bundle");
    expect(await refusal((files) => { files.delete("manifest.json"); })).toBe("bundle: names missing file manifest.json");
  });

  it("refuse content that disagrees with the manifest, even with matching hashes", async () => {
    const message = await refusal(async (files) => {
      const manifest = JSON.parse(text(files.get("manifest.json")!));
      const walk = JSON.parse(text(files.get("animations/walk.anim.json")!));
      const renamed = bytesOf({ ...walk, name: "run" });
      files.set("animations/walk.anim.json", renamed);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", renamed as BufferSource));
      manifest.animations[1].sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      files.set("manifest.json", bytesOf(manifest));
    });
    expect(message).toContain("animations/walk.anim.json $.name: must be 'walk' as the manifest says");
  });
});

describe("zip", () => {
  it("reads deflated entries written by other tools and checks every CRC", async () => {
    const data = new TextEncoder().encode("riglab ".repeat(40));
    const stored = zip(new Map([["a.txt", data]]));
    const deflated = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    // Rebuild the one-entry archive with method 8 and the compressed payload.
    const local = stored.slice(0, 30 + 5);
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer);
    view(local).setUint16(8, 8, true);
    view(local).setUint32(18, deflated.length, true);
    const central = stored.slice(30 + 5 + data.length, 30 + 5 + data.length + 46 + 5);
    view(central).setUint16(10, 8, true);
    view(central).setUint32(20, deflated.length, true);
    const end = stored.slice(stored.length - 22);
    view(end).setUint32(16, local.length + deflated.length, true);
    const archive = new Uint8Array([...local, ...deflated, ...central, ...end]);
    expect(text((await unzip(archive)).get("a.txt")!)).toBe("riglab ".repeat(40));
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const corrupt = stored.slice();
    corrupt[30 + 5] = corrupt[30 + 5]! ^ 1;
    await expect(unzip(corrupt)).rejects.toThrow("a.txt: ZIP checksum mismatch");
    await expect(unzip(new Uint8Array(10))).rejects.toThrow("not a ZIP file");
  });
});
