import { describe, expect, it } from "vitest";
import { validateDocument } from "../../src/format/document";
import type { RigLabDocument } from "../../src/format/document";
import { templateDocument } from "../../src/editor/animations";
import { applyRigEdit, subtreeOf } from "../../src/editor/rigEdits";
import type { RigEdit } from "../../src/editor/rigEdits";
import { documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";

const base = templateDocument();

function applied(edit: RigEdit, document: RigLabDocument = base): RigLabDocument {
  const result = applyRigEdit(document, edit);
  if (!result.ok) throw new Error(result.error);
  expect(validateDocument(result.document).ok).toBe(true);
  return result.document;
}

function refused(edit: RigEdit): string {
  const result = applyRigEdit(base, edit);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

const bone = (document: RigLabDocument, name: string) => document.rig.bones.find((candidate) => candidate.name === name);

describe("rig setup edits", () => {
  it("moves a joint and changes nothing but its rest offset", () => {
    const moved = applied({ kind: "moveJoint", bone: "forearm-front", offset: [0, 25] });
    expect(bone(moved, "forearm-front")?.offset).toEqual([0, 25]);
    expect(moved.animations).toBe(base.animations);
    expect(moved.rig.bones.filter((candidate) => candidate.name !== "forearm-front"))
      .toEqual(base.rig.bones.filter((candidate) => candidate.name !== "forearm-front"));
  });

  it("sets and removes tips, but never one a chain needs", () => {
    expect(bone(applied({ kind: "setTip", bone: "head", tip: [0, -20] }), "head")?.tip).toEqual([0, -20]);
    expect(bone(applied({ kind: "setTip", bone: "head", tip: null }), "head")?.tip).toBeNull();
    expect(refused({ kind: "setTip", bone: "shin-front", tip: null })).toMatch(/needs a non-zero tip/);
  });

  it("renames a bone everywhere it is named, keeping every pose value", () => {
    const renamed = applied({ kind: "renameBone", bone: "arm-front", name: "upper-arm-front" });
    expect(bone(renamed, "forearm-front")?.parent).toBe("upper-arm-front");
    expect(renamed.rig.chains.find((chain) => chain.name === "arm-front")?.upper).toBe("upper-arm-front");
    expect(renamed.rig.depthProfiles?.sides.facingRight.arms.far).toBe("upper-arm-front");
    const key = (document: RigLabDocument) => document.animations[3]!.keys[4]!.pose;
    expect(key(renamed)["upper-arm-front"]).toEqual(key(base)["arm-front"]);
    expect(key(renamed)["arm-front"]).toBeUndefined();
    const root = applied({ kind: "renameBone", bone: "pelvis", name: "hips" });
    expect(root.rig.root).toBe("hips");
    expect(key(root).hips).toEqual(key(base).pelvis);
  });

  it("refuses invalid, duplicate and unknown names", () => {
    expect(refused({ kind: "renameBone", bone: "head", name: "2heads" })).toMatch(/not a valid name/);
    expect(refused({ kind: "renameBone", bone: "head", name: "torso" })).toMatch(/already exists/);
    expect(refused({ kind: "renameBone", bone: "tail", name: "tail2" })).toMatch(/no bone 'tail'/);
    expect(refused({ kind: "setSlot", bone: "head", slot: "has space" })).toMatch(/not a valid slot/);
  });

  it("adds a child joint with a rest rotation in every key", () => {
    const added = applied({ kind: "addChild", bone: "head" });
    expect(bone(added, "bone")).toMatchObject({ parent: "head", offset: [0, 10], tip: null, limits: null });
    expect(added.animations.every((animation) => animation.keys.every((key) => key.pose.bone?.rotation === 0))).toBe(true);
    expect(bone(applied({ kind: "addChild", bone: "head" }, added), "bone-2")?.parent).toBe("head");
  });

  it("deletes a joint with its subtree, its chain and its pose entries", () => {
    expect([...subtreeOf(base.rig, "arm-front")]).toEqual(["arm-front", "forearm-front"]);
    const result = applyRigEdit(base, { kind: "deleteBone", bone: "arm-front" });
    expect(result.ok && result.message).toMatch(/Deleted arm-front and 1 bone below it; its depth profiles/);
    const deleted = applied({ kind: "deleteBone", bone: "arm-front" });
    expect(deleted.rig.bones.map((candidate) => candidate.name)).not.toContain("forearm-front");
    expect(deleted.rig.chains.map((chain) => chain.name)).not.toContain("arm-front");
    expect(deleted.rig.depthProfiles).toBeUndefined();
    expect(deleted.animations[0]!.keys[0]!.pose["forearm-front"]).toBeUndefined();
    expect(applied({ kind: "deleteBone", bone: "head" }).rig.depthProfiles).toEqual(base.rig.depthProfiles);
    expect(refused({ kind: "deleteBone", bone: "pelvis" })).toMatch(/root bone cannot be deleted/);
  });

  it("sets limits and chains through the rig validator", () => {
    expect(bone(applied({ kind: "setLimits", bone: "forearm-front", limits: { min: -150, max: 0 } }), "forearm-front")?.limits)
      .toEqual({ min: -150, max: 0 });
    expect(refused({ kind: "setLimits", bone: "forearm-front", limits: { min: 10, max: -10 } })).toMatch(/min <= max/);
    expect(refused({ kind: "addChain", upper: "torso" })).toMatch(/exactly one child/);
    const unchained = applied({ kind: "removeChain", chain: "leg-back" });
    expect(unchained.rig.chains).toHaveLength(3);
    expect(applied({ kind: "addChain", upper: "leg-back" }, unchained).rig.chains.at(-1)).toEqual({ name: "leg-back", upper: "leg-back", lower: "shin-back", bend: 1 });
    expect(applied({ kind: "setBend", chain: "arm-back", bend: 1 }).rig.chains.find((chain) => chain.name === "arm-back")?.bend).toBe(1);
  });
});

describe("rig setup in the editor", () => {
  const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
  const move: Action = { type: "rigEdit", edit: { kind: "moveJoint", bone: "head", offset: [0, -35] } };

  it("changes anatomy only in Rig setup", () => {
    for (const mode of ["pose", "animate"] as const) {
      const state = run(initialState(), { type: "setMode", mode }, move);
      expect(documentOf(state).rig).toBe(documentOf(initialState()).rig);
      expect(state.history.past).toHaveLength(0);
      expect(state.status?.text).toMatch(/Switch to Rig setup/);
    }
  });

  it("records each edit and undo restores the exact prior rig", () => {
    const start = run(initialState(), { type: "setMode", mode: "setup" });
    const edited = run(start, move, { type: "rigEdit", edit: { kind: "addChild", bone: "head" } });
    expect(edited.selection).toEqual({ kind: "bone", name: "bone" });
    expect(edited.history.past).toHaveLength(2);
    const undone = run(edited, { type: "undo" }, { type: "undo" });
    expect(documentOf(undone).rig).toBe(documentOf(start).rig);
    expect(undone.selection).toBeNull();
  });

  it("refuses an invalid edit with a message and no history", () => {
    const state = run(initialState(), { type: "setMode", mode: "setup" }, { type: "rigEdit", edit: { kind: "deleteBone", bone: "pelvis" } });
    expect(state.status).toEqual({ tone: "error", text: "The root bone cannot be deleted" });
    expect(state.history.past).toHaveLength(0);
  });

  it("deletes the selected joint with Delete in Rig setup only", () => {
    const select: Action = { type: "select", selection: { kind: "bone", name: "head" } };
    const setup = run(initialState(), { type: "setMode", mode: "setup" }, select, { type: "deleteSelection" });
    expect(documentOf(setup).rig.bones.map((candidate) => candidate.name)).not.toContain("head");
    expect(setup.selection).toEqual({ kind: "bone", name: "torso" });
    const pose = run(initialState(), { type: "setMode", mode: "pose" }, select, { type: "deleteSelection" });
    expect(pose.history.past).toHaveLength(0);
  });
});
