// The Hexframe consumer adapter: RigLab rigs and animations in the shapes Hexframe already loads.
import { createRig, POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { BonePose, Clip, Easing, Pose, RigContract } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { samplePose } from "../solve/constraints";
import { HEXFRAME_FPS } from "./fighter";

export type Adapted<T> =
  | { readonly ok: true; readonly value: T; readonly notes: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** A clip as Hexframe's fighter files store it: its 13-pose clip plus a key and a note. */
export interface HexframeClipFile extends Clip {
  readonly key: string;
  readonly note: string;
}

export interface AdaptedClip {
  readonly clip: HexframeClipFile;
  /** Hexframe frames (0..duration) where Hexframe's playback differs from RigLab's by more than 1e-6. */
  readonly approximated: readonly number[];
}

export const MATCH_TOLERANCE = 1e-6;

/** Hexframe's fighter.rig.json shape: no format header, limits or chains, and depth profiles required. */
export function toHexframeRig(rig: RigLabRig): Adapted<RigContract> {
  if (!rig.depthProfiles) return { ok: false, error: `Hexframe paints a rig by depth profile, and '${rig.name}' has none` };
  const contract: RigContract = {
    space: { ...rig.space, viewBox: [...rig.space.viewBox] },
    root: rig.root,
    bones: rig.bones.map((bone) => ({
      name: bone.name, parent: bone.parent, offset: [...bone.offset], tip: bone.tip && [...bone.tip], slot: bone.slot, artHeight: bone.artHeight, hand: bone.hand,
    })),
    depthProfiles: structuredClone(rig.depthProfiles),
  };
  try {
    createRig(contract);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const limited = rig.bones.filter((bone) => bone.limits).length;
  const notes = limited || rig.chains.length ? [`Hexframe has no angle limits or IK chains: ${limited} limits and ${rig.chains.length} chains are left out`] : [];
  return { ok: true, value: contract, notes };
}

function hexframePose(rig: RigLabRig, pose: Pose): Pose {
  return Object.fromEntries(rig.bones.map((bone) => {
    const value = pose[bone.name] ?? {};
    const channels: BonePose = bone.name === rig.root ? { x: value.x ?? 0, y: value.y ?? 0, rotation: value.rotation ?? 0 } : { rotation: value.rotation ?? 0 };
    return [bone.name, channels];
  }));
}

function largestDifference(rig: RigLabRig, a: Pose, b: Pose): number {
  let largest = 0;
  for (const bone of rig.bones) {
    for (const channel of ["x", "y", "rotation"] as const) {
      largest = Math.max(largest, Math.abs((a[bone.name]?.[channel] ?? 0) - (b[bone.name]?.[channel] ?? 0)));
    }
  }
  return largest;
}

/**
 * Resample an animation, constraints held, into Hexframe's 13 evenly spaced poses over its 60 Hz duration.
 * Hold transitions cannot be expressed exactly; every Hexframe frame that differs is reported.
 */
export function toHexframeClip(rig: RigLabRig, animation: RigLabAnimation): Adapted<AdaptedClip> {
  const exact = (animation.length * HEXFRAME_FPS) / animation.fps;
  const duration = Math.max(1, Math.round(exact));
  const notes: string[] = [];
  if (duration !== exact) {
    notes.push(`${animation.length} frames at ${animation.fps} fps is ${exact.toFixed(2)} Hexframe frames, rounded to ${duration}`);
  }
  const easing: Easing = animation.keys.every((key) => key.interpolation === "smoothstep") ? "smoothstep" : "linear";
  const poses = Array.from({ length: POSE_INTERVALS + 1 }, (_, index) =>
    hexframePose(rig, samplePose(rig, animation, (index / POSE_INTERVALS) * animation.length).pose));
  const clip: HexframeClipFile = {
    key: animation.name,
    loop: animation.loop,
    duration,
    easing,
    note: `Exported by RigLab from ${animation.name}.`,
    poses,
  };
  const approximated: number[] = [];
  for (let frame = 0; frame <= duration; frame += 1) {
    const theirs = sampleClip(clip, frame);
    const ours = samplePose(rig, animation, (frame / duration) * animation.length).pose;
    if (largestDifference(rig, theirs, ours) > MATCH_TOLERANCE) approximated.push(frame);
  }
  if (approximated.length) {
    notes.push(`Hexframe's 13 evenly spaced poses differ from RigLab's playback on ${approximated.length} of ${duration + 1} frames`);
  }
  return { ok: true, value: { clip, approximated }, notes };
}
