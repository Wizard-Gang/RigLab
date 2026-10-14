// Rig setup's weapon edits: a class weapon's hold, grips and axis, at rest. Each returns a whole new model that passes
// validateModel, or a reason it was refused.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { BodyPlacement } from "../format/constraints";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon, WeaponBody, WeaponPoint } from "../format/weapon";
import { isFree } from "../format/weapon";
import { tidy } from "../solve/angles";
import type { Vector } from "../solve/angles";
import { holdConstraints } from "../solve/constraints";
import type { Constraints } from "../solve/constraints";
import type { DragHandle } from "../solve/poseDrag";
import { place } from "../solve/pose";
import { moveBody, pointInBody, ridingAngle, turnBody } from "../solve/weaponDrags";
import { bodyTransforms } from "../solve/weapons";
import type { Wielded } from "../solve/weapons";
import { restPose } from "./animations";
import { validateModel } from "./model";
import type { LibraryModel, ModelWeapon } from "./model";

export type WeaponEdit =
  /** Where a free body first sits when the rig, standing at rest, takes the weapon. */
  | { readonly kind: "setHold"; readonly weapon: string; readonly placement: BodyPlacement }
  | { readonly kind: "setGrip"; readonly weapon: string; readonly body: string; readonly grip: string; readonly at: WeaponPoint }
  /** A one-grip body's rotation from the gripping forearm. */
  | { readonly kind: "setGripAngle"; readonly weapon: string; readonly body: string; readonly grip: string; readonly angle: number }
  | { readonly kind: "setAxis"; readonly weapon: string; readonly body: string; readonly end: "butt" | "tip"; readonly at: WeaponPoint };

export type WeaponEditResult =
  | { readonly ok: true; readonly model: LibraryModel; readonly message: string }
  | { readonly ok: false; readonly error: string };

/** The rig at rest holding the weapon at its hold, both hands solved to its grips; what it cannot reach is reported. */
export function holdAtRest(rig: RigLabRig, held: ModelWeapon): { readonly pose: Pose; readonly constraints: Constraints; readonly violations: readonly string[] } {
  const constraints: Constraints = { pins: [], weapon: { weapon: held.weapon, bodies: held.hold.bodies } };
  const solved = holdConstraints(rig, restPose(rig), constraints);
  return { pose: solved.pose, constraints, violations: solved.violations };
}

const point = (at: WeaponPoint): WeaponPoint => [tidy(at[0]), tidy(at[1])];
const possessive = (name: string): string => (name.endsWith("s") ? `${name}'` : `${name}'s`);
/** A body as a sentence names it: "the sword" for a weapon of one body named after it, else "the daggers' dagger-front". */
const theBody = (weapon: string, body: string): string => (body === weapon ? `the ${weapon}` : `the ${possessive(weapon)} ${body}`);
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const shown = (at: WeaponPoint): string => `${+at[0].toFixed(3)}, ${+at[1].toFixed(3)}`;

function withBody(weapon: RigLabWeapon, name: string, change: (body: WeaponBody) => WeaponBody): RigLabWeapon {
  return { ...weapon, bodies: weapon.bodies.map((body) => (body.name === name ? change(body) : body)) };
}

/** The weapon and hold after `edit`, or why the edit names something the weapon does not have. */
export function editedWeapon(held: ModelWeapon, edit: WeaponEdit): { readonly ok: true; readonly held: ModelWeapon } | { readonly ok: false; readonly error: string } {
  const { weapon, hold } = held;
  const bodyName = edit.kind === "setHold" ? edit.placement.body : edit.body;
  const body = weapon.bodies.find((candidate) => candidate.name === bodyName);
  if (!body) return { ok: false, error: `The ${weapon.name} has no body '${bodyName}'` };
  const named = theBody(weapon.name, body.name);
  switch (edit.kind) {
    case "setHold": {
      if (!isFree(body)) return { ok: false, error: `${capital(named)} rides a hand, so it has no hold` };
      const placement = { body: body.name, x: tidy(edit.placement.x), y: tidy(edit.placement.y), rotation: tidy(edit.placement.rotation) };
      return { ok: true, held: { weapon, hold: { ...hold, bodies: hold.bodies.map((candidate) => (candidate.body === body.name ? placement : candidate)) } } };
    }
    case "setGrip":
    case "setGripAngle": {
      const grip = body.grips.find((candidate) => candidate.name === edit.grip);
      if (!grip) return { ok: false, error: `${capital(named)} has no grip '${edit.grip}'` };
      if (edit.kind === "setGripAngle" && isFree(body)) return { ok: false, error: `Two hands turn ${named}, so its grips have no angle` };
      const next = edit.kind === "setGrip" ? { ...grip, at: point(edit.at) } : { ...grip, angle: tidy(edit.angle) };
      return { ok: true, held: { weapon: withBody(weapon, body.name, (old) => ({ ...old, grips: old.grips.map((candidate) => (candidate === grip ? next : candidate)) })), hold } };
    }
    case "setAxis": {
      const axis: readonly [WeaponPoint, WeaponPoint] = edit.end === "butt" ? [point(edit.at), body.axis[1]] : [body.axis[0], point(edit.at)];
      return { ok: true, held: { weapon: withBody(weapon, body.name, (old) => ({ ...old, axis })), hold } };
    }
  }
}

