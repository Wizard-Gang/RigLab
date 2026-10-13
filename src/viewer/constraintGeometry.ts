// Screen-ready geometry for a frame's pins and prop.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { chainEnd, gripPoint, propPoint, propReach } from "../solve";
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

export interface ConstraintGeometry {
  readonly pins: readonly PinMarker[];
  readonly prop: PropMarker | null;
}

export const NO_GEOMETRY: ConstraintGeometry = Object.freeze({ pins: [], prop: null });

export function constraintGeometry(rig: RigLabRig, pose: Pose, constraints: Constraints): ConstraintGeometry {
  const pins = constraints.pins.flatMap((pin) => {
    const chain = rig.chains.find((candidate) => candidate.name === pin.chain);
    return chain ? [{ chain: pin.chain, at: { x: pin.x, y: pin.y }, end: chainEnd(rig, pose, chain) }] : [];
  });
  const prop = constraints.prop;
  return {
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
