// riglab.weapon version 1: a weapon's rigid bodies, and the fixed grips the rig's hands hold them by.
import { UNARMED } from "./classes";
import type { RigLabRig } from "./rig";
import { checkName, closedObject, isFiniteNumber, isPoint, Issues } from "./validate";
import type { Validation } from "./validate";

export const WEAPON_FORMAT = "riglab.weapon";
export const WEAPON_VERSION = 1;
export const WEAPON_EXTENSION = ".weapon.json";
/** One hand rides a body; two hands solve to it. */
export const MAX_BODY_GRIPS = 2;

export type WeaponPoint = readonly [number, number];

/** Where a hand holds a body: a fixed point in the body's own frame, held by the end of a chain of the rig. */
export interface WeaponGrip {
  readonly name: string;
  readonly chain: string;
  readonly at: WeaponPoint;
  /** One-grip bodies only: the body's rotation relative to the gripping chain's lower bone, in degrees. */
  readonly angle?: number;
}

/** One rigid body of a weapon, such as a sword or one of a pair of daggers. */
export interface WeaponBody {
  readonly name: string;
  /** The body's art slot. */
  readonly slot: string;
  /** Butt and tip in the body's own frame: the line drawn without art, and where the turn handle sits. */
  readonly axis: readonly [WeaponPoint, WeaponPoint];
  readonly grips: readonly WeaponGrip[];
}

export interface RigLabWeapon {
  readonly format: typeof WEAPON_FORMAT;
  readonly version: typeof WEAPON_VERSION;
  readonly name: string;
  readonly bodies: readonly WeaponBody[];
}

/** A free body has two grips, so a key places it and both hands solve to it; a one-grip body rides its hand. */
export const isFree = (body: WeaponBody): boolean => body.grips.length > 1;

/** The bodies a key must place. */
export const freeBodies = (weapon: RigLabWeapon): readonly WeaponBody[] => weapon.bodies.filter(isFree);

/** Every chain the weapon binds, in body and grip order. */
export const weaponChains = (weapon: RigLabWeapon): readonly string[] => weapon.bodies.flatMap((body) => body.grips.map((grip) => grip.chain));

const apart = (a: WeaponPoint, b: WeaponPoint): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6;

function validateGrips(issues: Issues, path: string, grips: unknown, chains: Set<string>, rig: RigLabRig | undefined): void {
  if (!Array.isArray(grips) || grips.length < 1 || grips.length > MAX_BODY_GRIPS) {
    issues.add(path, `must hold 1 to ${MAX_BODY_GRIPS} grips`);
    return;
  }
  const names = new Set<string>();
  grips.forEach((grip: unknown, index) => {
    const at = `${path}[${index}]`;
    if (!closedObject(issues, at, grip, ["name", "chain", "at"], ["angle"])) return;
    if (checkName(issues, `${at}.name`, grip.name)) {
      if (names.has(grip.name)) issues.add(`${at}.name`, `duplicates grip '${grip.name}'`);
      names.add(grip.name);
    }
    if (checkName(issues, `${at}.chain`, grip.chain)) {
      if (chains.has(grip.chain)) issues.add(`${at}.chain`, `binds chain '${grip.chain}' twice`);
      chains.add(grip.chain);
      if (rig && !rig.chains.some((chain) => chain.name === grip.chain)) issues.add(`${at}.chain`, `must name a chain of rig '${rig.name}'`);
    }
    if (!isPoint(grip.at)) issues.add(`${at}.at`, "must be [x, y] finite numbers");
    if (grips.length === 1 && !isFiniteNumber(grip.angle)) issues.add(`${at}.angle`, "must be a finite number: a one-grip body rides its hand at this angle");
    if (grips.length > 1 && grip.angle !== undefined) issues.add(`${at}.angle`, "is only for a one-grip body; two hands set a free body's rotation");
  });
  const points = grips.map((grip: unknown) => (grip as { at?: unknown }).at);
  if (points.length === 2 && isPoint(points[0]) && isPoint(points[1]) && !apart(points[0], points[1])) {
    issues.add(path, "must hold its two grips at different points");
  }
}

/** Validate a weapon rig; with a rig, every grip must also name one of its chains. */
export function validateWeapon(value: unknown, rig?: RigLabRig): Validation<RigLabWeapon> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "name", "bodies"])) return issues.result(value);
  if (value.format !== WEAPON_FORMAT) issues.add("$.format", `must be '${WEAPON_FORMAT}'`);
  if (value.version !== WEAPON_VERSION) issues.add("$.version", `must be ${WEAPON_VERSION}`);
  if (checkName(issues, "$.name", value.name) && value.name === UNARMED) issues.add("$.name", `must not be '${UNARMED}', the class that holds no weapon`);
  if (!Array.isArray(value.bodies) || value.bodies.length === 0) {
    issues.add("$.bodies", "must be a non-empty array");
    return issues.result(value);
  }
  const bodies = new Set<string>();
  const chains = new Set<string>();
  value.bodies.forEach((body: unknown, index) => {
    const path = `$.bodies[${index}]`;
    if (!closedObject(issues, path, body, ["name", "slot", "axis", "grips"])) return;
    if (checkName(issues, `${path}.name`, body.name)) {
      if (bodies.has(body.name)) issues.add(`${path}.name`, `duplicates body '${body.name}'`);
      bodies.add(body.name);
    }
    checkName(issues, `${path}.slot`, body.slot);
    const axis = body.axis;
    if (!Array.isArray(axis) || axis.length !== 2 || !isPoint(axis[0]) || !isPoint(axis[1]) || !apart(axis[0], axis[1])) {
      issues.add(`${path}.axis`, "must be [[x, y], [x, y]]: the butt and the tip, apart");
    }
    validateGrips(issues, `${path}.grips`, body.grips, chains, rig);
  });
  return issues.result(value);
}

export function serializeWeapon(weapon: RigLabWeapon): string {
  return `${JSON.stringify(weapon, null, 2)}\n`;
}

/** Parse and validate a weapon file; a failure names the first offending path. */
export function parseWeapon(text: string, rig?: RigLabRig): Validation<RigLabWeapon> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`$: is not valid JSON (${(error as Error).message})`] };
  }
  return validateWeapon(value, rig);
}
