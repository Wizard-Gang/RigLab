// Pins and a held prop, interpolated between keys and enforced by re-solving the chains that hold them.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { Key, RigLabAnimation } from "../format/animation";
import type { Grip, Pin, Prop } from "../format/constraints";
import type { Chain, RigLabRig } from "../format/rig";
import { sampleAnimation, segmentAt } from "../format/sample";
import { rotate, toVector } from "./angles";
import type { Vector } from "./angles";
import { solveChain } from "./ik";
import { place } from "./pose";

export interface Constraints {
  readonly pins: readonly Pin[];
  readonly prop: Prop | null;
}

export const NO_CONSTRAINTS: Constraints = Object.freeze({ pins: [], prop: null });

export function constraintsOf(key: Key): Constraints {
  return key.pins || key.prop ? { pins: key.pins ?? [], prop: key.prop ?? null } : NO_CONSTRAINTS;
}

export const isEmpty = (constraints: Constraints): boolean => constraints.pins.length === 0 && constraints.prop === null;

/** World position of a grip point on the prop. */
export function gripPoint(prop: Prop, grip: Grip): Vector {
  const at = rotate(toVector(grip.at), prop.rotation);
  return { x: prop.x + at.x, y: prop.y + at.y };
}

/** World position of a chain's end: its lower bone's tip. */
export function chainEnd(rig: RigLabRig, pose: Pose, chain: Chain): Vector {
  const lower = rig.bones.find((bone) => bone.name === chain.lower)!;
  const at = place(rig, pose).get(lower.name)!;
  const tip = rotate(toVector(lower.tip!), (at.rotation * 180) / Math.PI);
  return { x: at.x + tip.x, y: at.y + tip.y };
}

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

/**
 * Constraints in force at a frame, eased like the pose: a pin or prop present in both keys moves between
 * them, and one present only in the key in force holds still.
 */
export function constraintsAt(animation: RigLabAnimation, frame: number): Constraints {
  const { from, to, progress } = segmentAt(animation, frame);
  const start = constraintsOf(from);
  if (!to || isEmpty(start)) return start;
  const end = constraintsOf(to);
  const pins = start.pins.map((pin) => {
    const next = end.pins.find((candidate) => candidate.chain === pin.chain);
    return next ? { chain: pin.chain, x: lerp(pin.x, next.x, progress), y: lerp(pin.y, next.y, progress) } : pin;
  });
  const prop = start.prop && end.prop?.name === start.prop.name
    ? {
      ...start.prop,
      x: lerp(start.prop.x, end.prop.x, progress),
      y: lerp(start.prop.y, end.prop.y, progress),
      rotation: lerp(start.prop.rotation, end.prop.rotation, progress),
    }
    : start.prop;
  return { pins, prop };
}

export interface Held {
  readonly pose: Pose;
  readonly violations: readonly string[];
}

/** Re-solve every pinned or gripped chain to its target; a chain that cannot hold is reported, never stretched. */
export function holdConstraints(rig: RigLabRig, pose: Pose, constraints: Constraints): Held {
  let next = pose;
  const violations: string[] = [];
  const hold = (name: string, target: Vector, what: string): void => {
    const chain = rig.chains.find((candidate) => candidate.name === name);
    if (!chain) return;
    const solved = solveChain(rig, next, chain, target);
    next = solved.pose;
    if (solved.status !== "ok") violations.push(`${what}: ${solved.message}`);
  };
  for (const pin of constraints.pins) hold(pin.chain, pin, "Pin");
  const prop = constraints.prop;
  if (prop) for (const grip of prop.grips) hold(grip.chain, gripPoint(prop, grip), `${prop.name} grip`);
  return { pose: next, violations };
}

/** The pose the editor previews and the exporter bakes: the sampled keys, with their constraints held. */
export function samplePose(rig: RigLabRig, animation: RigLabAnimation, frame: number): Held {
  return holdConstraints(rig, sampleAnimation(animation, frame), constraintsAt(animation, frame));
}
