// Drags that move or turn a free weapon body, or carry it by a hand that grips it. Bodies that ride a hand move with it.
import type { BodyPlacement } from "../format/constraints";
import { isFree } from "../format/weapon";
import type { WeaponBody } from "../format/weapon";
import { angleOf, lengthOf, nearest, rotate, snapAngle, tidy } from "./angles";
import type { Vector } from "./angles";
import { bodyPoint } from "./weapons";
import type { Wielded } from "./weapons";

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
