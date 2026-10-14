// The editor's pure state machine. Model edits go through the undo history; view and selection do not.
import { reconcile } from "./core";
import { deleteEdit, poseEdit, rigEdit, timelineEdit } from "./modelEdits";
import { redo, undo } from "./history";
import { activeAnimationOf, info } from "./types";
import type { Action, EditorState } from "./types";
import { GRID_SPACINGS, ROTATION_SNAPS } from "./view";

export { initialState } from "./core";
export { activeAnimationOf, isDirty, modelOf, MODES } from "./types";
export type { Action, EditorState, Mode, Selection, Status } from "./types";

/** The next or previous key frame from the current frame, or the current frame when there is none. */
function steppedKey(state: EditorState, direction: -1 | 1): number {
  const frames = activeAnimationOf(state)?.keys.map((key) => key.frame) ?? [];
  const next = direction > 0 ? frames.find((frame) => frame > state.frame) : frames.filter((frame) => frame < state.frame).at(-1);
  return next ?? state.frame;
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "saved":
      return { ...state, saved: action.model, status: info(action.note) };
    case "status":
      return { ...state, status: action.status };
    case "undo":
      return state.history.past.length ? reconcile({ ...state, history: undo(state.history), status: info("Undo") }) : state;
    case "redo":
      return state.history.future.length ? reconcile({ ...state, history: redo(state.history), status: info("Redo") }) : state;
    case "select": {
      const selection = action.selection;
      const switching = selection?.kind === "animation" && selection.name !== state.activeAnimation;
      return reconcile({
        ...state,
        selection,
        activeAnimation: switching ? selection.name : state.activeAnimation,
        frame: switching ? 0 : selection?.kind === "key" ? selection.frame : state.frame,
      });
    }
    case "activateAnimation":
      return reconcile({ ...state, activeAnimation: action.name, frame: 0 });
    case "setMode":
      return { ...state, mode: action.mode };
    case "setFrame":
      return reconcile({ ...state, frame: Math.max(0, Math.round(action.frame)) });
    case "stepKey":
      return reconcile({ ...state, frame: steppedKey(state, action.direction) });
    case "setView":
      return { ...state, view: action.view };
    case "setGrid":
      return GRID_SPACINGS.includes(action.spacing) ? { ...state, grid: action.spacing } : state;
    case "setSnap":
      return { ...state, snap: action.snap };
    case "setRotationSnap":
      return ROTATION_SNAPS.includes(action.degrees) ? { ...state, rotationSnap: action.degrees } : state;
    case "setOnion":
      return { ...state, onion: action.onion };
    case "setArt":
      return { ...state, art: action.art };
    case "rigEdit":
      return rigEdit(state, action.edit);
    case "setPose":
      return poseEdit(state, action.pose, action.note ?? null, action.warning ?? null, action.constraints);
    case "timeline":
      return timelineEdit(state, action.edit);
    case "deleteSelection":
      return deleteEdit(state);
    default:
      return state;
  }
}
