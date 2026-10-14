// Pose-mode pins: pinning a chain end where it is, and holding every pin and grip again after a change.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { tidy } from "./angles";
import type { Vector } from "./angles";
import { chainEnd, holdConstraints } from "./constraints";
import type { Constraints } from "./constraints";

export type HoldResult =
  | { readonly ok: true; readonly constraints: Constraints; readonly message: string }
  | { readonly ok: false; readonly error: string };

const tidyPoint = (point: Vector): Vector => ({ x: tidy(point.x), y: tidy(point.y) });

/** The weapon's name when it grips `chain`. */
function weaponGripping(constraints: Constraints, chain: string): string | null {
  const weapon = constraints.weapon?.weapon;
  return weapon?.bodies.some((body) => body.grips.some((grip) => grip.chain === chain)) ? weapon.name : null;
}

/** Pin a chain's end where it is now, or release its pin. A hand on a weapon cannot be pinned. */
export function togglePin(rig: RigLabRig, pose: Pose, constraints: Constraints, chainName: string): HoldResult {
  const chain = rig.chains.find((candidate) => candidate.name === chainName);
  if (!chain) return { ok: false, error: `The rig has no chain '${chainName}'` };
  if (constraints.pins.some((pin) => pin.chain === chainName)) {
    return { ok: true, constraints: { ...constraints, pins: constraints.pins.filter((pin) => pin.chain !== chainName) }, message: `Released ${chainName}` };
  }
  const wielding = weaponGripping(constraints, chainName);
  if (wielding) return { ok: false, error: `${chainName} holds the ${wielding}, so it cannot be pinned` };
  const end = tidyPoint(chainEnd(rig, pose, chain));
  return {
    ok: true,
    constraints: { ...constraints, pins: [...constraints.pins, { chain: chainName, ...end }] },
    message: `Pinned ${chainName} at ${end.x}, ${end.y}`,
  };
}

/** Re-hold the constraints after the body or a weapon body moved, folding violations into one message. */
export function hold(rig: RigLabRig, pose: Pose, constraints: Constraints, message: string | null) {
  const held = holdConstraints(rig, pose, constraints);
  const notes = [message, ...held.violations].filter((note): note is string => Boolean(note));
  return { pose: held.pose, constraints, message: notes.length ? notes.join("; ") : null };
}
