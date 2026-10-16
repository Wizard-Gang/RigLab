// One Pose-mode drag: the handle decides what moves, then every pin and grip is held again.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import type { Vector } from "./angles";
import type { Constraints } from "./constraints";
import { hold } from "./holds";
import { dragTip } from "./ik";
import { dragJoint } from "./pose";
import type { SolveStatus } from "./pose";
import { freeBodyGripping, moveBody, turnBody } from "./weaponDrags";

export type DragHandle =
  | { readonly kind: "joint" | "tip"; readonly bone: string }
  | { readonly kind: "weapon-move"; readonly body: string }
  | { readonly kind: "weapon-turn"; readonly body: string }
  /** Rig setup only: a grip point, moved in its body's frame. */
  | { readonly kind: "weapon-grip"; readonly body: string; readonly grip: string }
  /** Rig setup only: an end of a body's axis, moved in its body's frame. */
  | { readonly kind: "weapon-axis"; readonly body: string; readonly end: "butt" | "tip" };

export interface PoseDrag {
  readonly pose: Pose;
  readonly constraints: Constraints;
  readonly status: SolveStatus;
  readonly message: string | null;
}

function held(rig: RigLabRig, pose: Pose, constraints: Constraints, status: SolveStatus, message: string | null): PoseDrag {
  const result = hold(rig, pose, constraints, message);
  const violated = result.message !== null && result.message !== message;
  return { ...result, status: status !== "ok" ? status : violated ? "limited" : "ok" };
}

/**
 * Pose-mode drag in priority order. A pinned chain end moves its pin, a gripped one carries the free weapon body it
 * holds, and the free bodies' handles move or turn them; any other handle poses the body, and bodies that ride a
 * hand follow it. Pins and grips are then re-held, so lengths stay fixed and a hold that cannot be kept is reported.
 */
export function dragInPose(
  rig: RigLabRig,
  pose: Pose,
  constraints: Constraints,
  handle: DragHandle,
  target: Vector,
  rotationSnap = 0,
): PoseDrag {
  const weapon = constraints.weapon;
  if (handle.kind === "weapon-grip" || handle.kind === "weapon-axis") return { pose, constraints, status: "ok", message: null };
  if (handle.kind === "weapon-move" || handle.kind === "weapon-turn") {
    if (!weapon) return { pose, constraints, status: "ok", message: null };
    const moved = handle.kind === "weapon-move" ? moveBody(weapon, handle.body, null, target) : turnBody(weapon, handle.body, target, rotationSnap);
    return held(rig, pose, { ...constraints, weapon: moved }, "ok", null);
  }
  const chain = handle.kind === "tip" ? rig.chains.find((candidate) => candidate.lower === handle.bone) : undefined;
  if (chain && constraints.pins.some((pin) => pin.chain === chain.name)) {
    const pins = constraints.pins.map((pin) => (pin.chain === chain.name ? { chain: pin.chain, x: target.x, y: target.y } : pin));
    return held(rig, pose, { ...constraints, pins }, "ok", null);
  }
  const carried = chain && weapon ? freeBodyGripping(weapon, chain.name) : null;
  if (chain && weapon && carried) return held(rig, pose, { ...constraints, weapon: moveBody(weapon, carried, chain.name, target) }, "ok", null);
  const solved = handle.kind === "joint"
    ? dragJoint(rig, pose, handle.bone, target, rotationSnap)
    : dragTip(rig, pose, handle.bone, target, rotationSnap);
  return held(rig, solved.pose, constraints, solved.status, solved.message);
}
