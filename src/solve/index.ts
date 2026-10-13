import type { Vector } from "./angles";
import type { Solved } from "./pose";

export { angleOf, nearest, rotate, snapAngle, wrap } from "./angles";
export type { Vector } from "./angles";
export { dragTip, REACH_TOLERANCE, solveChain } from "./ik";
export { aimBone, dragJoint, moveRoot, place, runtimeRig, setRotation, withRotation } from "./pose";
export type { SolveStatus, Solved } from "./pose";

/**
 * Snap the drag target to the grid where that is feasible. A snapped target the limb cannot reach
 * falls back to the exact pointer position when that one is reachable; otherwise the snapped solve stands.
 */
export function solveWithGridSnap(solve: (target: Vector) => Solved, target: Vector, spacing: number, snap: boolean): Solved {
  if (!snap || spacing <= 0) return solve(target);
  const snapped = { x: Math.round(target.x / spacing) * spacing, y: Math.round(target.y / spacing) * spacing };
  const onGrid = solve(snapped);
  if (onGrid.status === "ok") return onGrid;
  const exact = solve(target);
  return exact.status === "ok" ? { ...exact, message: "Off the grid: the nearest grid point is out of reach" } : onGrid;
}
