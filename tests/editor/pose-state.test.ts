import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/library/active";
import { sampleAnimation } from "../../src/format";
import { setKeyPose } from "../../src/editor/poseEdits";
import { activeAnimationOf, modelOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { dragTip } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);

/** Pose mode on the seeded attack (keys at 0, 8, 16 and 24) at `frame`, after the idle. */
function posing(frame: number): EditorState {
  return run(
    initialState(),
    { type: "activateAnimation", name: "idle" },
    { type: "activateAnimation", name: "attack" },
    { type: "setMode", mode: "pose" },
    { type: "setFrame", frame },
  );
}

function reach(state: EditorState) {
  const animation = activeAnimationOf(state)!;
  return dragTip(LIBRARY.rig, sampleAnimation(animation, state.frame), "forearm-front", { x: 20, y: -35 });
}

describe("pose edits", () => {
  it("replace the key at a key frame", () => {
    const state = posing(8);
    const solved = reach(state);
    expect(solved.status).toBe("ok");
    const posed = run(state, { type: "setPose", pose: solved.pose });
    const animation = activeAnimationOf(posed)!;
    expect(animation.keys.map((key) => key.frame)).toEqual([0, 8, 16, 24]);
    expect(animation.keys[1]!.pose).toEqual(solved.pose);
    expect(posed.status?.text).toBe("Posed attack at frame 8");
  });

  it("refuse a frame between keys, where the kind has none", () => {
    const state = posing(12);
    const refused = run(state, { type: "setPose", pose: reach(state).pose });
    expect(refused.status).toEqual({ tone: "error", text: "Frame 12 is between keys: attack poses at frames 0, 8, 16 and 24" });
    expect(modelOf(refused)).toBe(modelOf(state));
  });

  it("are one undo step and touch no other animation", () => {
    const state = posing(16);
    const posed = run(state, { type: "setPose", pose: reach(state).pose, warning: "arm-front cannot reach" });
    expect(posed.status).toEqual({ tone: "error", text: "Posed attack at frame 16; arm-front cannot reach" });
    const before = modelOf(state).animations;
    const after = modelOf(posed).animations;
    expect(after.filter((animation, index) => animation !== before[index]).map((animation) => animation.name)).toEqual(["attack"]);
    expect(modelOf(run(posed, { type: "undo" }))).toBe(modelOf(state));
  });

  it("report notes as information and solver warnings as errors", () => {
    const state = posing(8);
    const noted = run(state, { type: "setPose", pose: reach(state).pose, note: "Pinned leg-front at 5, 0" });
    expect(noted.status).toEqual({ tone: "info", text: "Posed attack at frame 8; Pinned leg-front at 5, 0" });
  });

  it("happen only in Pose mode", () => {
    const animate = run(posing(8), { type: "setMode", mode: "animate" });
    const refused = run(animate, { type: "setPose", pose: reach(animate).pose });
    expect(refused.status?.text).toBe("Switch to Pose to change poses");
    expect(modelOf(refused)).toBe(modelOf(animate));
  });

  it("refuse a pose that would translate a non-root bone", () => {
    const animation = activeAnimationOf(posing(0))!;
    const stretched = { ...animation.keys[0]!.pose, head: { rotation: 0, x: 4 } };
    const result = setKeyPose(LIBRARY.rig, animation, 0, stretched);
    expect(result.ok ? "" : result.error).toMatch(/pose\.head: has unknown field 'x'/);
    expect(setKeyPose(LIBRARY.rig, animation, 25, animation.keys[0]!.pose).ok).toBe(false);
  });

  it("accept only the offered rotation-snap increments", () => {
    expect(run(initialState(), { type: "setRotationSnap", degrees: 15 }).rotationSnap).toBe(15);
    expect(run(initialState(), { type: "setRotationSnap", degrees: 7 }).rotationSnap).toBe(0);
  });
});
