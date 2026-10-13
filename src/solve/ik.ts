// Analytic two-bone IK: both segment lengths fixed, the chain's bend side kept, angle limits respected.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { boneOf } from "../format/rig";
import type { Chain, RigLabRig } from "../format/rig";
import { angleOf, clampToLimits, DEG, lengthOf, nearest, rotate, toVector } from "./angles";
import type { Vector } from "./angles";
import { aimBone, parentRotation, place, withRotation } from "./pose";
import type { Solved } from "./pose";

/** How close the chain end must land to count as reaching its target. */
export const REACH_TOLERANCE = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Where the chain end sits relative to the upper joint, in the upper bone's parent-rotated frame, for a lower rotation. */
function effectorLocal(offset: Vector, tip: Vector, lowerRotation: number): Vector {
  const swung = rotate(tip, lowerRotation);
  return { x: offset.x + swung.x, y: offset.y + swung.y };
}

/** Move a chain's end (the lower bone's tip) to `target` by rotating its upper and lower bones only. */
export function solveChain(rig: RigLabRig, pose: Pose, chain: Chain, target: Vector): Solved {
  const upper = boneOf(rig, chain.upper);
  const lower = boneOf(rig, chain.lower);
  const offset = toVector(lower.offset);
  const tip = toVector(lower.tip!);
  const first = lengthOf(offset);
  const second = lengthOf(tip);
  const placed = place(rig, pose);
  const origin = placed.get(upper.name)!;
  const base = parentRotation(rig, placed, upper.name);
  const toTarget = { x: target.x - origin.x, y: target.y - origin.y };
  const distance = lengthOf(toTarget);
  const shortest = Math.abs(first - second);
  const longest = first + second;
  const reach = clamp(distance, shortest, longest);

  const currentUpper = pose[upper.name]?.rotation ?? 0;
  const currentLower = pose[lower.name]?.rotation ?? 0;
  const currentEnd = rotate(effectorLocal(offset, tip, currentLower), base + currentUpper);
  const direction = distance > 1e-9 ? angleOf(toTarget) : angleOf(currentEnd);

  // Law of cosines: alpha at the upper joint, gamma inside the bend. A zero reach folds the chain flat.
  const alpha = reach > 1e-12 ? Math.acos(clamp((first ** 2 + reach ** 2 - second ** 2) / (2 * first * reach), -1, 1)) * DEG : 90;
  const gamma = Math.acos(clamp((first ** 2 + second ** 2 - reach ** 2) / (2 * first * second), -1, 1)) * DEG;
  const straight = angleOf(offset) - angleOf(tip);
  let lowerRotation = nearest(straight + chain.bend * (180 - gamma), currentLower);
  let upperRotation = nearest(direction - chain.bend * alpha - angleOf(offset) - base, currentUpper);

  let limited = false;
  const heldLower = clampToLimits(lowerRotation, lower.limits);
  if (heldLower !== lowerRotation) {
    // The bend is capped: aim the whole chain so its capped end still points at the target.
    limited = true;
    lowerRotation = heldLower;
    upperRotation = nearest(direction - angleOf(effectorLocal(offset, tip, lowerRotation)) - base, currentUpper);
  }
  const heldUpper = clampToLimits(upperRotation, upper.limits);
  if (heldUpper !== upperRotation) limited = true;
  upperRotation = heldUpper;

  const solved = withRotation(withRotation(pose, upper.name, upperRotation), lower.name, lowerRotation);
  const end = rotate(effectorLocal(offset, tip, solved[lower.name]!.rotation!), base + solved[upper.name]!.rotation!);
  const miss = Math.hypot(origin.x + end.x - target.x, origin.y + end.y - target.y);
  if (miss <= REACH_TOLERANCE) return { pose: solved, status: "ok", message: null };
  if (limited) return { pose: solved, status: "limited", message: `${chain.name} is held by its angle limits` };
  const why = distance > longest ? `${(distance - longest).toFixed(2)} beyond full extension` : `${(shortest - distance).toFixed(2)} inside its folded reach`;
  return { pose: solved, status: "unreachable", message: `${chain.name} cannot reach: the target is ${why}` };
}

/** Drag the end of a tipped bone: a chain's lower bone solves the chain; any other tipped bone aims itself. */
export function dragTip(rig: RigLabRig, pose: Pose, bone: string, target: Vector, snap = 0): Solved {
  const chain = rig.chains.find((candidate) => candidate.lower === bone);
  if (chain) return solveChain(rig, pose, chain, target);
  const { tip } = boneOf(rig, bone);
  if (!tip) return { pose, status: "ok", message: null };
  return aimBone(rig, pose, bone, toVector(tip), target, snap);
}
