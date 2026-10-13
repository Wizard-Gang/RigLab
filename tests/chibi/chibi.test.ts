import { describe, expect, it } from "vitest";
import { createRig } from "../../vendor/hexframe/src/rig";
import type { RigContract } from "../../vendor/hexframe/src/rig";
import { CHIBI_PARTS, CHIBI_RIG } from "../../src/chibi/chibi";
import { documentOf, editorReducer, initialState } from "../../src/editor/state";
import { ART_PARTS, templateDocument } from "../../src/editor/templates";
import { validateDocument } from "../../src/format";
import type { RigLabRig } from "../../src/format";
import { toHexframeRig } from "../../src/hexframe/adapter";
import { artPlacements } from "../../src/hexframe/art";
import { place, runtimeRig, setRotation } from "../../src/solve";

const chibi = CHIBI_RIG;
const tipOf = (rig: RigLabRig, name: string) => {
  const bone = rig.bones.find((candidate) => candidate.name === name)!;
  const at = place(rig, {}).get(name)!;
  return { x: at.x + bone.tip![0], y: at.y + bone.tip![1] };
};

/** Hexframe's fighter at the pinned commit: its bone tree, art slots and IK-relevant bend sides. */
const HEXFRAME_TREE = [
  ["pelvis", null, "pelvis"],
  ["leg-front", "pelvis", "leg_upper_r"],
  ["shin-front", "leg-front", "leg_lower_r"],
  ["leg-back", "pelvis", "leg_upper_l"],
  ["shin-back", "leg-back", "leg_lower_l"],
  ["torso", "pelvis", "torso"],
  ["arm-front", "torso", "arm_upper_r"],
  ["forearm-front", "arm-front", "arm_lower_r"],
  ["arm-back", "torso", "arm_upper_l"],
  ["forearm-back", "arm-back", "arm_lower_l"],
  ["head", "torso", "head"],
] as const;
const HEXFRAME_CHAINS = [
  { name: "leg-front", upper: "leg-front", lower: "shin-front", bend: 1 },
  { name: "leg-back", upper: "leg-back", lower: "shin-back", bend: 1 },
  { name: "arm-front", upper: "arm-front", lower: "forearm-front", bend: -1 },
  { name: "arm-back", upper: "arm-back", lower: "forearm-back", bend: -1 },
];

describe("chibi rig", () => {
  it("keeps Hexframe's 11-bone tree, chains and bend sides, with art slots of its own", () => {
    expect(chibi.bones.map((bone) => [bone.name, bone.parent, bone.slot])).toEqual(HEXFRAME_TREE.map(([name, parent, slot]) => [name, parent, `chibi_${slot}`]));
    expect(chibi.chains).toEqual(HEXFRAME_CHAINS);
    expect(chibi.depthProfiles?.sides.facingRight).toEqual({ arms: { far: "arm-front", near: "arm-back" }, legs: { far: "leg-front", near: "leg-back" } });
    expect(createRig(chibi as unknown as RigContract).bones).toHaveLength(11);
  });

  it("stands on the ground about two heads tall", () => {
    expect(tipOf(chibi, "shin-front").y).toBe(0);
    expect(tipOf(chibi, "shin-back").y).toBe(0);
    const top = -tipOf(chibi, "head").y;
    const head = Math.hypot(...chibi.bones.find((bone) => bone.name === "head")!.tip!);
    expect(top).toBe(91);
    expect(head / top).toBeGreaterThanOrEqual(0.45);
  });

  it("exports to Hexframe's rig shape", () => {
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
    expect(Object.keys(ART_PARTS)).toHaveLength(11);
  });

  it("uses only the chibi palette's classes", () => {
    const palette = new Set(["part", "part--back", "part--skin", "part--skin-back", "part--pants", "part--pants-back", "part--shoe",
      "part--shoe-back", "part--hair", "part--accent", "part--eye", "part--shine", "part--blush", "detail"]);
    const used = Object.values(CHIBI_PARTS).flatMap((part) => part.paths.flatMap((path) => path.className.split(" ")));
    expect(used.filter((name) => !palette.has(name))).toEqual([]);
    expect(CHIBI_PARTS.chibi_head!.paths.map((path) => path.className)).toContain("part part--eye");
  });

  it("draws in Hexframe's paint order at each bone's FK transform", () => {
    expect(artPlacements(chibi, runtimeRig(chibi), place(chibi, {}), ART_PARTS, "idle").find((item) => item.bone === "head")).toMatchObject({ x: 0, y: -47, rotation: 0 });
    const turned = setRotation(chibi, setRotation(chibi, {}, "torso", 20).pose, "forearm-front", -70).pose;
    const placed = place(chibi, turned);
    const placements = artPlacements(chibi, runtimeRig(chibi), placed, ART_PARTS, "idle");
    expect(placements.map((item) => [item.bone, item.part.set])).toEqual(
      ["leg-front", "shin-front", "leg-back", "shin-back", "pelvis", "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"]
        .map((bone) => [bone, "chibi"]),
    );
    for (const item of placements) {
      const at = placed.get(item.bone)!;
      expect([item.x, item.y, item.rotation]).toEqual([at.x, at.y, (at.rotation * 180) / Math.PI]);
    }
  });
});

describe("chibi template", () => {
  it("opens a valid chibi document with no animations from New", () => {
    const document = templateDocument();
    expect(validateDocument(document).ok).toBe(true);
    expect([document.rig, document.animations]).toEqual([chibi, []]);
    const state = editorReducer(editorReducer(initialState(), { type: "addAnimation", kind: "idle" }), { type: "new" });
    expect(documentOf(state)).toEqual(document);
    expect([state.activeAnimation, state.status?.text]).toEqual([null, "New chibi document"]);
  });
});
