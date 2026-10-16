import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/library/active";
import { sampleAnimation } from "../../src/format";
import { setKeyPose } from "../../src/editor/poseEdits";
import { activeAnimationOf, editorReducer, initialState, MODES, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { dragTip } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);

/** Animate, paused, on the unarmed attack (keys at 0, 8, 16 and 24) at `frame`, after the idle. */
function posing(frame: number): EditorState {
  return run(
    initialState(),
    { type: "activateAnimation", name: "unarmed-idle" },
    { type: "activateAnimation", name: "unarmed-attack" },
    { type: "setMode", mode: "animate" },
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
    expect(posed.status?.text).toBe("Posed unarmed-attack at frame 8");
  });

  it("refuse a frame between keys, where the kind has none", () => {
    const state = posing(12);
    const refused = run(state, { type: "setPose", pose: reach(state).pose });
    expect(refused.status).toEqual({ tone: "error", text: "Frame 12 is between keys: unarmed-attack poses at frames 0, 8, 16 and 24" });
    expect(modelOf(refused)).toBe(modelOf(state));
  });

  it("are one undo step and touch no other animation", () => {
    const state = posing(16);
    const posed = run(state, { type: "setPose", pose: reach(state).pose, warning: "arm-front cannot reach" });
    expect(posed.status).toEqual({ tone: "error", text: "Posed unarmed-attack at frame 16; arm-front cannot reach" });
    const before = modelOf(state).animations;
    const after = modelOf(posed).animations;
    expect(after.filter((animation, index) => animation !== before[index]).map((animation) => animation.name)).toEqual(["unarmed-attack"]);
    expect(modelOf(run(posed, { type: "undo" }))).toBe(modelOf(state));
  });

  it("report notes as information and solver warnings as errors", () => {
    const state = posing(8);
    const noted = run(state, { type: "setPose", pose: reach(state).pose, note: "Pinned leg-front at 5, 0" });
    expect(noted.status).toEqual({ tone: "info", text: "Posed unarmed-attack at frame 8; Pinned leg-front at 5, 0" });
  });

  it("happen only in Animate, and only while it is paused", () => {
    for (const mode of ["setup", "export"] as const) {
      const elsewhere = run(posing(8), { type: "setMode", mode });
      const refused = run(elsewhere, { type: "setPose", pose: reach(elsewhere).pose });
      expect(refused.status?.text).toBe("Switch to Animate to change poses");
      expect(modelOf(refused)).toBe(modelOf(elsewhere));
    }
    const playing = run(posing(8), { type: "setPlaying", playing: true });
    expect(playing.playing).toBe(true);
    const refused = run(playing, { type: "setPose", pose: reach(playing).pose });
    expect(refused.status).toEqual({ tone: "error", text: "Pause to change poses" });
    expect(refused.history.past).toHaveLength(0);
    const paused = run(playing, { type: "setPlaying", playing: false }, { type: "setPose", pose: reach(playing).pose });
    expect([paused.status?.text, paused.history.past.length]).toEqual(["Posed unarmed-attack at frame 8", 1]);
  });

  it("keep the frame across modes, play only where there is something to play, and leave no Pose mode", () => {
    const state = posing(16);
    expect(MODES.map((mode) => mode.id)).toEqual(["setup", "animate", "export"]);
    expect(MODES.map((mode) => mode.label)).toEqual(["Rig setup", "Animate", "Export"]);
    expect(initialState().mode).toBe("animate");
    const exported = run(state, { type: "setPlaying", playing: true }, { type: "setMode", mode: "export" });
    expect([exported.mode, exported.frame, exported.playing]).toEqual(["export", 16, true]);
    const setup = run(exported, { type: "setMode", mode: "setup" });
    expect([setup.frame, setup.playing]).toEqual([16, false]);
    expect(run(setup, { type: "setPlaying", playing: true }).playing).toBe(false);
    expect(run(setup, { type: "setMode", mode: "animate" }).frame).toBe(16);
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
