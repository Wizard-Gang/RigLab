import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation } from "../../src/editor/animations";
import { libraryModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { HISTORY_LIMIT } from "../../src/editor/history";
import { activeAnimationOf, editorReducer, initialState, isDirty, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { ANIMATION_KINDS } from "../../src/format";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const names = (state: EditorState): string[] => modelOf(state).animations.map((animation) => animation.name);

/** The chibi with one blank animation of each kind: idle, walk, jump, attack and hit. */
const moves = (): LibraryModel => ({ ...libraryModel(LIBRARY), animations: ANIMATION_KINDS.map((kind) => blankAnimation(LIBRARY.rig, kind, kind)) });

describe("editor state", () => {
  it("opens on the chibi with the library's seed animations, clean and with no history", () => {
    const state = initialState();
    expect([modelOf(state).rig.name, names(state), state.activeAnimation]).toEqual(["chibi", ["idle", "walk", "jump", "attack", "hit"], "idle"]);
    expect(state.mode).toBe("animate");
    expect(isDirty(state)).toBe(false);
    expect(state.history.past).toHaveLength(0);
    expect(initialState(moves()).activeAnimation).toBe("idle");
  });

  it("adds animations by kind, and duplicates, renames and deletes them as undoable edits", () => {
    let state = run(initialState({ ...libraryModel(LIBRARY), animations: [] }), { type: "addAnimation", kind: "idle" });
    expect(names(state)).toEqual(["idle"]);
    expect(state.selection).toEqual({ kind: "animation", name: "idle" });
    expect(state.status?.text).toBe("Added idle: 4 keys over 60 frames");
    expect(activeAnimationOf(state)).toMatchObject({ kind: "idle", fps: 60, length: 60, loop: true });
    expect(activeAnimationOf(state)?.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "smoothstep"], [15, "smoothstep"], [30, "smoothstep"], [45, "smoothstep"]]);
    state = run(state, { type: "addAnimation", kind: "attack" }, { type: "addAnimation", kind: "idle" });
    expect(names(state)).toEqual(["idle", "attack", "idle-2"]);
    expect(activeAnimationOf(state)?.name).toBe("idle-2");
    state = run(state, { type: "duplicateAnimation", name: "idle" });
    expect(names(state)).toEqual(["idle", "idle-copy", "attack", "idle-2"]);
    state = run(state, { type: "renameAnimation", from: "idle-copy", to: "breathe" });
    expect(state.activeAnimation).toBe("breathe");
    expect(state.selection).toEqual({ kind: "animation", name: "breathe" });
    state = run(state, { type: "deleteSelection" });
    expect(names(state)).toEqual(["idle", "attack", "idle-2"]);
    expect(state.selection).toBeNull();
    expect(state.history.past).toHaveLength(6);
    expect(isDirty(state)).toBe(true);
    state = run(state, ...Array.from({ length: 6 }, (): Action => ({ type: "undo" })));
    expect(names(state)).toEqual([]);
    expect(isDirty(state)).toBe(false);
    state = run(state, ...Array.from({ length: 4 }, (): Action => ({ type: "redo" })));
    expect(names(state)).toEqual(["idle", "idle-copy", "attack", "idle-2"]);
  });

  it("refuses invalid and duplicate names without touching the model", () => {
    const state = initialState(moves());
    const invalid = run(state, { type: "renameAnimation", from: "idle", to: "has space" });
    expect(invalid.status?.tone).toBe("error");
    expect(modelOf(invalid)).toBe(modelOf(state));
    const duplicate = run(state, { type: "renameAnimation", from: "idle", to: "walk" });
    expect(duplicate.status?.text).toMatch(/already exists/);
    expect(duplicate.history.past).toHaveLength(0);
  });

  it("deletes only a selected animation; a selected bone is left alone", () => {
    const bone = run(initialState(moves()), { type: "select", selection: { kind: "bone", name: "head" } }, { type: "deleteSelection" });
    expect(names(bone)).toHaveLength(5);
    expect(bone.history.past).toHaveLength(0);
    const animation = run(initialState(moves()), { type: "select", selection: { kind: "animation", name: "jump" } }, { type: "deleteSelection" });
    expect(names(animation)).toEqual(["idle", "walk", "attack", "hit"]);
    expect(animation.activeAnimation).toBe("attack");
  });

  it("keeps selection and frame valid across undo", () => {
    let state = run(initialState(moves()), { type: "addAnimation", kind: "hit" }, { type: "setFrame", frame: 9 });
    expect([state.activeAnimation, state.frame]).toEqual(["hit-2", 9]);
    state = run(state, { type: "undo" });
    expect(state.selection).toBeNull();
    expect(state.activeAnimation).toBe("idle");
    expect(run(state, { type: "setFrame", frame: 500 }).frame).toBe(60);
  });

  it("bounds undo depth", () => {
    let state = initialState();
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) state = run(state, { type: "addAnimation", kind: "idle" });
    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("records a save to the library folder, keeping history, mode and frame", () => {
    const edited = run(initialState(), { type: "addAnimation", kind: "idle" }, { type: "setMode", mode: "pose" }, { type: "setFrame", frame: 15 });
    const saved = run(edited, { type: "saved", model: modelOf(edited), note: "Saved 2 files to ~/Documents/RigLab" });
    expect([isDirty(edited), isDirty(saved), saved.status?.text]).toEqual([true, false, "Saved 2 files to ~/Documents/RigLab"]);
    expect([saved.history, saved.mode, saved.frame, saved.activeAnimation]).toEqual([edited.history, "pose", 15, edited.activeAnimation]);
    expect(isDirty(run(saved, { type: "addAnimation", kind: "walk" }))).toBe(true);
  });

  it("switches animation and frame together, and accepts only known grid spacings", () => {
    const state = run(initialState(moves()), { type: "setFrame", frame: 30 }, { type: "select", selection: { kind: "animation", name: "jump" } });
    expect([state.activeAnimation, state.frame]).toEqual(["jump", 0]);
    expect(run(state, { type: "setGrid", spacing: 10 }).grid).toBe(10);
    expect(run(state, { type: "setGrid", spacing: 3 }).grid).toBe(5);
    expect(run(state, { type: "setSnap", snap: false }).snap).toBe(false);
  });
});
