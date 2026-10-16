// Model edits by mode: anatomy and weapons in Rig setup, poses in Animate while paused, and interpolation on the timeline.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { Constraints } from "../solve/constraints";
import { edit } from "./core";
import { weaponRigs } from "./model";
import type { LibraryModel } from "./model";
import { setKeyPose } from "./poseEdits";
import { applyRigEdit } from "./rigEdits";
import type { RigEdit } from "./rigEdits";
import { applyTimelineEdit } from "./timeline";
import type { TimelineEdit } from "./timeline";
import { applyWeaponEdit, holdAtRest } from "./weaponEdits";
import type { WeaponEdit } from "./weaponEdits";
import { KINDS } from "../format/timing";
import { activeAnimationOf, error, info, modelOf } from "./types";
import type { EditorState } from "./types";

function replacing(model: LibraryModel, previous: RigLabAnimation, next: RigLabAnimation): LibraryModel {
  return { ...model, animations: model.animations.map((animation) => (animation === previous ? next : animation)) };
}

/** Anatomy changes only in Rig setup; everywhere else the rig's proportions are fixed. */
export function rigEdit(state: EditorState, change: RigEdit): EditorState {
  if (state.mode !== "setup") return { ...state, status: error("Switch to Rig setup to change the rig's anatomy") };
  const result = applyRigEdit(modelOf(state), change);
  if (!result.ok) return { ...state, status: error(result.error) };
  const selection = result.select === undefined ? state.selection : result.select === null ? null : { kind: "bone" as const, name: result.select };
  return edit(state, result.model, { selection, status: info(result.message) });
}

/**
 * A class weapon's hold, grips and axis change only in Rig setup, at rest, as one undo step. A grip the hands cannot
 * reach at rest is noted, and the arm stays at its closest reach.
 */
export function weaponEdit(state: EditorState, change: WeaponEdit): EditorState {
  if (state.mode !== "setup") return { ...state, status: error("Switch to Rig setup to change a weapon") };
  const result = applyWeaponEdit(modelOf(state), change);
  if (!result.ok) return { ...state, status: error(result.error) };
  const held = result.model.weapons.find((candidate) => candidate.weapon.name === change.weapon)!;
  const reach = holdAtRest(result.model.rig, held).violations;
  const text = [result.message, ...reach].join("; ");
  return edit(state, result.model, { status: info(text) });
}

/** Poses change only in Animate while it is paused, and only by writing the active animation's key at the current frame. */
export function poseEdit(state: EditorState, pose: Pose, note: string | null, warning: string | null, constraints?: Constraints): EditorState {
  if (state.mode !== "animate") return { ...state, status: error("Switch to Animate to change poses") };
  if (state.playing) return { ...state, status: error("Pause to change poses") };
  const model = modelOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation to pose") };
  const result = setKeyPose(model.rig, animation, state.frame, pose, constraints, weaponRigs(model));
  if (!result.ok) return { ...state, status: error(result.error) };
  const text = [`Posed ${animation.name} at frame ${state.frame}`, note, warning].filter(Boolean).join("; ");
  return edit(state, replacing(model, animation, result.animation), { status: info(text) });
}

/** Key interpolation changes on the timeline, in Animate and Export. */
export function timelineEdit(state: EditorState, change: TimelineEdit): EditorState {
  if (state.mode === "setup") return { ...state, status: error("Switch to Animate to edit keys") };
  const model = modelOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation first") };
  const result = applyTimelineEdit(model.rig, animation, change, weaponRigs(model));
  if (!result.ok) return { ...state, status: error(result.error) };
  return edit(state, replacing(model, animation, result.animation), { status: info(result.message) });
}

/** Delete removes the selected joint, with its subtree, in Rig setup. The library keeps every animation and key. */
export function deleteEdit(state: EditorState): EditorState {
  const selection = state.selection;
  if (selection?.kind === "bone") return state.mode === "setup" ? rigEdit(state, { kind: "deleteBone", bone: selection.name }) : state;
  if (selection?.kind === "key") {
    const kind = activeAnimationOf(state)?.kind;
    return { ...state, status: error(kind ? `Keys stay: every ${kind} animation keeps all ${KINDS[kind].keys} of its keys` : "Keys stay where they are") };
  }
  if (selection?.kind === "animation") return { ...state, status: error("Animations stay: the library holds one animation of each class and kind") };
  return state;
}
