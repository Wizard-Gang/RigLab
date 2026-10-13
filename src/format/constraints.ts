// Per-key constraints: pinned chain ends, and either one rigid prop held by up to two chain ends or one weapon.
import type { RigLabRig } from "./rig";
import { checkName, closedObject, isFiniteNumber, isPoint, Issues } from "./validate";
import { freeBodies, weaponChains } from "./weapon";
import type { RigLabWeapon } from "./weapon";

/** A chain end held at a world point, such as a planted foot. */
export interface Pin {
  readonly chain: string;
  readonly x: number;
  readonly y: number;
}

/** A chain end held at a point in the prop's own frame. */
export interface Grip {
  readonly chain: string;
  readonly at: readonly [number, number];
}

/** A rigid prop, such as a two-handed weapon: a world position and rotation, and the chain ends that hold it. */
export interface Prop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly grips: readonly Grip[];
}

export const MAX_GRIPS = 2;

/** Where a key places one of its weapon's free bodies: the body's origin in the world and its rotation in degrees. */
export interface BodyPlacement {
  readonly body: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/** The weapon a key holds: one of the document's weapons, and where each of its free bodies is. */
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

function validateHeldWeapon(issues: Issues, at: string, value: unknown, weapons: readonly RigLabWeapon[], used: Set<string>): void {
  if (!closedObject(issues, at, value, ["name", "bodies"]) || !checkName(issues, `${at}.name`, value.name)) return;
  const weapon = weapons.find((candidate) => candidate.name === value.name);
  if (!weapon) {
    issues.add(`${at}.name`, "must name one of the document's weapons");
    return;
  }
  for (const chain of weaponChains(weapon)) {
    if (used.has(chain)) issues.add(`${at}.name`, `grips chain '${chain}', which the key already holds`);
    used.add(chain);
  }
  if (!Array.isArray(value.bodies)) {
    issues.add(`${at}.bodies`, "must be an array");
    return;
  }
  const free = freeBodies(weapon).map((body) => body.name);
  const placed = new Set<string>();
  value.bodies.forEach((placement: unknown, index) => {
    const path = `${at}.bodies[${index}]`;
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
  for (const name of free) if (!placed.has(name)) issues.add(`${at}.bodies`, `must place free body '${name}'`);
}

/**
 * Validate a key's optional `pins`, `prop` and `weapon`. A key holds a prop or a weapon, never both, and a chain
 * end is pinned, on the prop or on the weapon, never two of them.
 */
export function validateKeyConstraints(
  issues: Issues,
  path: string,
  key: Readonly<Record<string, unknown>>,
  rig: RigLabRig,
  weapons: readonly RigLabWeapon[] = [],
): void {
  const used = new Set<string>();
  if (key.pins !== undefined) {
    if (!Array.isArray(key.pins)) issues.add(`${path}.pins`, "must be an array");
    else {
      key.pins.forEach((pin: unknown, index) => {
        const at = `${path}.pins[${index}]`;
        if (!closedObject(issues, at, pin, ["chain", "x", "y"])) return;
        checkChain(issues, `${at}.chain`, pin.chain, rig, used);
        if (!isFiniteNumber(pin.x) || !isFiniteNumber(pin.y)) issues.add(at, "must have finite x and y");
      });
    }
  }
  if (key.prop !== undefined && key.weapon !== undefined) issues.add(path, "holds both a prop and a weapon; a key holds one or the other");
  if (key.weapon !== undefined) validateHeldWeapon(issues, `${path}.weapon`, key.weapon, weapons, used);
  if (key.prop === undefined) return;
  const at = `${path}.prop`;
  if (!closedObject(issues, at, key.prop, ["name", "x", "y", "rotation", "grips"])) return;
  const prop = key.prop;
  checkName(issues, `${at}.name`, prop.name);
  for (const field of ["x", "y", "rotation"] as const) {
    if (!isFiniteNumber(prop[field])) issues.add(`${at}.${field}`, "must be a finite number");
  }
  if (!Array.isArray(prop.grips) || prop.grips.length < 1 || prop.grips.length > MAX_GRIPS) {
    issues.add(`${at}.grips`, `must hold 1 to ${MAX_GRIPS} grips`);
    return;
  }
  prop.grips.forEach((grip: unknown, index) => {
    const gripAt = `${at}.grips[${index}]`;
    if (!closedObject(issues, gripAt, grip, ["chain", "at"])) return;
    checkChain(issues, `${gripAt}.chain`, grip.chain, rig, used);
    if (!isPoint(grip.at)) issues.add(`${gripAt}.at`, "must be [x, y] finite numbers");
  });
}