/** What an edit did, for the status bar. */
function described(edit: WeaponEdit, held: ModelWeapon): string {
  const name = held.weapon.name;
  switch (edit.kind) {
    case "setHold":
      return `Held ${theBody(name, edit.placement.body)} at ${shown([edit.placement.x, edit.placement.y])}, ${+edit.placement.rotation.toFixed(3)}°`;
    case "setGrip":
      return `Moved ${theBody(name, edit.body)}'s ${edit.grip} grip to ${shown(edit.at)}; the hands hold it there on every ${name} key`;
    case "setGripAngle":
      return `Turned ${theBody(name, edit.body)} to ${+edit.angle.toFixed(3)}° on its hand, on every ${name} key`;
    case "setAxis":
      return `Moved ${theBody(name, edit.body)}'s ${edit.end} to ${shown(edit.at)}`;
  }
}

/** Apply a weapon edit to the model. The whole model must still validate, so two grips on one point are refused. */
export function applyWeaponEdit(model: LibraryModel, edit: WeaponEdit): WeaponEditResult {
  const index = model.weapons.findIndex((candidate) => candidate.weapon.name === edit.weapon);
  if (index < 0) return { ok: false, error: `The library has no weapon '${edit.weapon}'` };
  const result = editedWeapon(model.weapons[index]!, edit);
  if (!result.ok) return result;
  const next = { ...model, weapons: model.weapons.map((candidate, at) => (at === index ? result.held : candidate)) };
  const checked = validateModel(next);
  if (!checked.ok) {
    const error = checked.errors[0]!;
    if (/grips: must hold its two grips at different points$/.test(error)) return { ok: false, error: `The ${possessive(edit.weapon)} two grips must be at different points` };
    if (/axis: must be/.test(error)) return { ok: false, error: `The ${possessive(edit.weapon)} butt and tip must be apart` };
    return { ok: false, error: error.replace(/^\$\.weapons\[\d+\]\.weapon/, `the ${edit.weapon}`) };
  }
  return { ok: true, model: next, message: described(edit, result.held) };
}

/**
 * The weapon edit a Rig setup drag of `handle` to `target` makes, with the rig at `pose` holding `held` at its hold: a
 * free body's move and turn handles set its hold, a riding body's turn handle its grip angle, and a grip or an axis end
 * lands on the body where the pointer is. Null for a handle that edits no weapon.
 */
export function weaponDragEdit(rig: RigLabRig, held: ModelWeapon, pose: Pose, handle: DragHandle, target: Vector, snap = 0): WeaponEdit | null {
  const weapon = held.weapon.name;
  const wielded = { weapon: held.weapon, bodies: held.hold.bodies };
  const body = "body" in handle ? held.weapon.bodies.find((candidate) => candidate.name === handle.body) : undefined;
  const transform = body ? bodyTransforms(rig, pose, wielded).find((candidate) => candidate.body === body.name) : undefined;
  if (!body || !transform) return null;
  const placed = (moved: Wielded): WeaponEdit | null => {
    const placement = moved.bodies.find((candidate) => candidate.body === body.name);
    return placement ? { kind: "setHold", weapon, placement } : null;
  };
  switch (handle.kind) {
    case "weapon-move":
      return isFree(body) ? placed(moveBody(wielded, body.name, null, target)) : null;
    case "weapon-turn": {
      if (isFree(body)) return placed(turnBody(wielded, body.name, target, snap));
      const grip = body.grips[0]!;
      const lower = rig.chains.find((chain) => chain.name === grip.chain)?.lower;
      const at = lower ? place(rig, pose).get(lower) : undefined;
      if (!at) return null;
      return { kind: "setGripAngle", weapon, body: body.name, grip: grip.name, angle: ridingAngle(body, transform, (at.rotation * 180) / Math.PI, target, snap) };
    }
    case "weapon-grip":
      return { kind: "setGrip", weapon, body: body.name, grip: handle.grip, at: pointInBody(transform, target) };
    case "weapon-axis":
      return { kind: "setAxis", weapon, body: body.name, end: handle.end, at: pointInBody(transform, target) };
    default:
      return null;
  }
}
