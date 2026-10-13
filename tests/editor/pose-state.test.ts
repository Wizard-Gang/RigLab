import { describe, expect, it } from "vitest";
import { sampleAnimation } from "../../src/format";
import { setKeyPose } from "../../src/editor/poseEdits";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { HUMANOID_RIG } from "../../src/hexframe/humanoid";
import { dragTip } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);

/** Pose mode on labStrike (keys every 5 frames at 180 fps) at `frame`. */
function posing(frame: number): EditorState {
  return run(initialState(), { type: "select", selection: { kind: "animation", name: "labStrike" } }, { type: "setMode", mode: "pose" }, { type: "setFrame", frame });
}

function reach(state: EditorState) {
  const animation = activeAnimationOf(state)!;
  return dragTip(HUMANOID_RIG, sampleAnimation(animation, state.frame), "forearm-front", { x: 30, y: -60 });
}

describe("pose edits", () => {
  it("replace the key at a key frame", () => {
    const state = posing(10);
    const solved = reach(state);
    expect(solved.status).toBe("ok");
    const posed = run(state, { type: "setPose", pose: solved.pose });
    const animation = activeAnimationOf(posed)!;
    expect(animation.keys).toHaveLength(13);
    expect(animation.keys[2]!.pose).toEqual(solved.pose);
    expect(posed.status?.text).toBe("Posed labStrike at frame 10");
  });

  it("insert a key between keys that continues the interpolation in force", () => {
    const state = posing(12);
    const posed = run(state, { type: "setPose", pose: reach(state).pose });
    const animation = activeAnimationOf(posed)!;
    expect(animation.keys.map((key) => key.frame).slice(0, 5)).toEqual([0, 5, 10, 12, 15]);
    expect(animation.keys[3]!.interpolation).toBe("linear");
    expect(posed.status?.text).toBe("Keyed labStrike at frame 12");
    expect(sampleAnimation(animation, 12)).toEqual(animation.keys[3]!.pose);
  });

  it("are one undo step and touch no other animation", () => {
    const state = posing(12);
    const posed = run(state, { type: "setPose", pose: reach(state).pose, warning: "arm-front cannot reach" });
    expect(posed.status).toEqual({ tone: "error", text: "Keyed labStrike at frame 12; arm-front cannot reach" });
    const before = documentOf(state).animations;
    const after = documentOf(posed).animations;
    expect(after.filter((animation, index) => animation !== before[index]).map((animation) => animation.name)).toEqual(["labStrike"]);
    expect(documentOf(run(posed, { type: "undo" }))).toBe(documentOf(state));
  });

  it("report notes as information and solver warnings as errors", () => {
    const state = posing(10);
    const noted = run(state, { type: "setPose", pose: reach(state).pose, note: "Pinned leg-front at 6, 1" });
    expect(noted.status).toEqual({ tone: "info", text: "Posed labStrike at frame 10; Pinned leg-front at 6, 1" });
  });

  it("happen only in Pose mode", () => {
    const animate = run(posing(12), { type: "setMode", mode: "animate" });
    const refused = run(animate, { type: "setPose", pose: reach(animate).pose });
    expect(refused.status?.text).toBe("Switch to Pose to change poses");
    expect(refused.history.past).toHaveLength(0);
  });

  it("refuse a pose that would translate a non-root bone", () => {
    const animation = activeAnimationOf(posing(0))!;
    const stretched = { ...animation.keys[0]!.pose, head: { rotation: 0, x: 4 } };
    const result = setKeyPose(HUMANOID_RIG, animation, 0, stretched);
    expect(result.ok ? "" : result.error).toMatch(/pose\.head: has unknown field 'x'/);
    expect(setKeyPose(HUMANOID_RIG, animation, 61, animation.keys[0]!.pose).ok).toBe(false);
  });

  it("accept only the offered rotation-snap increments", () => {
    expect(run(initialState(), { type: "setRotationSnap", degrees: 15 }).rotationSnap).toBe(15);
    expect(run(initialState(), { type: "setRotationSnap", degrees: 7 }).rotationSnap).toBe(0);
  });
});
