// The editor's pure state machine. Document edits go through the undo history; view and selection do not.
import type { RigLabAnimation } from "../format/animation";
import type { RigLabDocument } from "../format/document";
import { blankAnimation, isValidName, templateDocument, uniqueName } from "./animations";
import { record, redo, startHistory, undo } from "./history";
import { applyRigEdit } from "./rigEdits";
import type { RigEdit } from "./rigEdits";
import type { History } from "./history";
import { fitView, GRID_SPACINGS } from "./view";
import type { View } from "./view";

export type Mode = "setup" | "pose" | "animate";
export const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: "setup", label: "Rig setup" },
  { id: "pose", label: "Pose" },
  { id: "animate", label: "Animation" },
];

export type Selection =
  | { readonly kind: "bone"; readonly name: string }
  | { readonly kind: "animation"; readonly name: string }
  | null;

export interface Status {
  readonly tone: "info" | "error";
  readonly text: string;
}

export interface EditorState {
  readonly history: History<RigLabDocument>;
  /** The document as last created, opened or saved; any other present document is unsaved. */
  readonly saved: RigLabDocument;
  /** The file the document was opened from or saved to, or null before the first save. */
  readonly fileName: string | null;
  readonly mode: Mode;
  readonly selection: Selection;
  readonly activeAnimation: string | null;
  readonly frame: number;
  readonly view: View;
  readonly grid: number;
  readonly snap: boolean;
  readonly status: Status | null;
}

export type Action =
  | { readonly type: "new" }
  | { readonly type: "open"; readonly document: RigLabDocument; readonly fileName: string }
  | { readonly type: "saved"; readonly document: RigLabDocument; readonly fileName: string }
  | { readonly type: "status"; readonly status: Status | null }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "addAnimation" }
  | { readonly type: "duplicateAnimation"; readonly name: string }
  | { readonly type: "renameAnimation"; readonly from: string; readonly to: string }
  | { readonly type: "deleteSelection" }
  | { readonly type: "rigEdit"; readonly edit: RigEdit }
  | { readonly type: "select"; readonly selection: Selection }
  | { readonly type: "activateAnimation"; readonly name: string }
  | { readonly type: "setMode"; readonly mode: Mode }
  | { readonly type: "setFrame"; readonly frame: number }
  | { readonly type: "setView"; readonly view: View }
  | { readonly type: "setGrid"; readonly spacing: number }
  | { readonly type: "setSnap"; readonly snap: boolean };

export const documentOf = (state: EditorState): RigLabDocument => state.history.present;
export const isDirty = (state: EditorState): boolean => state.history.present !== state.saved;

export function activeAnimationOf(state: EditorState): RigLabAnimation | null {
  return documentOf(state).animations.find((animation) => animation.name === state.activeAnimation) ?? null;
}

/** Keep selection, active animation and frame pointing at things the present document still has. */
function reconcile(state: EditorState): EditorState {
  const document = documentOf(state);
  const names = document.animations.map((animation) => animation.name);
  const activeAnimation = state.activeAnimation !== null && names.includes(state.activeAnimation)
    ? state.activeAnimation
    : names[0] ?? null;
  const selection = state.selection?.kind === "animation" && !names.includes(state.selection.name) ? null
    : state.selection?.kind === "bone" && !document.rig.bones.some((bone) => bone.name === state.selection!.name) ? null
      : state.selection;
  const length = document.animations.find((animation) => animation.name === activeAnimation)?.length ?? 0;
  return { ...state, activeAnimation, selection, frame: Math.min(state.frame, length) };
}

export function initialState(document: RigLabDocument = templateDocument(), fileName: string | null = null): EditorState {
  return reconcile({
    history: startHistory(document),
    saved: document,
    fileName,
    mode: "animate",
    selection: null,
    activeAnimation: document.animations.find((animation) => animation.name === "labIdle")?.name ?? null,
    frame: 0,
    view: fitView(document.rig.space),
    grid: 5,
    snap: true,
    status: null,
  });
}

const info = (text: string): Status => ({ tone: "info", text });
const error = (text: string): Status => ({ tone: "error", text });

/** Commit a document edit to history, then point the editor at the result. */
function edit(state: EditorState, document: RigLabDocument, patch: Partial<EditorState>): EditorState {
  return reconcile({ ...state, ...patch, history: record(state.history, document) });
}

function withAnimations(document: RigLabDocument, animations: readonly RigLabAnimation[]): RigLabDocument {
  return { ...document, animations };
}

