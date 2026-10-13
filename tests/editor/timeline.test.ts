import { describe, expect, it } from "vitest";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { applyTimelineEdit } from "../../src/editor/timeline";
import type { TimelineEdit } from "../../src/editor/timeline";
import type { RigLabAnimation } from "../../src/format";
import { HUMANOID_RIG } from "../../src/hexframe/humanoid";
import { samplePose, setRotation } from "../../src/solve";

const rig = HUMANOID_RIG;
const rotated = (degrees: number) => setRotation(rig, restPose(rig), "arm-front", degrees).pose;
const animation: RigLabAnimation = {
  ...blankAnimation(rig, "thrust"),
  length: 10,
  keys: [
    { frame: 0, interpolation: "hold", pose: rotated(0) },
    { frame: 3, interpolation: "linear", pose: rotated(-30) },
    { frame: 6, interpolation: "smoothstep", pose: rotated(-90) },
  ],
};

function ok(edit: TimelineEdit, from: RigLabAnimation = animation) {
  const result = applyTimelineEdit(rig, from, edit);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function refused(edit: TimelineEdit, from: RigLabAnimation = animation): string {
  const result = applyTimelineEdit(rig, from, edit);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

const armAt = (value: RigLabAnimation, frame: number) => samplePose(rig, value, frame).pose["arm-front"]!.rotation;
const frames = (value: RigLabAnimation) => value.keys.map((key) => key.frame);

describe("timeline edits", () => {
  it("add a key holding what the frame shows", () => {
    const added = ok({ kind: "addKey", frame: 4 }).animation;
    expect(frames(added)).toEqual([0, 3, 4, 6]);
    expect(added.keys[2]).toMatchObject({ frame: 4, interpolation: "linear" });
    expect(added.keys[2]!.pose["arm-front"]!.rotation).toBe(-50);
    expect(refused({ kind: "addKey", frame: 3 })).toBe("Frame 3 already has a key");
  });

  it("duplicate the key in force onto the next frame", () => {
    const result = ok({ kind: "duplicateKey", frame: 4 });
    expect(result.frame).toBe(5);
    expect(result.animation.keys[2]).toEqual({ ...animation.keys[1]!, frame: 5 });
    expect(refused({ kind: "duplicateKey", frame: 5 })).toBe("Frame 6 already has a key");
    expect(refused({ kind: "duplicateKey", frame: 10 })).toBe("There is no frame after 10; lengthen the animation first");
  });

  it("delete and move keys but never the first key", () => {
    expect(frames(ok({ kind: "deleteKey", frame: 3 }).animation)).toEqual([0, 6]);
    expect(refused({ kind: "deleteKey", frame: 0 })).toBe("The first key, at frame 0, cannot be deleted");
    expect(refused({ kind: "deleteKey", frame: 4 })).toBe("Frame 4 has no key");
    expect(frames(ok({ kind: "moveKey", from: 6, to: 9 }).animation)).toEqual([0, 3, 9]);
    expect(frames(ok({ kind: "moveKey", from: 3, to: 8 }).animation)).toEqual([0, 6, 8]);
    expect(refused({ kind: "moveKey", from: 0, to: 2 })).toBe("The first key stays at frame 0");
    expect(refused({ kind: "moveKey", from: 3, to: 6 })).toBe("Frame 6 already has a key");
    expect(refused({ kind: "moveKey", from: 3, to: 11 })).toBe("Frame 11 is outside the animation");
  });

  it("set interpolation and timing, keeping every key inside the length", () => {
    expect(ok({ kind: "setInterpolation", frame: 0, interpolation: "linear" }).animation.keys[0]!.interpolation).toBe("linear");
    expect(ok({ kind: "setTiming", fps: 24, loop: true }).animation).toMatchObject({ fps: 24, loop: true, length: 10 });
    expect(ok({ kind: "setTiming", length: 6 }).message).toBe("thrust: 6 frames");
    expect(refused({ kind: "setTiming", length: 5 })).toBe("The length cannot end before the key at frame 6");
    expect(refused({ kind: "setTiming", fps: 0 })).toMatch(/whole number from 1 to 720/);
    expect(refused({ kind: "setTiming", fps: 14 })).toBe("The timing is unchanged");
  });

  it("play a three-key animation with hold, linear and smoothstep transitions", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 10].map((frame) => armAt(animation, frame))).toEqual([0, 0, 0, -30, -50, -70, -90, -90, -90]);
    const smooth = ok({ kind: "setTiming", loop: true }).animation;
    // 6 -> 10 runs smoothstep back to key 0: halfway (frame 8) is exactly half of the way.
    expect(armAt(smooth, 8)).toBeCloseTo(-45, 9);
    expect(armAt(smooth, 7)).toBeCloseTo(-90 + 90 * (0.25 * 0.25 * 2.5), 9);
  });
});

describe("timeline in the editor", () => {
  const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
  const start = (): EditorState => run(
    initialState({ ...documentOf(initialState()), animations: [animation] }),
    { type: "setMode", mode: "animate" },
  );

  it("records timeline edits as undo steps and selects the key they produce", () => {
    const moved = run(start(), { type: "timeline", edit: { kind: "moveKey", from: 3, to: 4 } });
    expect(moved.selection).toEqual({ kind: "key", frame: 4 });
    expect(moved.frame).toBe(4);
    expect(frames(activeAnimationOf(run(moved, { type: "undo" }))!)).toEqual([0, 3, 6]);
  });

  it("deletes the selected key with Delete, and refuses timeline edits in Rig setup", () => {
    const deleted = run(start(), { type: "select", selection: { kind: "key", frame: 6 } }, { type: "deleteSelection" });
    expect(frames(activeAnimationOf(deleted)!)).toEqual([0, 3]);
    expect(deleted.selection).toBeNull();
    const setup = run(start(), { type: "setMode", mode: "setup" }, { type: "timeline", edit: { kind: "addKey", frame: 2 } });
    expect(setup.status?.text).toBe("Switch to Pose or Animation to edit keys");
  });

  it("steps between keys and jumps to a selected key", () => {
    let state = run(start(), { type: "setFrame", frame: 4 }, { type: "stepKey", direction: 1 });
    expect(state.frame).toBe(6);
    state = run(state, { type: "stepKey", direction: 1 });
    expect(state.frame).toBe(6);
    state = run(state, { type: "stepKey", direction: -1 }, { type: "stepKey", direction: -1 });
    expect(state.frame).toBe(0);
    expect(run(state, { type: "select", selection: { kind: "key", frame: 3 } }).frame).toBe(3);
    expect(run(state, { type: "setOnion", onion: true }).onion).toBe(true);
  });
});
