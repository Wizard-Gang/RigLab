// riglab.anim version 2: one kind's keys on Hexframe's engine grid, each a full pose with the interpolation to the next.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { validateKeyConstraints } from "./constraints";
import type { HeldWeapon, Pin } from "./constraints";
import type { RigLabRig } from "./rig";
import { ANIMATION_KINDS, ENGINE_FPS, frameList, isKind, keyFrames, KINDS } from "./timing";
import type { AnimationKind } from "./timing";
import { checkName, closedObject, isFiniteNumber, isObject, Issues } from "./validate";
import type { Validation } from "./validate";
import type { RigLabWeapon } from "./weapon";

export const ANIMATION_FORMAT = "riglab.anim";
export const ANIMATION_VERSION = 2;

/**
 * How a key's pose moves to the next key's across the Hexframe poses between them: `hold` keeps it until the
 * last of them, and Hexframe then moves to the next key over one pose interval.
 */
export type Interpolation = "hold" | "linear" | "smoothstep";
export const INTERPOLATIONS: readonly Interpolation[] = ["hold", "linear", "smoothstep"];

export interface Key {
  readonly frame: number;
  readonly interpolation: Interpolation;
  /** A full Hexframe pose: a rotation for every bone, and `x`/`y` on the root only. */
  readonly pose: Pose;
  /** Chain ends held at world points while this key is in force. */
  readonly pins?: readonly Pin[];
  /** A weapon of the document the key's hands hold. */
  readonly weapon?: HeldWeapon;
}

export interface RigLabAnimation {
  readonly format: typeof ANIMATION_FORMAT;
  readonly version: typeof ANIMATION_VERSION;
  readonly name: string;
  readonly rig: string;
  /** Fixes the length, looping and key frames; see `KINDS`. */
  readonly kind: AnimationKind;
  /** Always `ENGINE_FPS`, Hexframe's clock. */
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

/** Validate an animation for its rig; keys may hold only the given weapons, as the document carries them. */
export function validateAnimation(value: unknown, rig: RigLabRig, weapons: readonly RigLabWeapon[] = []): Validation<RigLabAnimation> {
  const issues = new Issues();
  const fields = ["format", "version", "name", "rig", "kind", "fps", "length", "loop", "keys"];
  if (!closedObject(issues, "$", value, fields)) return issues.result(value);
  if (value.format !== ANIMATION_FORMAT) issues.add("$.format", `must be '${ANIMATION_FORMAT}'`);
  if (value.version !== ANIMATION_VERSION) issues.add("$.version", `must be ${ANIMATION_VERSION}`);
  checkName(issues, "$.name", value.name);
  if (value.rig !== rig.name) issues.add("$.rig", `must name rig '${rig.name}'`);
  if (value.fps !== ENGINE_FPS) issues.add("$.fps", `must be ${ENGINE_FPS}, Hexframe's clock`);
  const kind = isKind(value.kind) ? value.kind : null;
  if (!kind) issues.add("$.kind", `must be ${ANIMATION_KINDS.map((name) => `'${name}'`).join(", ")}`);
  const frames = kind ? keyFrames(kind) : null;
  if (kind) {
    const timing = KINDS[kind];
    if (value.length !== timing.length) issues.add("$.length", `must be ${timing.length}: ${kind} animations last ${timing.length} frames`);
    if (value.loop !== timing.loop) issues.add("$.loop", `must be ${timing.loop}: ${kind} animations ${timing.loop ? "loop" : "play once"}`);
  }
  if (!Array.isArray(value.keys) || value.keys.length === 0) {
    issues.add("$.keys", "must be a non-empty array");
    return issues.result(value);
  }
  const anchored = frames !== null && value.keys.length === frames.length;
  if (frames && !anchored) issues.add("$.keys", `must hold ${frames.length} keys: ${kind} keys sit at frames ${frameList(frames)}`);
  value.keys.forEach((key: unknown, index) => {
    const path = `$.keys[${index}]`;
    if (!closedObject(issues, path, key, ["frame", "interpolation", "pose"], ["pins", "weapon"])) return;
    if (anchored && key.frame !== frames[index]) issues.add(`${path}.frame`, `must be ${frames[index]}: ${kind} keys sit at frames ${frameList(frames)}`);
    if (!INTERPOLATIONS.includes(key.interpolation as Interpolation)) {
      issues.add(`${path}.interpolation`, "must be 'hold', 'linear' or 'smoothstep'");
    }
    validatePose(issues, `${path}.pose`, key.pose, rig);
    validateKeyConstraints(issues, path, key, rig, weapons);
  });
  return issues.result(value);
}
