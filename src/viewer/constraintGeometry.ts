// Screen-ready geometry for a frame's pins, prop and weapon.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { isFree } from "../format/weapon";
import { bodyPoint, bodyTransforms, chainEnd, gripCenter, gripPoint, propPoint, propReach } from "../solve";
import type { Constraints, Vector } from "../solve";

export interface PinMarker {
  readonly chain: string;
  readonly at: Vector;
  /** Where the chain end actually is; it differs from `at` only when the pin cannot be held. */
  readonly end: Vector;
}

export interface PropMarker {
  readonly name: string;
  readonly start: Vector;
  readonly end: Vector;
  readonly origin: Vector;
  readonly grips: readonly Vector[];
}

/** One weapon body: its axis from butt to tip and, for a free body, where its move handle sits. */
export interface WeaponMarker {
  readonly body: string;
  /** Free bodies have move and turn handles; a body that rides a hand follows it. */
  readonly free: boolean;
  readonly butt: Vector;
  readonly tip: Vector;
  readonly center: Vector;
  readonly grips: readonly Vector[];
}

export interface ConstraintGeometry {
  readonly pins: readonly PinMarker[];
  readonly prop: PropMarker | null;
  readonly weapons: readonly WeaponMarker[];
}

export const NO_GEOMETRY: ConstraintGeometry = Object.freeze({ pins: [], prop: null, weapons: [] });

export function constraintGeometry(rig: RigLabRig, pose: Pose, constraints: Constraints): ConstraintGeometry {
  const pins = constraints.pins.flatMap((pin) => {
    const chain = rig.chains.find((candidate) => candidate.name === pin.chain);
    return chain ? [{ chain: pin.chain, at: { x: pin.x, y: pin.y }, end: chainEnd(rig, pose, chain) }] : [];
  });
  const prop = constraints.prop;
  const wielded = constraints.weapon;
  const transforms = wielded ? bodyTransforms(rig, pose, wielded) : [];
  const weapons = (wielded?.weapon.bodies ?? []).flatMap((body) => {
    const transform = transforms.find((candidate) => candidate.body === body.name);
    if (!transform) return [];
    const [butt, tip] = body.axis;
    return [{
      body: body.name,
      free: isFree(body),
      butt: bodyPoint(transform, butt),
      tip: bodyPoint(transform, tip),
      center: bodyPoint(transform, gripCenter(body)),
      grips: body.grips.map((grip) => bodyPoint(transform, grip.at)),
    }];
  });
  return {
    weapons,
    pins,
    prop: prop
      ? {
        name: prop.name,
        start: propPoint(prop, -6),
        end: propPoint(prop, propReach(prop)),
        origin: { x: prop.x, y: prop.y },
        grips: prop.grips.map((grip) => gripPoint(prop, grip)),
      }
      : null,
  };
}
