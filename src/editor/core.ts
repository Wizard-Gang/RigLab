// Starting state, recording edits, and keeping the editor pointed at things the model still has.
import { LIBRARY } from "../library/active";
import { fillClasses } from "./classes";
import { record, startHistory } from "./history";
import { libraryModel } from "./model";
import type { LibraryModel } from "./model";
import { error, info, isDirty, modelOf } from "./types";
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
  const body = selection?.kind === "body" || selection?.kind === "grip"
    ? model.weapons.find((item) => item.weapon.name === selection.weapon && item.weapon.name === active?.class)?.weapon.bodies.find((candidate) => candidate.name === selection.body)
    : undefined;
  const stale = selection?.kind === "animation" ? !names.includes(selection.name)
    : selection?.kind === "bone" ? !model.rig.bones.some((bone) => bone.name === selection.name)
      : selection?.kind === "key" ? !active?.keys.some((key) => key.frame === selection.frame)
        : selection?.kind === "body" ? !body
          : selection?.kind === "grip" ? !body?.grips.some((grip) => grip.name === selection.grip)
            : false;
  return { ...state, activeAnimation, selection: stale ? null : selection, frame: Math.min(state.frame, active?.length ?? 0) };
}

export function initialState(model: LibraryModel = libraryModel(LIBRARY)): EditorState {
  return reconcile({
    history: startHistory(model),
    saved: model,
    mode: "animate",
    playing: false,
    selection: null,
    activeAnimation: null,
    frame: 0,
    view: fitView(model.rig.space),
    grid: 5,
    snap: true,
    rotationSnap: 0,
    onion: false,
    art: true,
    status: null,
  });
}

/**
 * The editor as it opens on the library: every class and kind the library lacks is started, as unsaved changes that
 * Save writes, and the status says how many.
 */
export function openState(loaded: LibraryModel = libraryModel(LIBRARY)): EditorState {
  const state = initialState(loaded);
  const filled = fillClasses(loaded);
  const count = filled.started.length;
  if (!count) return state;
  const text = [`Added ${count} missing ${count === 1 ? "animation" : "animations"}, one of each class and kind; Save writes them`, ...filled.misses].join("; ");
  return reconcile({ ...state, history: startHistory(filled.model), status: filled.misses.length ? error(text) : info(text) });
}

/**
 * Back to the library folder's saved files: the model as last loaded or saved, with any missing class and kind started
 * again as on open, and a fresh history, so undo cannot bring the discarded changes back. Mode, animation, frame, view
 * and a selection the saved model still has stay.
 */
export function revertState(state: EditorState): EditorState {
  if (!isDirty(state)) return state;
  const filled = fillClasses(state.saved);
  const model = filled.started.length ? filled.model : state.saved;
  return reconcile({ ...state, history: startHistory(model), status: info("Reverted to the library folder's saved files; undo and redo are cleared") });
}

/** Commit a model edit to history, then point the editor at the result. */
export function edit(state: EditorState, model: LibraryModel, patch: Partial<EditorState>): EditorState {
  return reconcile({ ...state, ...patch, history: record(state.history, model) });
}
