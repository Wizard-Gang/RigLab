import { describe, expect, it } from "vitest";
import { createRig } from "../../vendor/hexframe/src/rig";
import type { RigContract } from "../../vendor/hexframe/src/rig";
import { CHIBI_ANIMATIONS, CHIBI_PARTS, CHIBI_RIG } from "../../src/chibi/chibi";
import { retargetAnimation, retargetScale } from "../../src/editor/retarget";
import { documentOf, editorReducer, initialState } from "../../src/editor/state";
import { ART_PARTS, templateDocument } from "../../src/editor/templates";
import { validateAnimation, validateDocument } from "../../src/format";
import type { RigLabRig } from "../../src/format";
import { toHexframeRig } from "../../src/hexframe/adapter";
import { artPlacements } from "../../src/hexframe/art";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../../src/hexframe/humanoid";
import { place, runtimeRig, samplePose } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const chibi = CHIBI_RIG;
const tipOf = (rig: RigLabRig, name: string) => {
  const bone = rig.bones.find((candidate) => candidate.name === name)!;
  const at = place(rig, {}).get(name)!;
  return { x: at.x + bone.tip![0], y: at.y + bone.tip![1] };
};
const lengths = (rig: RigLabRig, pose = {}) => skeletonFor(runtimeRig(rig), pose).segments.map(segmentLength);

describe("chibi rig", () => {
  it("keeps Hexframe's 11-bone tree, chains and bend sides, with art slots of its own", () => {
    expect(chibi.bones.map((bone) => [bone.name, bone.parent])).toEqual(HUMANOID_RIG.bones.map((bone) => [bone.name, bone.parent]));
    expect(chibi.chains).toEqual(HUMANOID_RIG.chains);
    expect(chibi.depthProfiles).toEqual(HUMANOID_RIG.depthProfiles);
    expect(createRig(chibi as unknown as RigContract).bones).toHaveLength(11);
    expect(chibi.bones.every((bone) => bone.slot === `chibi_${HUMANOID_RIG.bones.find((other) => other.name === bone.name)!.slot}`)).toBe(true);
  });

  it("stands on the ground about two heads tall", () => {
    expect(tipOf(chibi, "shin-front").y).toBe(0);
    expect(tipOf(chibi, "shin-back").y).toBe(0);
    const top = -tipOf(chibi, "head").y;
    const head = Math.hypot(...chibi.bones.find((bone) => bone.name === "head")!.tip!);
    expect(top).toBe(91);
    expect(head / top).toBeGreaterThanOrEqual(0.45);
    // Hexframe's fighter is closer to four heads tall.
    expect(16 / -tipOf(HUMANOID_RIG, "head").y).toBeLessThan(0.2);
  });

  it("exports to Hexframe's fighter shape", () => {
    const adapted = toHexframeRig(chibi);
    expect(adapted.ok && adapted.value.bones.map((bone) => bone.slot)).toEqual(chibi.bones.map((bone) => bone.slot));
  });
});

describe("chibi art", () => {
  it("parses all 11 parts as the chibi set, each bound by slot to its own bone", () => {
    expect(Object.keys(CHIBI_PARTS)).toHaveLength(11);
    for (const bone of chibi.bones) {
      expect(CHIBI_PARTS[bone.slot], bone.slot).toMatchObject({ bone: bone.name, set: "chibi" });
      expect(ART_PARTS[bone.slot]).toBe(CHIBI_PARTS[bone.slot]);
    }
    for (const bone of HUMANOID_RIG.bones) expect(ART_PARTS[bone.slot]?.set, bone.slot).toBe("fighter");
  });

  it("uses only the chibi palette's classes", () => {
    const palette = new Set(["part", "part--back", "part--skin", "part--skin-back", "part--pants", "part--pants-back", "part--shoe",
      "part--shoe-back", "part--hair", "part--accent", "part--eye", "part--shine", "part--blush", "detail"]);
    const used = Object.values(CHIBI_PARTS).flatMap((part) => part.paths.flatMap((path) => path.className.split(" ")));
    expect(used.filter((name) => !palette.has(name))).toEqual([]);
    expect(CHIBI_PARTS.chibi_head!.paths.map((path) => path.className)).toContain("part part--eye");
  });

  it("draws in Hexframe's paint order at each bone's FK transform", () => {
    const placed = place(chibi, {});
    const placements = artPlacements(chibi, runtimeRig(chibi), placed, ART_PARTS, "labIdle");
    expect(placements.map((item) => [item.bone, item.part.set])).toEqual(
      ["leg-front", "shin-front", "leg-back", "shin-back", "pelvis", "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"]
        .map((bone) => [bone, "chibi"]),
    );
    expect(placements.find((item) => item.bone === "head")).toMatchObject({ x: 0, y: -47, rotation: 0 });
  });
});

describe("retargeting Hexframe's clips onto the chibi", () => {
  it("keeps every rotation, scales root motion by root height and keeps every limb length", () => {
    expect(retargetScale(HUMANOID_RIG, chibi)).toBeCloseTo(25 / 42, 12);
    const rest = lengths(chibi);
    for (const [name, original] of Object.entries(HUMANOID_ANIMATIONS)) {
      const animation = CHIBI_ANIMATIONS[name]!;
      expect(validateAnimation(animation, chibi).ok, name).toBe(true);
      expect([animation.rig, animation.fps, animation.length, animation.loop]).toEqual(["chibi", original.fps, original.length, original.loop]);
      animation.keys.forEach((key, index) => {
        const source = original.keys[index]!;
        for (const bone of chibi.bones) expect(key.pose[bone.name]!.rotation, `${name} ${bone.name}`).toBe(source.pose[bone.name]!.rotation);
        expect(key.pose.pelvis!.y).toBeCloseTo((source.pose.pelvis!.y ?? 0) * (25 / 42), 5);
      });
      for (let frame = 0; frame <= animation.length; frame += Math.max(1, Math.floor(animation.length / 12))) {
        lengths(chibi, samplePose(chibi, animation, frame).pose).forEach((length, index) => expect(length).toBeCloseTo(rest[index]!, 9));
      }
    }
  });

  it("refuses a rig with different bones", () => {
    const tailed = { ...chibi, bones: [...chibi.bones, { ...chibi.bones[10]!, name: "tail", parent: "pelvis", slot: "tail" }] };
    expect(() => retargetAnimation(HUMANOID_ANIMATIONS.labIdle!, HUMANOID_RIG, tailed)).toThrow(/needs the same bones and root/);
  });
});

describe("chibi template", () => {
  it("opens a valid chibi document with the retargeted clips from New", () => {
    const document = templateDocument("chibi");
    expect(validateDocument(document).ok).toBe(true);
    expect([document.rig.name, document.animations.length]).toEqual(["chibi", 13]);
    const state = editorReducer(initialState(), { type: "new", template: "chibi" });
    expect(documentOf(state).rig).toBe(chibi);
    expect([state.activeAnimation, state.status?.text]).toEqual(["labIdle", "New chibi document"]);
    expect(documentOf(editorReducer(state, { type: "new" })).rig).toBe(HUMANOID_RIG);
  });
});
