import { describe, expect, it } from "vitest";
import { fillClasses } from "../../src/editor/classes";
import { HISTORY_LIMIT } from "../../src/editor/history";
import { libraryModel } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, isDirty, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import type { Interpolation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const names = (state: EditorState): string[] => modelOf(state).animations.map((animation) => animation.name);
const ease = (frame: number, interpolation: Interpolation): Action => ({ type: "timeline", edit: { kind: "setInterpolation", frame, interpolation } });

describe("editor state", () => {
  it("opens on the chibi with the library's five unarmed animations, clean and with no history", () => {
    const state = initialState();
    expect([modelOf(state).rig.name, names(state), state.activeAnimation]).toEqual(["chibi", ["unarmed-idle", "unarmed-walk", "unarmed-jump", "unarmed-attack", "unarmed-hit"], "unarmed-idle"]);
    expect(state.mode).toBe("animate");
    expect(isDirty(state)).toBe(false);
    expect(state.history.past).toHaveLength(0);
  });

  it("keeps every animation and key: Delete removes only joints", () => {
    const animation = run(initialState(), { type: "select", selection: { kind: "animation", name: "unarmed-jump" } }, { type: "deleteSelection" });
    expect(names(animation)).toHaveLength(5);
    expect(animation.status).toEqual({ tone: "error", text: "Animations stay: the library holds one animation of each class and kind" });
    expect(animation.history.past).toHaveLength(0);
    const key = run(initialState(), { type: "select", selection: { kind: "key", frame: 15 } }, { type: "deleteSelection" });
    expect(key.status?.text).toBe("Keys stay: every idle animation keeps all 4 of its keys");
    const bone = run(initialState(), { type: "select", selection: { kind: "bone", name: "head" } }, { type: "deleteSelection" });
    expect(bone.history.past).toHaveLength(0);
  });

  it("undoes and redoes edits, and knows when the library holds the present model", () => {
    let state = run(initialState(), ease(0, "linear"), ease(15, "hold"));
    expect(activeAnimationOf(state)?.keys.map((key) => key.interpolation)).toEqual(["linear", "hold", "smoothstep", "smoothstep"]);
    expect([state.history.past.length, isDirty(state)]).toEqual([2, true]);
    state = run(state, { type: "undo" }, { type: "undo" });
    expect([activeAnimationOf(state)?.keys[0]?.interpolation, isDirty(state)]).toEqual(["smoothstep", false]);
    state = run(state, { type: "redo" });
    expect([activeAnimationOf(state)?.keys[0]?.interpolation, isDirty(state)]).toEqual(["linear", true]);
  });

  it("keeps selection and frame valid across undo", () => {
    let state = run(initialState(), { type: "setMode", mode: "setup" }, { type: "rigEdit", edit: { kind: "addChild", bone: "head" } });
    expect(state.selection).toEqual({ kind: "bone", name: "bone" });
    state = run(state, { type: "undo" });
    expect(state.selection).toBeNull();
    expect(run(state, { type: "setFrame", frame: 500 }).frame).toBe(60);
  });

  it("bounds undo depth", () => {
    let state = initialState();
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) state = run(state, ease(0, index % 2 ? "smoothstep" : "linear"));
    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("records a save to the library folder, keeping history, mode and frame", () => {
    const edited = run(initialState(), ease(0, "linear"), { type: "setMode", mode: "pose" }, { type: "setFrame", frame: 15 });
    const saved = run(edited, { type: "saved", model: modelOf(edited), note: "Saved 1 file to ~/Documents/RigLab" });
    expect([isDirty(edited), isDirty(saved), saved.status?.text]).toEqual([true, false, "Saved 1 file to ~/Documents/RigLab"]);
    expect([saved.history, saved.mode, saved.frame, saved.activeAnimation]).toEqual([edited.history, "pose", 15, edited.activeAnimation]);
    expect(isDirty(run(saved, ease(15, "linear")))).toBe(true);
  });

  it("switches animation and frame together, and accepts only known grid spacings", () => {
    const state = run(initialState(), { type: "setFrame", frame: 30 }, { type: "select", selection: { kind: "animation", name: "unarmed-jump" } });
    expect([state.activeAnimation, state.frame]).toEqual(["unarmed-jump", 0]);
    expect(run(state, { type: "setGrid", spacing: 10 }).grid).toBe(10);
    expect(run(state, { type: "setGrid", spacing: 3 }).grid).toBe(5);
    expect(run(state, { type: "setSnap", snap: false }).snap).toBe(false);
  });
});

describe("switching class", () => {
  const full = () => initialState(fillClasses(libraryModel(LIBRARY)).model);

  it("keeps the kind, the frame and a selected key, so sword-attack goes to spear-attack", () => {
    let state = run(full(), { type: "select", selection: { kind: "animation", name: "sword-attack" } }, { type: "select", selection: { kind: "key", frame: 16 } });
    expect([state.activeAnimation, state.frame]).toEqual(["sword-attack", 16]);
    state = run(state, { type: "setClass", animationClass: "spear" });
    expect([state.activeAnimation, state.frame, state.selection]).toEqual(["spear-attack", 16, { kind: "key", frame: 16 }]);
    expect(run(state, { type: "setClass", animationClass: "unarmed" }).activeAnimation).toBe("unarmed-attack");
  });

  it("moves a selected animation to the new class, and keeps a selected bone", () => {
    const walk = run(full(), { type: "select", selection: { kind: "animation", name: "unarmed-walk" } }, { type: "setFrame", frame: 40 }, { type: "setClass", animationClass: "daggers" });
    expect([walk.activeAnimation, walk.selection, walk.frame]).toEqual(["daggers-walk", { kind: "animation", name: "daggers-walk" }, 40]);
    const bone = run(full(), { type: "select", selection: { kind: "bone", name: "head" } }, { type: "setClass", animationClass: "axe" });
    expect([bone.activeAnimation, bone.selection]).toEqual(["axe-idle", { kind: "bone", name: "head" }]);
  });

  it("stays put on its own class, and refuses a class the library lacks the kind for", () => {
    const state = full();
    expect(run(state, { type: "setClass", animationClass: "unarmed" })).toBe(state);
    const bare = run(initialState(), { type: "setClass", animationClass: "sword" });
    expect([bare.activeAnimation, bare.status]).toEqual(["unarmed-idle", { tone: "error", text: "The library has no sword-idle" }]);
  });
});
