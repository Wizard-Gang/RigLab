// Per-key constraints: pinned chain ends, and one rigid prop held by up to two chain ends.
import type { RigLabRig } from "./rig";
import { checkName, closedObject, isFiniteNumber, isPoint, Issues } from "./validate";

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

function checkChain(issues: Issues, path: string, value: unknown, rig: RigLabRig, used: Set<string>): void {
  if (typeof value !== "string" || !rig.chains.some((chain) => chain.name === value)) {
    issues.add(path, "must name a chain of the rig");
    return;
  }
  if (used.has(value)) issues.add(path, `holds chain '${value}' twice`);
  used.add(value);
}

/** Validate a key's optional `pins` and `prop`; a chain end can be pinned or gripped, not both. */
export function validateKeyConstraints(issues: Issues, path: string, key: Readonly<Record<string, unknown>>, rig: RigLabRig): void {
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
