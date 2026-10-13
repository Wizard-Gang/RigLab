import { describe, expect, it } from "vitest";
import { templateDocument } from "../../src/editor/templates";
import { HISTORY_LIMIT } from "../../src/editor/history";
import { activeAnimationOf, documentOf, editorReducer, initialState, isDirty } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const names = (state: EditorState): string[] => documentOf(state).animations.map((animation) => animation.name);

describe("editor state", () => {
  it("opens on the humanoid with labIdle active, clean and with no history", () => {
    const state = initialState();
    expect(state.activeAnimation).toBe("labIdle");
    expect(state.mode).toBe("animate");
    expect(isDirty(state)).toBe(false);
    expect(state.history.past).toHaveLength(0);
  });

  it("adds, duplicates, renames and deletes animations as undoable edits", () => {
    let state = run(initialState(), { type: "addAnimation" });
    expect(names(state).at(-1)).toBe("animation");
    expect(state.selection).toEqual({ kind: "animation", name: "animation" });
    expect(activeAnimationOf(state)?.fps).toBe(14);
    state = run(state, { type: "duplicateAnimation", name: "labStrike" });
    expect(names(state).indexOf("labStrike-copy")).toBe(names(state).indexOf("labStrike") + 1);
    state = run(state, { type: "renameAnimation", from: "labStrike-copy", to: "spear-thrust" });
    expect(state.activeAnimation).toBe("spear-thrust");
    expect(state.selection).toEqual({ kind: "animation", name: "spear-thrust" });
    state = run(state, { type: "deleteSelection" });
    expect(names(state)).not.toContain("spear-thrust");
    expect(state.selection).toBeNull();
    expect(state.history.past).toHaveLength(4);
    expect(isDirty(state)).toBe(true);
    state = run(state, { type: "undo" }, { type: "undo" }, { type: "undo" }, { type: "undo" });
    expect(names(state)).toEqual(names(initialState()));
    expect(isDirty(state)).toBe(false);
    state = run(state, { type: "redo" }, { type: "redo" });
    expect(names(state)).toContain("labStrike-copy");
  });

  it("refuses invalid and duplicate names without touching the document", () => {
    const state = initialState();
    const invalid = run(state, { type: "renameAnimation", from: "labIdle", to: "has space" });
    expect(invalid.status?.tone).toBe("error");
    expect(documentOf(invalid)).toBe(documentOf(state));
    const duplicate = run(state, { type: "renameAnimation", from: "labIdle", to: "labWalk" });
    expect(duplicate.status?.text).toMatch(/already exists/);
    expect(duplicate.history.past).toHaveLength(0);
  });

  it("deletes only a selected animation; a selected bone is left alone", () => {
    const bone = run(initialState(), { type: "select", selection: { kind: "bone", name: "head" } }, { type: "deleteSelection" });
    expect(names(bone)).toHaveLength(13);
    expect(bone.history.past).toHaveLength(0);
    const animation = run(initialState(), { type: "select", selection: { kind: "animation", name: "jump" } }, { type: "deleteSelection" });
    expect(names(animation)).not.toContain("jump");
    expect(animation.activeAnimation).toBe(names(initialState())[names(initialState()).indexOf("jump") + 1]);
  });

  it("keeps selection and frame valid across undo", () => {
    let state = run(initialState(), { type: "addAnimation" }, { type: "setFrame", frame: 9 });
    expect(state.frame).toBe(9);
    state = run(state, { type: "undo" });
    expect(state.selection).toBeNull();
    expect(state.activeAnimation).toBe("labIdle");
    expect(run(state, { type: "setFrame", frame: 500 }).frame).toBe(60);
  });

  it("bounds undo depth", () => {
    let state = initialState();
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) state = run(state, { type: "addAnimation" });
    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("resets history on New and Open and records saves", () => {
    const edited = run(initialState(), { type: "addAnimation" }, { type: "setMode", mode: "pose" });
    const fresh = run(edited, { type: "new" });
    expect(fresh.history.past).toHaveLength(0);
    expect(fresh.mode).toBe("pose");
    const document = { ...templateDocument(), animations: templateDocument().animations.slice(0, 2) };
    const opened = run(edited, { type: "open", document, fileName: "two.riglab.json" });
    expect([opened.fileName, names(opened).length, isDirty(opened)]).toEqual(["two.riglab.json", 2, false]);
    const saved = run(edited, { type: "saved", document: documentOf(edited), fileName: "humanoid.riglab.json" });
    expect([isDirty(edited), isDirty(saved), saved.fileName]).toEqual([true, false, "humanoid.riglab.json"]);
  });

  it("replaces the document on import, clean and untitled, keeping the editor's mode", () => {
    const document = { ...templateDocument(), animations: templateDocument().animations.slice(0, 3) };
    const imported = run(initialState(), { type: "setMode", mode: "export" }, { type: "addAnimation" }, { type: "imported", document, source: "riglab-export.zip" });
    expect([imported.fileName, names(imported).length, isDirty(imported), imported.mode]).toEqual([null, 3, false, "export"]);
    expect(imported.status?.text).toBe("Imported riglab-export.zip");
    expect(imported.history.past).toHaveLength(0);
  });

  it("switches animation and frame together, and accepts only known grid spacings", () => {
    const state = run(initialState(), { type: "setFrame", frame: 30 }, { type: "select", selection: { kind: "animation", name: "jump" } });
    expect([state.activeAnimation, state.frame]).toEqual(["jump", 0]);
    expect(run(state, { type: "setGrid", spacing: 10 }).grid).toBe(10);
    expect(run(state, { type: "setGrid", spacing: 3 }).grid).toBe(5);
    expect(run(state, { type: "setSnap", snap: false }).snap).toBe(false);
  });
});
