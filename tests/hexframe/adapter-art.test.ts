import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import fighterRig from "../../vendor/hexframe/characters/fighter/fighter.rig.json";
import { blankAnimation, restPose } from "../../src/editor/animations";
import type { RigLabAnimation } from "../../src/format";
import { toHexframeClip, toHexframeRig } from "../../src/hexframe/adapter";
import { artPlacements } from "../../src/hexframe/art";
import { HEXFRAME_CLIPS, HEXFRAME_CLIP_NAMES } from "../../src/hexframe/fighter";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../../src/hexframe/humanoid";
import { HEXFRAME_PARTS, parsePart } from "../../src/hexframe/parts";
import { place, runtimeRig, setRotation } from "../../src/solve";

const rig = HUMANOID_RIG;

function samePose(a: Pose, b: Pose): number {
  let largest = 0;
  for (const bone of rig.bones) {
    for (const channel of ["x", "y", "rotation"] as const) largest = Math.max(largest, Math.abs((a[bone.name]?.[channel] ?? 0) - (b[bone.name]?.[channel] ?? 0)));
  }
  return largest;
}

describe("Hexframe adapter", () => {
  it("returns the humanoid as Hexframe's own fighter.rig.json", () => {
    const adapted = toHexframeRig(rig);
    if (!adapted.ok) throw new Error(adapted.error);
    expect(adapted.value).toEqual(fighterRig);
    expect(adapted.notes).toEqual(["Hexframe has no angle limits or IK chains: 0 limits and 4 chains are left out"]);
    const { depthProfiles: _dropped, ...plain } = rig;
    expect(toHexframeRig(plain)).toEqual({ ok: false, error: "Hexframe paints a rig by depth profile, and 'humanoid' has none" });
  });

  it("round-trips every Hexframe clip through import and the adapter with Hexframe's sampler unchanged", () => {
    for (const name of HEXFRAME_CLIP_NAMES) {
      const original = HEXFRAME_CLIPS[name]!;
      const adapted = toHexframeClip(rig, HUMANOID_ANIMATIONS[name]!);
      if (!adapted.ok) throw new Error(adapted.error);
      const { clip, approximated } = adapted.value;
      expect([clip.duration, clip.loop, clip.easing ?? "linear"], name).toEqual([original.duration, original.loop, original.easing ?? "linear"]);
      expect(approximated, name).toEqual([]);
      for (let frame = -original.duration; frame <= original.duration * 2; frame += 1) {
        expect(samePose(sampleClip(clip, frame), sampleClip(original, frame)), `${name}@${frame}`).toBeLessThan(1e-9);
      }
    }
  });

  it("reports the frames a hold animation cannot keep, and rounded timing", () => {
    const rotated = (degrees: number) => setRotation(rig, restPose(rig), "arm-front", degrees).pose;
    const thrust: RigLabAnimation = {
      ...blankAnimation(rig, "thrust"),
      length: 8,
      keys: [{ frame: 0, interpolation: "hold", pose: rotated(0) }, { frame: 3, interpolation: "hold", pose: rotated(-60) }],
    };
    const adapted = toHexframeClip(rig, thrust);
    if (!adapted.ok) throw new Error(adapted.error);
    expect(adapted.value.clip.duration).toBe(34);
    expect(adapted.notes[0]).toBe("8 frames at 14 fps is 34.29 Hexframe frames, rounded to 34");
    expect(adapted.value.approximated.length).toBeGreaterThan(0);
    expect(adapted.value.approximated.every((frame) => frame > 0 && frame < 34)).toBe(true);
    expect(adapted.notes[1]).toMatch(/differ from RigLab's playback on \d+ of 35 frames/);
  });
});

describe("art overlay", () => {
  it("parses every vendored part as data, bound to its Hexframe bone by slot", () => {
    expect(Object.keys(HEXFRAME_PARTS)).toHaveLength(11);
    for (const bone of rig.bones) expect(HEXFRAME_PARTS[bone.slot]?.bone, bone.slot).toBe(bone.name);
    expect(HEXFRAME_PARTS.head!.paths.map((path) => path.className)).toEqual(["part part--skin", "part part--accent", "detail"]);
  });

  it("refuses anything beyond plain paths", () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"><path class="part" d="M0 0L1 1Z"/></svg>';
    expect(parsePart(ok, "test")).toMatchObject({ bone: "head", set: "test" });
    expect(parsePart(ok, "test").paths).toHaveLength(1);
    for (const bad of [
      ok.replace("<path", '<script>alert(1)</script><path'),
      ok.replace('class="part"', 'class="part" onclick="x()"'),
      ok.replace('d="M0 0L1 1Z"', 'd="url(#x)"'),
      ok.replace('data-bone="head"', 'data-bone="head" style="x"'),
      ok.replace("<path", "<image href='x.png'/><path"),
      '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"></svg>',
    ]) expect(() => parsePart(bad, "test"), bad).toThrow(/part/);
  });

  it("places each part at its bone's FK transform in Hexframe's paint order", () => {
    const pose = HUMANOID_ANIMATIONS.labStrike!.keys[6]!.pose;
    const placed = place(rig, pose);
    const placements = artPlacements(rig, runtimeRig(rig), placed, HEXFRAME_PARTS, "labStrike");
    expect(placements.map((item) => item.bone)).toEqual(["leg-front", "shin-front", "leg-back", "shin-back", "pelvis", "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"]);
    for (const item of placements) {
      const at = placed.get(item.bone)!;
      expect([item.x, item.y, item.rotation]).toEqual([at.x, at.y, (at.rotation * 180) / Math.PI]);
    }
  });
});
