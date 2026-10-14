// Starting state, recording edits, and keeping the editor pointed at things the model still has.
import { LIBRARY } from "../library/active";
import { record, startHistory } from "./history";
import { libraryModel } from "./model";
import type { LibraryModel } from "./model";
import { modelOf } from "./types";
import type { EditorState } from "./types";
import { fitView } from "./view";

/** Keep selection, active animation and frame pointing at things the present model still has. */
export function reconcile(state: EditorState): EditorState {
  const model = modelOf(state);
  const names = model.animations.map((animation) => animation.name);
  const activeAnimation = state.activeAnimation !== null && names.includes(state.activeAnimation)
    ? state.activeAnimation
    : names[0] ?? null;
  const active = model.animations.find((animation) => animation.name === activeAnimation);
  const selection = state.selection;
  const stale = selection?.kind === "animation" ? !names.includes(selection.name)
    : selection?.kind === "bone" ? !model.rig.bones.some((bone) => bone.name === selection.name)
      : selection?.kind === "key" ? !active?.keys.some((key) => key.frame === selection.frame)
        : false;
  return { ...state, activeAnimation, selection: stale ? null : selection, frame: Math.min(state.frame, active?.length ?? 0) };
}

export function initialState(model: LibraryModel = libraryModel(LIBRARY)): EditorState {
  return reconcile({
    history: startHistory(model),
    saved: model,
    mode: "animate",
    selection: null,
    activeAnimation: null,
    frame: 0,
    view: fitView(model.rig.space),
    grid: 5,
    snap: true,
    rotationSnap: 0,
    onion: false,
    art: false,
    status: null,
  });
}

/** Commit a model edit to history, then point the editor at the result. */
export function edit(state: EditorState, model: LibraryModel, patch: Partial<EditorState>): EditorState {
  return reconcile({ ...state, ...patch, history: record(state.history, model) });
}
