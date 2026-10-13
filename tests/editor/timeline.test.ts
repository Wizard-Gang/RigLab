import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { applyTimelineEdit } from "../../src/editor/timeline";
import type { TimelineEdit } from "../../src/editor/timeline";
import type { Interpolation, RigLabAnimation } from "../../src/format";
import { engineOf, playAt, setRotation } from "../../src/solve";

const rig = CHIBI_RIG;
const rotated = (degrees: number) => setRotation(rig, restPose(rig), "arm-front", degrees).pose;

/** A kind's keys with the front arm at `rotations`, moving to the next key as `interpolations` say. */
function keyed(name: string, kind: "hit" | "walk", rotations: readonly number[], interpolations: readonly Interpolation[]): RigLabAnimation {
  const blank = blankAnimation(rig, name, kind);
  return { ...blank, keys: blank.keys.map((key, index) => ({ ...key, interpolation: interpolations[index]!, pose: rotated(rotations[index]!) })) };
}

/** A hit (keys at 0, 12 and 24): it holds, moves linearly, then eases. */
const animation = keyed("thrust", "hit", [0, -30, -90], ["hold", "linear", "smoothstep"]);

function refused(edit: TimelineEdit, from: RigLabAnimation = animation): string {
  const result = applyTimelineEdit(rig, from, edit);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

/** The front arm as Hexframe plays it. */
const armAt = (value: RigLabAnimation, frame: number): number => Math.round(playAt(engineOf(rig, value), frame).pose["arm-front"]!.rotation! * 1e9) / 1e9 + 0;
const frames = (value: RigLabAnimation) => value.keys.map((key) => key.frame);

describe("timeline edits", () => {
  it("set a key's interpolation, and nothing else", () => {
    const result = applyTimelineEdit(rig, animation, { kind: "setInterpolation", frame: 0, interpolation: "linear" });
    if (!result.ok) throw new Error(result.error);
    expect(result.animation.keys.map((key) => key.interpolation)).toEqual(["linear", "linear", "smoothstep"]);
    expect(result.message).toBe("Set the key at frame 0 to linear");
    expect(refused({ kind: "setInterpolation", frame: 5, interpolation: "linear" })).toBe("Frame 5 has no key");
    expect(refused({ kind: "setInterpolation", frame: 12, interpolation: "linear" })).toBe("The key at frame 12 is already linear");
  });

  it("play hold and linear transitions through Hexframe's poses, every 2 frames in a hit", () => {
    // The hold keeps its pose until the Hexframe pose before the next key, at frame 10, then moves over one pose interval.
    expect([0, 2, 10, 11, 12, 15, 18, 24, 30].map((frame) => armAt(animation, frame))).toEqual([0, 0, 0, -15, -30, -45, -60, -90, -90]);
  });

  it("run a looping kind's last key back to key 0 at the length", () => {
    const walk = keyed("walk", "walk", [0, -40, 0, -40], ["linear", "linear", "linear", "smoothstep"]);
    // Walk poses fall every 4 frames: the eased run from 36 back to 0 is symmetric, so frame 42 is halfway.
    expect([12, 24, 36, 42, 48].map((frame) => armAt(walk, frame))).toEqual([-40, 0, -40, -20, 0]);
  });
});

describe("timeline in the editor", () => {
  const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
  const start = (): EditorState => run(
    initialState({ ...documentOf(initialState()), animations: [animation] }),
    { type: "setMode", mode: "animate" },
  );

  it("records an interpolation change as one undo step", () => {
    const eased = run(start(), { type: "timeline", edit: { kind: "setInterpolation", frame: 12, interpolation: "smoothstep" } });
    expect(activeAnimationOf(eased)!.keys[1]!.interpolation).toBe("smoothstep");
    expect(eased.status?.text).toBe("Set the key at frame 12 to smoothstep");
    expect(activeAnimationOf(run(eased, { type: "undo" }))!.keys[1]!.interpolation).toBe("linear");
  });

  it("keeps every key on Delete, and refuses timeline edits in Rig setup", () => {
    const state = run(start(), { type: "select", selection: { kind: "key", frame: 12 } });
    const kept = run(state, { type: "deleteSelection" });
    expect(documentOf(kept)).toBe(documentOf(state));
    expect(kept.status).toEqual({ tone: "error", text: "Keys stay: every hit animation keeps all 3 of its keys" });
    const setup = run(start(), { type: "setMode", mode: "setup" }, { type: "timeline", edit: { kind: "setInterpolation", frame: 0, interpolation: "linear" } });
    expect(setup.status?.text).toBe("Switch to Pose or Animation to edit keys");
  });

  it("steps between keys and jumps to a selected key", () => {
    let state = run(start(), { type: "setFrame", frame: 4 }, { type: "stepKey", direction: 1 });
    expect(state.frame).toBe(12);
    state = run(state, { type: "stepKey", direction: 1 }, { type: "stepKey", direction: 1 });
    expect(state.frame).toBe(24);
    state = run(state, { type: "stepKey", direction: -1 }, { type: "stepKey", direction: -1 });
    expect(state.frame).toBe(0);
    expect(frames(activeAnimationOf(state)!)).toEqual([0, 12, 24]);
    expect(run(state, { type: "select", selection: { kind: "key", frame: 12 } }).frame).toBe(12);
    expect(run(state, { type: "setOnion", onion: true }).onion).toBe(true);
  });
});
