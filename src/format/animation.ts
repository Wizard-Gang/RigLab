// riglab.anim version 1: sparse, full-pose keys on an integer frame grid with per-transition interpolation.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "./rig";
import { checkInteger, checkName, closedObject, isFiniteNumber, isObject, Issues } from "./validate";
import type { Validation } from "./validate";

export const ANIMATION_FORMAT = "riglab.anim";
export const ANIMATION_VERSION = 1;
export const DEFAULT_FPS = 14;
/** 60 Hz × 12 intervals: the finest grid the lossless Hexframe clip importer needs. */
export const MAX_FPS = 720;
export const MAX_LENGTH = 100_000;

/** How a key moves to the next key: `hold` keeps its pose until the next key starts. */
export type Interpolation = "hold" | "linear" | "smoothstep";
export const INTERPOLATIONS: readonly Interpolation[] = ["hold", "linear", "smoothstep"];

export interface Key {
  readonly frame: number;
  readonly interpolation: Interpolation;
  /** A full Hexframe pose: a rotation for every bone, and `x`/`y` on the root only. */
  readonly pose: Pose;
}

export interface RigLabAnimation {
  readonly format: typeof ANIMATION_FORMAT;
  readonly version: typeof ANIMATION_VERSION;
  readonly name: string;
  readonly rig: string;
  readonly fps: number;
  readonly length: number;
  readonly loop: boolean;
  readonly keys: readonly Key[];
}

function validatePose(issues: Issues, path: string, value: unknown, rig: RigLabRig): void {
  if (!isObject(value)) {
    issues.add(path, "must be an object");
    return;
  }
  for (const name of Object.keys(value)) {
    if (!rig.bones.some((bone) => bone.name === name)) issues.add(path, `has unknown bone '${name}'`);
  }
  for (const bone of rig.bones) {
    const channels = bone.name === rig.root ? ["x", "y", "rotation"] : ["rotation"];
    const bonePath = `${path}.${bone.name}`;
    if (!Object.hasOwn(value, bone.name)) {
      issues.add(path, `is missing bone '${bone.name}'`);
      continue;
    }
    const channel = value[bone.name];
    if (!closedObject(issues, bonePath, channel, channels)) continue;
    for (const key of channels) {
      if (!isFiniteNumber(channel[key])) issues.add(`${bonePath}.${key}`, "must be a finite number");
    }
  }
}

export function validateAnimation(value: unknown, rig: RigLabRig): Validation<RigLabAnimation> {
  const issues = new Issues();
  const fields = ["format", "version", "name", "rig", "fps", "length", "loop", "keys"];
  if (!closedObject(issues, "$", value, fields)) return issues.result(value);
  if (value.format !== ANIMATION_FORMAT) issues.add("$.format", `must be '${ANIMATION_FORMAT}'`);
  if (value.version !== ANIMATION_VERSION) issues.add("$.version", `must be ${ANIMATION_VERSION}`);
  checkName(issues, "$.name", value.name);
  if (value.rig !== rig.name) issues.add("$.rig", `must name rig '${rig.name}'`);
  checkInteger(issues, "$.fps", value.fps, 1, MAX_FPS);
  const lengthOk = checkInteger(issues, "$.length", value.length, 1, MAX_LENGTH);
  if (typeof value.loop !== "boolean") issues.add("$.loop", "must be true or false");
  if (!Array.isArray(value.keys) || value.keys.length === 0) {
    issues.add("$.keys", "must be a non-empty array");
    return issues.result(value);
  }
  let previous = -1;
  value.keys.forEach((key: unknown, index) => {
    const path = `$.keys[${index}]`;
    if (!closedObject(issues, path, key, ["frame", "interpolation", "pose"])) return;
    if (checkInteger(issues, `${path}.frame`, key.frame, 0, MAX_LENGTH)) {
      if (index === 0 && key.frame !== 0) issues.add(`${path}.frame`, "must be 0 for the first key");
      if (key.frame <= previous) issues.add(`${path}.frame`, "must be greater than the previous key's frame");
      if (lengthOk && key.frame > (value.length as number)) issues.add(`${path}.frame`, "must not exceed the animation length");
      previous = key.frame;
    }
    if (!INTERPOLATIONS.includes(key.interpolation as Interpolation)) {
      issues.add(`${path}.interpolation`, "must be 'hold', 'linear' or 'smoothstep'");
    }
    validatePose(issues, `${path}.pose`, key.pose, rig);
  });
  return issues.result(value);
}