/** Anatomy changes only in Rig setup; everywhere else the rig's proportions are fixed. */
function rigEdit(state: EditorState, change: RigEdit): EditorState {
  if (state.mode !== "setup") return { ...state, status: error("Switch to Rig setup to change the rig's anatomy") };
  const result = applyRigEdit(documentOf(state), change);
  if (!result.ok) return { ...state, status: error(result.error) };
  const selection = result.select === undefined ? state.selection : result.select === null ? null : { kind: "bone" as const, name: result.select };
  return edit(state, result.document, { selection, status: info(result.message) });
}

function animationEdit(state: EditorState, action: Action): EditorState {
  const document = documentOf(state);
  const animations = document.animations;
  const names = animations.map((animation) => animation.name);
  switch (action.type) {
    case "addAnimation": {
      const added = blankAnimation(document.rig, uniqueName("animation", names));
      return edit(state, withAnimations(document, [...animations, added]), {
        activeAnimation: added.name, selection: { kind: "animation", name: added.name }, frame: 0, status: info(`Added ${added.name}`),
      });
    }
    case "duplicateAnimation": {
      const index = names.indexOf(action.name);
      if (index < 0) return state;
      const copy = { ...animations[index]!, name: uniqueName(`${action.name}-copy`, names) };
      const next = [...animations.slice(0, index + 1), copy, ...animations.slice(index + 1)];
      return edit(state, withAnimations(document, next), {
        activeAnimation: copy.name, selection: { kind: "animation", name: copy.name }, status: info(`Duplicated ${action.name} as ${copy.name}`),
      });
    }
    case "renameAnimation": {
      if (action.to === action.from || !names.includes(action.from)) return state;
      if (!isValidName(action.to)) return { ...state, status: error(`'${action.to}' is not a valid name: use 1-64 letters, digits, '_' or '-', starting with a letter`) };
      if (names.includes(action.to)) return { ...state, status: error(`An animation named '${action.to}' already exists`) };
      const next = animations.map((animation) => (animation.name === action.from ? { ...animation, name: action.to } : animation));
      return edit(state, withAnimations(document, next), {
        activeAnimation: state.activeAnimation === action.from ? action.to : state.activeAnimation,
        selection: state.selection?.kind === "animation" && state.selection.name === action.from ? { kind: "animation", name: action.to } : state.selection,
        status: info(`Renamed ${action.from} to ${action.to}`),
      });
    }
    case "deleteSelection": {
      if (state.selection?.kind === "bone" && state.mode === "setup") {
        return rigEdit(state, { kind: "deleteBone", bone: state.selection.name });
      }
      if (state.selection?.kind !== "animation") return state;
      const index = names.indexOf(state.selection.name);
      if (index < 0) return state;
      const next = animations.filter((_, at) => at !== index);
      const neighbour = next[Math.min(index, next.length - 1)]?.name ?? null;
      return edit(state, withAnimations(document, next), {
        activeAnimation: neighbour, selection: null, frame: 0, status: info(`Deleted ${state.selection.name}`),
      });
    }
    default:
      return state;
  }
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "new":
      return { ...initialState(templateDocument()), mode: state.mode, grid: state.grid, snap: state.snap, status: info("New document") };
    case "open":
      return { ...initialState(action.document, action.fileName), mode: state.mode, grid: state.grid, snap: state.snap, status: info(`Opened ${action.fileName}`) };
    case "saved":
      return { ...state, saved: action.document, fileName: action.fileName, status: info(`Saved ${action.fileName}`) };
    case "status":
      return { ...state, status: action.status };
    case "undo":
      return state.history.past.length ? reconcile({ ...state, history: undo(state.history), status: info("Undo") }) : state;
    case "redo":
      return state.history.future.length ? reconcile({ ...state, history: redo(state.history), status: info("Redo") }) : state;
    case "select": {
      const switching = action.selection?.kind === "animation" && action.selection.name !== state.activeAnimation;
      return reconcile({
        ...state,
        selection: action.selection,
        activeAnimation: switching ? action.selection!.name : state.activeAnimation,
        frame: switching ? 0 : state.frame,
      });
    }
    case "activateAnimation":
      return reconcile({ ...state, activeAnimation: action.name, frame: 0 });
    case "setMode":
      return { ...state, mode: action.mode };
    case "setFrame":
      return reconcile({ ...state, frame: Math.max(0, Math.round(action.frame)) });
    case "setView":
      return { ...state, view: action.view };
    case "setGrid":
      return GRID_SPACINGS.includes(action.spacing) ? { ...state, grid: action.spacing } : state;
    case "setSnap":
      return { ...state, snap: action.snap };
    case "rigEdit":
      return rigEdit(state, action.edit);
    default:
      return animationEdit(state, action);
  }
}
