// Starting state, recording edits, and keeping the editor pointed at things the document still has.
import type { RigLabDocument } from "../format/document";
import { templateDocument } from "./templates";
import { record, startHistory } from "./history";
import { documentOf } from "./types";
import type { EditorState } from "./types";
import { fitView } from "./view";

/** Keep selection, active animation and frame pointing at things the present document still has. */
export function reconcile(state: EditorState): EditorState {
  const document = documentOf(state);
  const names = document.animations.map((animation) => animation.name);
  const activeAnimation = state.activeAnimation !== null && names.includes(state.activeAnimation)
    ? state.activeAnimation
    : names[0] ?? null;
  const active = document.animations.find((animation) => animation.name === activeAnimation);
  const selection = state.selection;
  const stale = selection?.kind === "animation" ? !names.includes(selection.name)
    : selection?.kind === "bone" ? !document.rig.bones.some((bone) => bone.name === selection.name)
      : selection?.kind === "key" ? !active?.keys.some((key) => key.frame === selection.frame)
        : false;
  return { ...state, activeAnimation, selection: stale ? null : selection, frame: Math.min(state.frame, active?.length ?? 0) };
}

export function initialState(document: RigLabDocument = templateDocument(), fileName: string | null = null): EditorState {
  return reconcile({
    history: startHistory(document),
    saved: document,
    fileName,
    mode: "animate",
    selection: null,
    activeAnimation: null,
    frame: 0,
    view: fitView(document.rig.space),
    grid: 5,
    snap: true,
    rotationSnap: 0,
    onion: false,
    art: false,
    status: null,
  });
}

/** Commit a document edit to history, then point the editor at the result. */
export function edit(state: EditorState, document: RigLabDocument, patch: Partial<EditorState>): EditorState {
  return reconcile({ ...state, ...patch, history: record(state.history, document) });
}
