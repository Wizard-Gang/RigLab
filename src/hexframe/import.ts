// Lossless importers from Hexframe's rig contract and 13-pose clips into the RigLab formats.
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { Clip, Pose, RigContract } from "../../vendor/hexframe/src/rig";
import { ANIMATION_FORMAT, ANIMATION_VERSION, validateAnimation } from "../format/animation";
import type { Interpolation, RigLabAnimation } from "../format/animation";
import { RIG_FORMAT, RIG_VERSION, validateRig } from "../format/rig";
import type { Chain, RigLabRig } from "../format/rig";
import type { Validation } from "../format/validate";
import { HEXFRAME_FPS } from "./fighter";

export type Bends = Readonly<Record<string, 1 | -1>>;

function valid<T>(result: Validation<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} is not valid:\n${result.errors.join("\n")}`);
  return result.value;
}

/**
 * Two-bone chains are found structurally: a tipped bone whose non-root parent has no other child.
 * Hexframe records no bend direction, so the caller names one for every chain it finds.
 */
export function importHexframeRig(contract: RigContract, name: string, bends: Bends): RigLabRig {
  const childCount = new Map<string, number>();
  for (const bone of contract.bones) {
    if (bone.parent !== null) childCount.set(bone.parent, (childCount.get(bone.parent) ?? 0) + 1);
  }
  const chains: Chain[] = contract.bones
    .filter((bone) => bone.tip !== null && bone.parent !== null && bone.parent !== contract.root && childCount.get(bone.parent) === 1)
    .map((lower) => {
      const upper = lower.parent!;
      const bend = bends[upper];
      if (bend === undefined) throw new Error(`no bend direction given for chain '${upper}'`);
      return { name: upper, upper, lower: lower.name, bend };
    });
  const rig = {
    format: RIG_FORMAT,
    version: RIG_VERSION,
    name,
    space: { ...contract.space, viewBox: [...contract.space.viewBox] },
    root: contract.root,
    bones: contract.bones.map((bone) => ({
      name: bone.name,
      parent: bone.parent,
      offset: [...bone.offset],
      tip: bone.tip === null ? null : [...bone.tip],
      slot: bone.slot,
      artHeight: bone.artHeight,
      hand: bone.hand,
      limits: null,
    })),
    chains,
    depthProfiles: structuredClone(contract.depthProfiles),
  };
  return valid(validateRig(rig), `imported rig '${name}'`);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** Every pose must carry the same channels: Hexframe holds a neighbour across a gap, which a full key cannot express. */
function channelSignature(pose: Pose): string {
  return Object.entries(pose).map(([bone, value]) => `${bone}:${Object.keys(value).sort().join("+")}`).sort().join(",");
}

function fullPose(pose: Pose, rig: RigLabRig, where: string): Pose {
  for (const name of Object.keys(pose)) {
    if (!rig.bones.some((bone) => bone.name === name)) throw new Error(`${where} names unknown bone '${name}'`);
  }
  return Object.fromEntries(rig.bones.map((bone) => {
    const value = pose[bone.name] ?? {};
    if (bone.name !== rig.root && ((value.x ?? 0) !== 0 || (value.y ?? 0) !== 0)) {
      throw new Error(`${where} translates non-root bone '${bone.name}'`);
    }
    const rotation = value.rotation ?? 0;
    return [bone.name, bone.name === rig.root ? { x: value.x ?? 0, y: value.y ?? 0, rotation } : { rotation }];
  }));
}

/**
 * Import a Hexframe clip at the smallest frame rate that puts all 13 poses on integer frames
 * (`60 × 12 / gcd(duration, 12)`), so sampling it reproduces Hexframe's sampler exactly.
 */
export function importHexframeClip(clip: Clip, name: string, rig: RigLabRig): RigLabAnimation {
  if (!Number.isInteger(clip.duration) || clip.duration < 1) throw new Error(`clip '${name}' needs a positive integer duration`);
  if (clip.poses.length !== POSE_INTERVALS + 1) throw new Error(`clip '${name}' must have ${POSE_INTERVALS + 1} poses`);
  const signatures = new Set(clip.poses.map(channelSignature));
  if (signatures.size !== 1) throw new Error(`clip '${name}' does not carry the same channels in every pose`);
  const divisor = greatestCommonDivisor(clip.duration, POSE_INTERVALS);
  const step = clip.duration / divisor;
  const interpolation: Interpolation = clip.easing === "smoothstep" ? "smoothstep" : "linear";
  const animation = {
    format: ANIMATION_FORMAT,
    version: ANIMATION_VERSION,
    name,
    rig: rig.name,
    fps: (HEXFRAME_FPS * POSE_INTERVALS) / divisor,
    length: step * POSE_INTERVALS,
    loop: clip.loop,
    keys: clip.poses.map((pose, index) => ({
      frame: index * step,
      interpolation,
      pose: fullPose(pose, rig, `clip '${name}' pose ${index}`),
    })),
  };
  return valid(validateAnimation(animation, rig), `imported clip '${name}'`);
}
