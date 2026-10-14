// Per-key constraints: pinned chain ends, and where the key places its class weapon's free bodies.
import type { RigLabRig } from "./rig";
import { checkName, closedObject, isFiniteNumber, Issues } from "./validate";
import { freeBodies, weaponChains } from "./weapon";
import type { RigLabWeapon } from "./weapon";

/** A chain end held at a world point, such as a planted foot. */
export interface Pin {
  readonly chain: string;
  readonly x: number;
  readonly y: number;
}

/** Where a key places one of its weapon's free bodies: the body's origin in the world and its rotation in degrees. */
export interface BodyPlacement {
  readonly body: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/** A weapon's name and where each of its free bodies is, as a hold places them. */
export interface HeldWeapon {
  readonly name: string;
  readonly bodies: readonly BodyPlacement[];
}

function checkChain(issues: Issues, path: string, value: unknown, rig: RigLabRig, used: Set<string>): void {
  if (typeof value !== "string" || !rig.chains.some((chain) => chain.name === value)) {
    issues.add(path, "must name a chain of the rig");
    return;
  }
  if (used.has(value)) issues.add(path, `holds chain '${value}' twice`);
  used.add(value);
}

/** One placement for each of the weapon's free bodies, and none for a body that rides its hand. */
function validatePlacements(issues: Issues, at: string, value: unknown, weapon: RigLabWeapon): void {
  if (!Array.isArray(value)) {
    issues.add(at, "must be an array");
    return;
  }
  const free = freeBodies(weapon).map((body) => body.name);
  const placed = new Set<string>();
  value.forEach((placement: unknown, index) => {
    const path = `${at}[${index}]`;
    if (!closedObject(issues, path, placement, ["body", "x", "y", "rotation"])) return;
    const name = placement.body;
    if (typeof name === "string" && weapon.bodies.some((body) => body.name === name) && !free.includes(name)) {
      issues.add(`${path}.body`, `'${name}' rides its hand and takes no placement`);
    } else if (typeof name !== "string" || !free.includes(name)) issues.add(`${path}.body`, `must name a free body of weapon '${weapon.name}'`);
    else if (placed.has(name)) issues.add(`${path}.body`, `places '${name}' twice`);
    else placed.add(name);
    for (const field of ["x", "y", "rotation"] as const) {
      if (!isFiniteNumber(placement[field])) issues.add(`${path}.${field}`, "must be a finite number");
    }
  });
  for (const name of free) if (!placed.has(name)) issues.add(at, `must place free body '${name}'`);
}

/** A weapon held on its own, as a hold: its name and a placement for each free body. */
export function validateHeldWeaponAlone(issues: Issues, at: string, value: unknown, weapon: RigLabWeapon): void {
  if (!closedObject(issues, at, value, ["name", "bodies"]) || !checkName(issues, `${at}.name`, value.name)) return;
  if (value.name !== weapon.name) {
    issues.add(`${at}.name`, `must be '${weapon.name}'`);
    return;
  }
  validatePlacements(issues, `${at}.bodies`, value.bodies, weapon);
}

/**
 * Validate a key's optional `pins` and `bodies` for its class, whose weapon is `weapon` (null when unarmed). A key of a
 * weapon with free bodies places each of them; any other key places none. A chain the weapon grips cannot be pinned.
 */
export function validateKeyConstraints(
  issues: Issues,
  path: string,
  key: Readonly<Record<string, unknown>>,
  rig: RigLabRig,
  weapon: RigLabWeapon | null,
): void {
  const used = new Set<string>();
  const gripped = new Set(weapon ? weaponChains(weapon) : []);
  if (key.pins !== undefined) {
    if (!Array.isArray(key.pins)) issues.add(`${path}.pins`, "must be an array");
    else {
      key.pins.forEach((pin: unknown, index) => {
        const at = `${path}.pins[${index}]`;
        if (!closedObject(issues, at, pin, ["chain", "x", "y"])) return;
        if (typeof pin.chain === "string" && gripped.has(pin.chain)) issues.add(`${at}.chain`, `'${pin.chain}' grips the ${weapon!.name}, so it cannot be pinned`);
        else checkChain(issues, `${at}.chain`, pin.chain, rig, used);
        if (!isFiniteNumber(pin.x) || !isFiniteNumber(pin.y)) issues.add(at, "must have finite x and y");
      });
    }
  }
  if (weapon && freeBodies(weapon).length) validatePlacements(issues, `${path}.bodies`, key.bodies ?? [], weapon);
  else if (key.bodies !== undefined) {
    issues.add(`${path}.bodies`, weapon ? `must be left out: every body of the ${weapon.name} rides a hand` : "must be left out: an unarmed key places no bodies");
  }
}
