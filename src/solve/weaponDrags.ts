// Drags that move or turn a free weapon body, or carry it by a hand that grips it. Bodies that ride a hand move with it.
// Rig setup also drags a body's grips and axis ends in its own frame, and turns a riding body on its hand.
import type { BodyPlacement } from "../format/constraints";
import { isFree } from "../format/weapon";
import type { WeaponBody, WeaponPoint } from "../format/weapon";
import { angleOf, lengthOf, nearest, rotate, snapAngle, tidy } from "./angles";
import type { Vector } from "./angles";
import { bodyPoint } from "./weapons";
import type { BodyTransform, Wielded } from "./weapons";

/** The midpoint of a body's grips in its own frame: where its move handle sits and what it turns about. */
export function gripCenter(body: WeaponBody): readonly [number, number] {
  const count = body.grips.length;
  return [body.grips.reduce((sum, grip) => sum + grip.at[0], 0) / count, body.grips.reduce((sum, grip) => sum + grip.at[1], 0) / count];
}

/** The free body a chain's hand grips, if any. */
export function freeBodyGripping(wielded: Wielded, chain: string): string | null {
  return wielded.weapon.bodies.find((body) => isFree(body) && body.grips.some((grip) => grip.chain === chain))?.name ?? null;
}

function update(wielded: Wielded, name: string, change: (placement: BodyPlacement, body: WeaponBody) => BodyPlacement): Wielded {
  const body = wielded.weapon.bodies.find((candidate) => candidate.name === name);
  if (!body) return wielded;
  return { ...wielded, bodies: wielded.bodies.map((placement) => (placement.body === name ? change(placement, body) : placement)) };
}

/** Move a free body so that its grips' midpoint, or the grip that `chain` holds, lands on `target`. */
export function moveBody(wielded: Wielded, name: string, chain: string | null, target: Vector): Wielded {
  return update(wielded, name, (placement, body) => {
    const grip = chain === null ? undefined : body.grips.find((candidate) => candidate.chain === chain);
    const from = bodyPoint(placement, grip ? grip.at : gripCenter(body));
    return { ...placement, x: tidy(placement.x + target.x - from.x), y: tidy(placement.y + target.y - from.y) };
  });
}

/** A world point in a body's own frame: where a grip or an axis end dragged to `target` lands on the body. */
export function pointInBody(transform: Omit<BodyTransform, "body">, target: Vector): WeaponPoint {
  const local = rotate({ x: target.x - transform.x, y: target.y - transform.y }, -transform.rotation);
  return [tidy(local.x), tidy(local.y)];
}

/**
 * A riding body's grip angle that turns its tip toward `target` about the hand, snapped to `snap` degrees: the body's
 * rotation less the gripping forearm's, `lowerRotation` in degrees.
 */
export function ridingAngle(body: WeaponBody, transform: Omit<BodyTransform, "body">, lowerRotation: number, target: Vector, snap = 0): number {
  const grip = body.grips[0]!;
  const hand = bodyPoint(transform, grip.at);
  const toward = { x: target.x - hand.x, y: target.y - hand.y };
  const angle = body.grips[0]!.angle ?? 0;
  if (lengthOf(toward) < 1e-9) return angle;
  const tip = { x: body.axis[1][0] - grip.at[0], y: body.axis[1][1] - grip.at[1] };
  return tidy(nearest(snapAngle(angleOf(toward) - angleOf(tip) - lowerRotation, snap), angle));
}

/** Turn a free body about its grips' midpoint so that its tip faces `target`, snapped to `snap` degrees. */
export function turnBody(wielded: Wielded, name: string, target: Vector, snap = 0): Wielded {
  return update(wielded, name, (placement, body) => {
    const center = gripCenter(body);
    const pivot = bodyPoint(placement, center);
    const toward = { x: target.x - pivot.x, y: target.y - pivot.y };
    if (lengthOf(toward) < 1e-9) return placement;
    const tip = body.axis[1];
    const rotation = nearest(snapAngle(angleOf(toward) - angleOf({ x: tip[0] - center[0], y: tip[1] - center[1] }), snap), placement.rotation);
    const offset = rotate({ x: center[0], y: center[1] }, rotation);
    return { body: name, x: tidy(pivot.x - offset.x), y: tidy(pivot.y - offset.y), rotation: tidy(rotation) };
  });
}
