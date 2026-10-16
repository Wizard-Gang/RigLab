// Revert: back to the library folder's saved files, discarding every unsaved change and the undo history with them.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar } from "../../src/app/Toolbar";
import { fillClasses } from "../../src/editor/classes";
import { libraryModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { editorReducer, initialState, isDirty, modelOf, openState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { LIBRARY } from "../../src/library/active";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const full = (): LibraryModel => fillClasses(libraryModel(LIBRARY)).model;
const keyPose = (state: EditorState) => modelOf(state).animations.find((animation) => animation.name === state.activeAnimation)!.keys[0]!.pose;

/** A pose, a weapon hold and the rig changed, on a library saved with all 25 animations, ending in Animate. */
function edited(saved: LibraryModel): EditorState {
  let state = run(
    initialState(saved),
    { type: "select", selection: { kind: "animation", name: "sword-idle" } },
    { type: "setMode", mode: "setup" },
    { type: "weaponEdit", edit: { kind: "setHold", weapon: "sword", placement: { body: "sword", x: 12, y: -36, rotation: 60 } } },
    { type: "rigEdit", edit: { kind: "setLimits", bone: "head", limits: { min: -30, max: 30 } } },
    { type: "setMode", mode: "animate" },
  );
  state = run(state, { type: "setPose", pose: { ...keyPose(state), head: { rotation: 12 } } });
  return run(state, { type: "select", selection: { kind: "bone", name: "head" } });
}

const toolbar = (dirty: boolean): string => renderToStaticMarkup(createElement(Toolbar, {
  platform: "mac", mode: "animate", onMode: () => undefined, onCommand: () => undefined, canUndo: false, canRedo: false, title: "lib", dirty, onRevert: () => undefined,
}));

describe("Revert", () => {
  it("puts the pose, the weapon hold and the rig back to the saved files and clears undo and redo", () => {
    const saved = full();
    const state = edited(saved);
    expect(isDirty(state)).toBe(true);
    expect(state.history.past.length).toBe(3);
    const reverted = run(state, { type: "revert" });
    expect(modelOf(reverted)).toBe(saved);
    expect(isDirty(reverted)).toBe(false);
    expect(reverted.history).toEqual({ past: [], present: saved, future: [] });
    expect(reverted.status).toEqual({ tone: "info", text: "Reverted to the library folder's saved files; undo and redo are cleared" });
    // Where the editor was stays: the mode, the animation, the frame and a selection the saved model still has.
    expect({ mode: reverted.mode, activeAnimation: reverted.activeAnimation, frame: reverted.frame, selection: reverted.selection })
      .toEqual({ mode: "animate", activeAnimation: "sword-idle", frame: 0, selection: { kind: "bone", name: "head" } });
    expect(run(reverted, { type: "undo" })).toBe(reverted);
  });

  it("keeps what a save wrote and discards only what came after it", () => {
    const first = run(initialState(full()), { type: "setMode", mode: "setup" }, { type: "rigEdit", edit: { kind: "setLimits", bone: "head", limits: { min: -20, max: 20 } } });
    const written = modelOf(first);
    const saved = run(first, { type: "saved", model: written, note: "Saved" });
    const after = run(saved, { type: "rigEdit", edit: { kind: "setLimits", bone: "head", limits: { min: -5, max: 5 } } });
    const reverted = run(after, { type: "revert" });
    expect(modelOf(reverted)).toBe(written);
    expect(reverted.history.past).toEqual([]);
  });

  it("starts missing animations again, as opening does, from a library saved without them", () => {
    const opened = openState(libraryModel(LIBRARY));
    const filled = modelOf(opened).animations.map((animation) => animation.name);
    const changed = run(opened, { type: "setMode", mode: "setup" }, { type: "rigEdit", edit: { kind: "setLimits", bone: "head", limits: { min: -20, max: 20 } } });
    const reverted = run(changed, { type: "revert" });
    expect(modelOf(reverted).animations.map((animation) => animation.name)).toEqual(filled);
    expect(modelOf(reverted).rig).toBe(opened.saved.rig);
    expect(isDirty(reverted)).toBe(true);
    expect(reverted.history.past).toEqual([]);
  });

  it("does nothing, and its button is disabled, with no unsaved changes", () => {
    const state = initialState(full());
    expect(run(state, { type: "revert" })).toBe(state);
    expect(toolbar(false)).toMatch(/<button type="button" class="tool" disabled="" title="Discard every unsaved change[^"]*">Revert<\/button>/);
    expect(toolbar(true)).toMatch(/<button type="button" class="tool" title="Discard every unsaved change[^"]*">Revert<\/button>/);
  });
});
