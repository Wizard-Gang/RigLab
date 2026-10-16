// A held weapon: free bodies the key places and both hands solve to, and one-grip bodies that ride their hands.
import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { BodyPlacement } from "../format/constraints";
import type { RigLabRig } from "../format/rig";
import { isFree } from "../format/weapon";
import type { RigLabWeapon, WeaponBody, WeaponGrip } from "../format/weapon";
import { rotate, toVector } from "./angles";
import type { Vector } from "./angles";
import { place } from "./pose";

/** An animation's class weapon, with where a key or hold places its free bodies. */
export interface Wielded {
  readonly weapon: RigLabWeapon;
  /** Where each free body is; one-grip bodies ride their hands instead. */
  readonly bodies: readonly BodyPlacement[];
}

/** A body's world transform: its origin and its rotation in degrees. */
export interface BodyTransform {
  readonly body: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/** A point where a hand must be: a grip on a free body. */
export interface GripTarget {
  readonly chain: string;
  readonly target: Vector;
  /** Names the grip in a note, such as `the staff's far grip`. */
  readonly label: string;
}

/** A point in a body's own frame, placed in the world. */
export function bodyPoint(transform: Omit<BodyTransform, "body">, at: readonly [number, number]): Vector {
  const offset = rotate(toVector(at), transform.rotation);
  return { x: transform.x + offset.x, y: transform.y + offset.y };
}

const possessive = (name: string): string => (name.endsWith("s") ? `${name}'` : `${name}'s`);
const label = (weapon: RigLabWeapon, body: WeaponBody, grip: WeaponGrip): string =>
  `the ${possessive(weapon.name)}${weapon.bodies.length > 1 ? ` ${body.name}` : ""} ${grip.name} grip`;

/** Where each hand on a free body must be. */
export function gripTargets(wielded: Wielded): GripTarget[] {
  return wielded.weapon.bodies.filter(isFree).flatMap((body) => {
    const placement = wielded.bodies.find((candidate) => candidate.body === body.name);
    return placement
      ? body.grips.map((grip) => ({ chain: grip.chain, target: bodyPoint(placement, grip.at), label: label(wielded.weapon, body, grip) }))
      : [];
  });
}

/** A one-grip body on its hand: turned by the grip's angle from the lower bone, with its grip on the chain's end. */
function riding(rig: RigLabRig, placed: ReadonlyMap<string, Placed>, body: WeaponBody): BodyTransform | null {
  const grip = body.grips[0]!;
  const chain = rig.chains.find((candidate) => candidate.name === grip.chain);
  const lower = chain ? rig.bones.find((bone) => bone.name === chain.lower) : undefined;
  const at = lower ? placed.get(lower.name) : undefined;
  if (!lower?.tip || !at) return null;
  const degrees = (at.rotation * 180) / Math.PI;
  const tip = rotate(toVector(lower.tip), degrees);
  const rotation = degrees + grip.angle!;
  const offset = rotate(toVector(grip.at), rotation);
  return { body: body.name, x: at.x + tip.x - offset.x, y: at.y + tip.y - offset.y, rotation };
}

/** Every body's world transform for a pose, in the weapon's body order. */
export function bodyTransforms(rig: RigLabRig, pose: Pose, wielded: Wielded): BodyTransform[] {
  const placed = place(rig, pose);
  return wielded.weapon.bodies.flatMap((body) => {
    if (!isFree(body)) {
      const transform = riding(rig, placed, body);
      return transform ? [transform] : [];
    }
    const placement = wielded.bodies.find((candidate) => candidate.body === body.name);
    return placement ? [{ body: body.name, x: placement.x, y: placement.y, rotation: placement.rotation }] : [];
  });
}

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

/** Part-way to `end`: free bodies move when `end` holds the same weapon, and otherwise hold still. */
export function blendWielded(start: Wielded, end: Wielded | null | undefined, progress: number): Wielded {
  if (!end || end.weapon.name !== start.weapon.name) return start;
  const bodies = start.bodies.map((placement) => {
    const next = end.bodies.find((candidate) => candidate.body === placement.body);
    return next
      ? { body: placement.body, x: lerp(placement.x, next.x, progress), y: lerp(placement.y, next.y, progress), rotation: lerp(placement.rotation, next.rotation, progress) }
      : placement;
  });
  return { ...start, bodies };
}
