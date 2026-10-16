// Pins and the class weapon, interpolated between keys and enforced by re-solving the chains that hold them.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { classWeapon } from "../format/animation";
import type { Key, RigLabAnimation } from "../format/animation";
import type { Pin } from "../format/constraints";
import type { Chain, RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";
import { sampleAnimation, segmentAt } from "../format/sample";
import { rotate, toVector } from "./angles";
import type { Vector } from "./angles";
import { solveChain } from "./ik";
import { place } from "./pose";
import { blendWielded, gripTargets } from "./weapons";
import type { Wielded } from "./weapons";

export interface Constraints {
  readonly pins: readonly Pin[];
  /** The class weapon and where the key places its free bodies; absent or null when unarmed. */
  readonly weapon?: Wielded | null;
}

export const NO_CONSTRAINTS: Constraints = Object.freeze({ pins: [] });

/** A key's constraints in an animation whose class holds `weapon` (null when unarmed). */
export function constraintsOf(key: Key, weapon: RigLabWeapon | null = null): Constraints {
  if (!key.pins && !weapon) return NO_CONSTRAINTS;
  return { pins: key.pins ?? [], ...(weapon ? { weapon: { weapon, bodies: key.bodies ?? [] } } : {}) };
}

export const isEmpty = (constraints: Constraints): boolean => constraints.pins.length === 0 && !constraints.weapon;

/** World position of a chain's end: its lower bone's tip. */
export function chainEnd(rig: RigLabRig, pose: Pose, chain: Chain): Vector {
  const lower = rig.bones.find((bone) => bone.name === chain.lower)!;
  const at = place(rig, pose).get(lower.name)!;
  const tip = rotate(toVector(lower.tip!), (at.rotation * 180) / Math.PI);
  return { x: at.x + tip.x, y: at.y + tip.y };
}

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

/** Constraints part-way to `end`: a pin or weapon in both moves between them, and one only in `start` holds still. */
export function blendConstraints(start: Constraints, end: Constraints, progress: number): Constraints {
  if (isEmpty(start)) return start;
  const pins = start.pins.map((pin) => {
    const next = end.pins.find((candidate) => candidate.chain === pin.chain);
    return next ? { chain: pin.chain, x: lerp(pin.x, next.x, progress), y: lerp(pin.y, next.y, progress) } : pin;
  });
  return { pins, ...(start.weapon ? { weapon: blendWielded(start.weapon, end.weapon, progress) } : {}) };
}

/** Constraints in force at a frame, eased like the pose between the key in force and the next; the class weapon is one of `weapons`. */
export function constraintsAt(animation: RigLabAnimation, frame: number, weapons: readonly RigLabWeapon[] = []): Constraints {
  const { from, to, progress } = segmentAt(animation, frame);
  const weapon = classWeapon(animation, weapons);
  const start = constraintsOf(from, weapon);
  return to ? blendConstraints(start, constraintsOf(to, weapon), progress) : start;
}

export interface Held {
  readonly pose: Pose;
  readonly violations: readonly string[];
}

/**
 * Re-solve every pinned or gripped chain to its target: pins, then the grips of the weapon's free bodies. A chain
 * that cannot hold is never stretched; a note says how far its end is from the target, such as
 * `leg-front is 1.20 off its pin`. Bodies that ride a hand need no solve.
 */
export function holdConstraints(rig: RigLabRig, pose: Pose, constraints: Constraints): Held {
  let next = pose;
  const violations: string[] = [];
  const hold = (name: string, target: Vector, what: string): void => {
    const chain = rig.chains.find((candidate) => candidate.name === name);
    if (!chain) return;
    const solved = solveChain(rig, next, chain, target);
    next = solved.pose;
    if (solved.status === "ok") return;
    const end = chainEnd(rig, next, chain);
    violations.push(`${chain.name} is ${Math.hypot(end.x - target.x, end.y - target.y).toFixed(2)} off ${what}`);
  };
  for (const pin of constraints.pins) hold(pin.chain, pin, "its pin");
  if (constraints.weapon) for (const grip of gripTargets(constraints.weapon)) hold(grip.chain, grip.target, grip.label);
  return { pose: next, violations };
}

/** The keys sampled at a frame, with their constraints held: how each of Hexframe's 13 poses is made. */
export function samplePose(rig: RigLabRig, animation: RigLabAnimation, frame: number, weapons: readonly RigLabWeapon[] = []): Held {
  return holdConstraints(rig, sampleAnimation(animation, frame), constraintsAt(animation, frame, weapons));
}
