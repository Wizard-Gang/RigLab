// Pose-mode commands that pin a chain end or put it on the prop, and drags that move pins and the prop.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { Prop } from "../format/constraints";
import type { RigLabRig } from "../format/rig";
import { angleOf, lengthOf, rotate, snapAngle, tidy } from "./angles";
import type { Vector } from "./angles";
import { chainEnd, gripPoint, holdConstraints } from "./constraints";
import type { Constraints } from "./constraints";

export const DEFAULT_PROP = "prop";

export type HoldResult =
  | { readonly ok: true; readonly constraints: Constraints; readonly message: string }
  | { readonly ok: false; readonly error: string };

const tidyPoint = (point: Vector): Vector => ({ x: tidy(point.x), y: tidy(point.y) });

function withoutGrip(prop: Prop | null, chain: string): Prop | null {
  if (!prop) return null;
  const grips = prop.grips.filter((grip) => grip.chain !== chain);
  return grips.length ? { ...prop, grips } : null;
}

/** Pin a chain's end where it is now, or release its pin. A pinned end leaves the prop. */
export function togglePin(rig: RigLabRig, pose: Pose, constraints: Constraints, chainName: string): HoldResult {
  const chain = rig.chains.find((candidate) => candidate.name === chainName);
  if (!chain) return { ok: false, error: `The rig has no chain '${chainName}'` };
  if (constraints.pins.some((pin) => pin.chain === chainName)) {
    return { ok: true, constraints: { ...constraints, pins: constraints.pins.filter((pin) => pin.chain !== chainName) }, message: `Released ${chainName}` };
  }
  const end = tidyPoint(chainEnd(rig, pose, chain));
  return {
    ok: true,
    constraints: { pins: [...constraints.pins, { chain: chainName, ...end }], prop: withoutGrip(constraints.prop, chainName) },
    message: `Pinned ${chainName} at ${end.x}, ${end.y}`,
  };
}

/**
 * Put a chain's end on the prop, or take it off. The first hand creates the prop at that hand; the second
 * turns the prop into a straight shaft through both hands, keeping their spacing as the rigid grip.
 */
export function toggleGrip(rig: RigLabRig, pose: Pose, constraints: Constraints, chainName: string): HoldResult {
  const chain = rig.chains.find((candidate) => candidate.name === chainName);
  if (!chain) return { ok: false, error: `The rig has no chain '${chainName}'` };
  const prop = constraints.prop;
  if (prop?.grips.some((grip) => grip.chain === chainName)) {
    return { ok: true, constraints: { ...constraints, prop: withoutGrip(prop, chainName) }, message: `${chainName} let go of ${prop.name}` };
  }
  const pins = constraints.pins.filter((pin) => pin.chain !== chainName);
  const end = tidyPoint(chainEnd(rig, pose, chain));
  if (!prop) {
    const created: Prop = { name: DEFAULT_PROP, ...end, rotation: 0, grips: [{ chain: chainName, at: [0, 0] }] };
    return { ok: true, constraints: { pins, prop: created }, message: `${chainName} holds a new ${DEFAULT_PROP}` };
  }
  if (prop.grips.length >= 2) return { ok: false, error: `${prop.name} is already held by two hands` };
  const first = prop.grips[0]!;
  const origin = gripPoint(prop, first);
  const span = { x: end.x - origin.x, y: end.y - origin.y };
  const distance = lengthOf(span);
  if (distance < 1e-6) return { ok: false, error: `${chainName} is on the same point as ${first.chain}` };
  const shaft: Prop = {
    ...prop,
    ...tidyPoint(origin),
    rotation: tidy(angleOf(span)),
    grips: [{ chain: first.chain, at: [0, 0] }, { chain: chainName, at: [tidy(distance), 0] }],
  };
  return { ok: true, constraints: { pins, prop: shaft }, message: `${first.chain} and ${chainName} hold ${prop.name}` };
}

/** Move the prop so that one of its grip points lands on `target`. */
export function moveProp(prop: Prop, chain: string | null, target: Vector): Prop {
  const grip = prop.grips.find((candidate) => candidate.chain === chain);
  const from = grip ? gripPoint(prop, grip) : { x: prop.x, y: prop.y };
  return { ...prop, x: tidy(prop.x + target.x - from.x), y: tidy(prop.y + target.y - from.y) };
}

/** Turn the prop about its origin to face `target`, snapped to `snap` degrees. */
export function turnProp(prop: Prop, target: Vector, snap = 0): Prop {
  const toward = { x: target.x - prop.x, y: target.y - prop.y };
  if (lengthOf(toward) < 1e-9) return prop;
  return { ...prop, rotation: tidy(snapAngle(angleOf(toward), snap)) };
}

/** Where the prop's turn handle sits: past the far grip along the prop's axis. */
export function propReach(prop: Prop): number {
  return Math.max(...prop.grips.map((grip) => lengthOf({ x: grip.at[0], y: grip.at[1] }))) + 14;
}

export function propPoint(prop: Prop, along: number): Vector {
  const at = rotate({ x: along, y: 0 }, prop.rotation);
  return { x: prop.x + at.x, y: prop.y + at.y };
}

/** Re-hold the constraints after the body or the prop moved, folding violations into one message. */
export function hold(rig: RigLabRig, pose: Pose, constraints: Constraints, message: string | null) {
  const held = holdConstraints(rig, pose, constraints);
  const notes = [message, ...held.violations].filter((note): note is string => Boolean(note));
  return { pose: held.pose, constraints, message: notes.length ? notes.join("; ") : null };
}
