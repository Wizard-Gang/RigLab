import type { Vector } from "./angles";
import type { SolveStatus } from "./pose";

export { angleOf, nearest, rotate, snapAngle, wrap } from "./angles";
export type { Vector } from "./angles";
export { dragTip, REACH_TOLERANCE, solveChain } from "./ik";
export { aimBone, dragJoint, moveRoot, place, runtimeRig, setRotation, withRotation } from "./pose";
export type { SolveStatus, Solved } from "./pose";
export { blendConstraints, chainEnd, constraintsAt, constraintsOf, holdConstraints, isEmpty, NO_CONSTRAINTS, samplePose } from "./constraints";
export type { Constraints, Held } from "./constraints";
export { engineOf, hexframePose, playAt } from "./engine";
export { blendWielded, bodyPoint, bodyTransforms, gripTargets } from "./weapons";
export { freeBodyGripping, gripCenter, moveBody, pointInBody, ridingAngle, turnBody } from "./weaponDrags";
export type { BodyTransform, GripTarget, Wielded } from "./weapons";
export type { Engine, Played } from "./engine";
export { togglePin } from "./holds";
export type { HoldResult } from "./holds";
export { dragInPose } from "./poseDrag";
export type { DragHandle, PoseDrag } from "./poseDrag";

/**
 * Snap the drag target to the grid where that is feasible. A snapped target the limb cannot reach
 * falls back to the exact pointer position when that one is reachable; otherwise the snapped solve stands.
 */
export function solveWithGridSnap<T extends { readonly status: SolveStatus; readonly message: string | null }>(
  solve: (target: Vector) => T,
  target: Vector,
  spacing: number,
  snap: boolean,
): T {
  if (!snap || spacing <= 0) return solve(target);
  const snapped = { x: Math.round(target.x / spacing) * spacing, y: Math.round(target.y / spacing) * spacing };
  const onGrid = solve(snapped);
  if (onGrid.status === "ok") return onGrid;
  const exact = solve(target);
  return exact.status === "ok" ? { ...exact, message: "Off the grid: the nearest grid point is out of reach" } : onGrid;
}
