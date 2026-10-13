// Angle helpers in the rig's convention: y down, so atan2(y, x) grows clockwise, matching clockwise-positive rotation.
import type { AngleLimits } from "../format/rig";

export const DEG = 180 / Math.PI;

export interface Vector {
  readonly x: number;
  readonly y: number;
}

/** Direction of a vector in degrees, clockwise from +x. */
export function angleOf(vector: Vector): number {
  return Math.atan2(vector.y, vector.x) * DEG;
}

/** Wrap degrees into (-180, 180]. */
export function wrap(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** The angle equal to `degrees` modulo 360 that is nearest `near`, so keyed rotations never spin a full turn. */
export function nearest(degrees: number, near: number): number {
  return near + wrap(degrees - near);
}

export function clampToLimits(degrees: number, limits: AngleLimits | null): number {
  return limits ? Math.min(limits.max, Math.max(limits.min, degrees)) : degrees;
}

export function snapAngle(degrees: number, increment: number): number {
  return increment > 0 ? Math.round(degrees / increment) * increment : degrees;
}

/** Rotate a vector clockwise by `degrees`. */
export function rotate(vector: Vector, degrees: number): Vector {
  const radians = degrees / DEG;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

export const lengthOf = (vector: Vector): number => Math.hypot(vector.x, vector.y);
export const toVector = ([x, y]: readonly [number, number]): Vector => ({ x, y });

/** Six decimals, and never a negative zero, so stored rotations stay readable. */
export const tidy = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;
