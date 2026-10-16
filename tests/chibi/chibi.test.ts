import { describe, expect, it } from "vitest";
import { createRig } from "../../vendor/hexframe/src/rig";
import type { RigContract } from "../../vendor/hexframe/src/rig";
import { blankAnimation } from "../../src/editor/animations";
import { ANIMATION_KINDS } from "../../src/format/timing";
import { libraryModel, validateModel } from "../../src/editor/model";
import { initialState, isDirty, modelOf } from "../../src/editor/state";
import { holdAtRest } from "../../src/editor/weaponEdits";
import type { RigLabRig } from "../../src/format";
import { toHexframeRig } from "../../src/hexframe/adapter";
import { artPlacements } from "../../src/hexframe/art";
import { LIBRARY } from "../../src/library/active";
import { partsBySlot } from "../../src/library/parts";
import { place, runtimeRig, setRotation } from "../../src/solve";

const chibi = LIBRARY.rig;
/** The skin the editor draws with: the first `skin` line in the library's `config.txt`. */
const skin = LIBRARY.skins[0]!;
const PARTS = partsBySlot(LIBRARY);
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
/** The chibi folds its front elbow outward, away from the body, by the owner's direction on 2026-10-16; Hexframe never reads chains. */
const CHIBI_CHAINS = HEXFRAME_CHAINS.map((chain) => (chain.name === "arm-front" ? { ...chain, bend: 1 } : chain));

describe("chibi rig", () => {
  it("keeps Hexframe's 11-bone tree and chains, folds both elbows outward, and has art slots of its own", () => {
    expect(chibi.bones.map((bone) => [bone.name, bone.parent, bone.slot])).toEqual(HEXFRAME_TREE.map(([name, parent, slot]) => [name, parent, `chibi_${slot}`]));
    expect(chibi.chains).toEqual(CHIBI_CHAINS);
    expect(chibi.depthProfiles?.sides.facingRight).toEqual({ arms: { far: "arm-front", near: "arm-back" }, legs: { far: "leg-front", near: "leg-back" } });
    expect(createRig(chibi as unknown as RigContract).bones).toHaveLength(11);
  });

  it("holds a two-handed weapon at rest with both elbows folded outward", () => {
    for (const name of ["sword", "spear", "axe"]) {
      const held = holdAtRest(chibi, LIBRARY.weapons.find((item) => item.weapon.name === name)!);
      expect(held.violations, name).toEqual([]);
      // A positive local rotation folds the front forearm in toward the body, so its elbow points out; the back arm mirrors it.
      expect(held.pose["forearm-front"]!.rotation!, name).toBeGreaterThan(0);
      expect(held.pose["forearm-back"]!.rotation!, name).toBeLessThan(0);
    }
  });

  it("paints both arms in front while a two-handed weapon is held, and the far arm behind otherwise", () => {
    expect(chibi.depthProfiles?.byClip).toEqual({ sword: "both-front", spear: "both-front", axe: "both-front" });
    expect(chibi.depthProfiles?.default).toBe("anatomical");
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
  it("parses all 11 parts of the editor's skin, each bound by slot to its own bone", () => {
    expect(Object.keys(skin.parts)).toHaveLength(11);
    for (const bone of chibi.bones) {
      expect(skin.parts[bone.slot], bone.slot).toMatchObject({ bone: bone.name, set: skin.name });
      expect(PARTS[bone.slot]).toBe(skin.parts[bone.slot]);
    }
    // The editor's parts also carry the weapons' parts, on their own weapon_* slots.
    const weaponSlots = LIBRARY.weapons.flatMap((item) => Object.keys(item.parts));
    expect(Object.keys(PARTS).sort()).toEqual([...Object.keys(skin.parts), ...weaponSlots].sort());
    expect(partsBySlot(LIBRARY, LIBRARY.skins[1])[chibi.bones[0]!.slot]?.set).toBe(LIBRARY.skins[1]!.name);
  });

  it("uses only its own palette's classes", () => {
    const used = Object.values(skin.parts).flatMap((part) => part.paths.flatMap((path) => path.className.split(" ")));
    expect(used.filter((name) => !Object.hasOwn(skin.palette.classes, name))).toEqual([]);
  });

  it("draws in Hexframe's paint order at each bone's FK transform", () => {
    expect(artPlacements(chibi, runtimeRig(chibi), place(chibi, {}), PARTS, "idle").find((item) => item.bone === "head")).toMatchObject({ x: 0, y: -47, rotation: 0 });
    const turned = setRotation(chibi, setRotation(chibi, {}, "torso", 20).pose, "forearm-front", -70).pose;
    const placed = place(chibi, turned);
    const placements = artPlacements(chibi, runtimeRig(chibi), placed, PARTS, "idle");
    expect(placements.map((item) => [item.bone, item.part.set])).toEqual(
      ["leg-front", "shin-front", "leg-back", "shin-back", "pelvis", "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"]
        .map((bone) => [bone, skin.name]),
    );
    for (const item of placements) {
      const at = placed.get(item.bone)!;
      expect([item.x, item.y, item.rotation]).toEqual([at.x, at.y, (at.rotation * 180) / Math.PI]);
    }
  });
});

describe("the library model", () => {
  it("starts the editor on the library's chibi, its rest-pose animation per kind and all four weapons, saved", () => {
    const model = libraryModel(LIBRARY);
    expect(validateModel(model).ok).toBe(true);
    expect([model.rig, model.animations]).toEqual([chibi, ANIMATION_KINDS.map((kind) => blankAnimation(chibi, kind))]);
    expect(model.weapons.map((item) => item.weapon.name)).toEqual(["sword", "spear", "axe", "daggers"]);
    const state = initialState();
    expect(modelOf(state)).toEqual(model);
    expect([state.activeAnimation, isDirty(state)]).toEqual(["unarmed-idle", false]);
  });
});
