// Document edits by mode: anatomy in Rig setup, poses in Pose, interpolation on the timeline, and the animation list.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabDocument } from "../format/document";
import type { Constraints } from "../solve/constraints";
import { blankAnimation, isValidName, uniqueName } from "./animations";
import { edit } from "./core";
import { setKeyPose } from "./poseEdits";
import { applyRigEdit } from "./rigEdits";
import type { RigEdit } from "./rigEdits";
import { applyTimelineEdit } from "./timeline";
import type { TimelineEdit } from "./timeline";
import { KINDS } from "../format/timing";
import { activeAnimationOf, documentOf, error, info } from "./types";
import type { Action, EditorState } from "./types";

function replacing(document: RigLabDocument, previous: RigLabAnimation, next: RigLabAnimation): RigLabDocument {
  return { ...document, animations: document.animations.map((animation) => (animation === previous ? next : animation)) };
}

/** Anatomy changes only in Rig setup; everywhere else the rig's proportions are fixed. */
export function rigEdit(state: EditorState, change: RigEdit): EditorState {
  if (state.mode !== "setup") return { ...state, status: error("Switch to Rig setup to change the rig's anatomy") };
  const result = applyRigEdit(documentOf(state), change);
  if (!result.ok) return { ...state, status: error(result.error) };
  const selection = result.select === undefined ? state.selection : result.select === null ? null : { kind: "bone" as const, name: result.select };
  return edit(state, result.document, { selection, status: info(result.message) });
}

/** Poses change only in Pose mode, and only by writing the active animation's key at the current frame. */
export function poseEdit(state: EditorState, pose: Pose, note: string | null, warning: string | null, constraints?: Constraints): EditorState {
  if (state.mode !== "pose") return { ...state, status: error("Switch to Pose to change poses") };
  const document = documentOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation to pose") };
  const result = setKeyPose(document.rig, animation, state.frame, pose, constraints);
  if (!result.ok) return { ...state, status: error(result.error) };
  const text = [`Posed ${animation.name} at frame ${state.frame}`, note, warning].filter(Boolean).join("; ");
  return edit(state, replacing(document, animation, result.animation), { status: warning ? error(text) : info(text) });
}

/** Key interpolation changes on the timeline, in Pose and Animation modes. */
export function timelineEdit(state: EditorState, change: TimelineEdit): EditorState {
  if (state.mode === "setup") return { ...state, status: error("Switch to Pose or Animation to edit keys") };
  const document = documentOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation first") };
  const result = applyTimelineEdit(document.rig, animation, change);
  if (!result.ok) return { ...state, status: error(result.error) };
  return edit(state, replacing(document, animation, result.animation), { status: info(result.message) });
}

export function animationEdit(state: EditorState, action: Action): EditorState {
  const document = documentOf(state);
  const animations = document.animations;
  const names = animations.map((animation) => animation.name);
  switch (action.type) {
    case "addAnimation": {
      const added = blankAnimation(document.rig, uniqueName(action.kind, names), action.kind);
      const { length, keys } = KINDS[action.kind];
      return edit(state, { ...document, animations: [...animations, added] }, {
        activeAnimation: added.name,
        selection: { kind: "animation", name: added.name },
        frame: 0,
        status: info(`Added ${added.name}: ${keys} keys over ${length} frames`),
      });
    }
    case "duplicateAnimation": {
      const index = names.indexOf(action.name);
      if (index < 0) return state;
      const copy = { ...animations[index]!, name: uniqueName(`${action.name}-copy`, names) };
      return edit(state, { ...document, animations: [...animations.slice(0, index + 1), copy, ...animations.slice(index + 1)] }, {
        activeAnimation: copy.name, selection: { kind: "animation", name: copy.name }, status: info(`Duplicated ${action.name} as ${copy.name}`),
      });
    }
    case "renameAnimation": {
      if (action.to === action.from || !names.includes(action.from)) return state;
      if (!isValidName(action.to)) return { ...state, status: error(`'${action.to}' is not a valid name: use 1-64 letters, digits, '_' or '-', starting with a letter`) };
      if (names.includes(action.to)) return { ...state, status: error(`An animation named '${action.to}' already exists`) };
      const next = animations.map((animation) => (animation.name === action.from ? { ...animation, name: action.to } : animation));
      return edit(state, { ...document, animations: next }, {
        activeAnimation: state.activeAnimation === action.from ? action.to : state.activeAnimation,
        selection: state.selection?.kind === "animation" && state.selection.name === action.from ? { kind: "animation", name: action.to } : state.selection,
        status: info(`Renamed ${action.from} to ${action.to}`),
      });
    }
    case "deleteSelection": {
      const selection = state.selection;
      if (selection?.kind === "bone") return state.mode === "setup" ? rigEdit(state, { kind: "deleteBone", bone: selection.name }) : state;
      if (selection?.kind === "key") {
        const kind = activeAnimationOf(state)?.kind;
        return { ...state, status: error(kind ? `Keys stay: every ${kind} animation keeps all ${KINDS[kind].keys} of its keys` : "Keys stay where they are") };
      }
      if (selection?.kind !== "animation") return state;
      const index = names.indexOf(selection.name);
      if (index < 0) return state;
      const next = animations.filter((_, at) => at !== index);
      return edit(state, { ...document, animations: next }, {
        activeAnimation: next[Math.min(index, next.length - 1)]?.name ?? null, selection: null, frame: 0, status: info(`Deleted ${selection.name}`),
      });
    }
    default:
      return state;
  }
}
