// riglab.hold version 1: where a weapon's free bodies first sit when the rig, standing at rest, takes it.
import type { HeldWeapon } from "./constraints";
import { validateHeldWeaponAlone } from "./constraints";
import { closedObject, Issues } from "./validate";
import type { Validation } from "./validate";
import type { RigLabWeapon } from "./weapon";

export const HOLD_FORMAT = "riglab.hold";
export const HOLD_VERSION = 1;
export const HOLD_FILE = "hold.json";

export interface RigLabHold extends HeldWeapon {
  readonly format: typeof HOLD_FORMAT;
  readonly version: typeof HOLD_VERSION;
}

/** A hold for `weapon`: its name, and one placement per free body, in rest-pose coordinates carried with the torso. */
export function validateHold(value: unknown, weapon: RigLabWeapon): Validation<HeldWeapon> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "name", "bodies"])) return issues.result(value);
  if (value.format !== HOLD_FORMAT) issues.add("$.format", `must be '${HOLD_FORMAT}'`);
  if (value.version !== HOLD_VERSION) issues.add("$.version", `must be ${HOLD_VERSION}`);
  const held = { name: value.name, bodies: value.bodies };
  validateHeldWeaponAlone(issues, "$", held, weapon);
  return issues.result(held);
}
