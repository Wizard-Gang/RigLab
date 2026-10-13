import { POSE_INTERVALS } from "./clip-types";
import type { BonePose, Clip, Pose } from "./clip-types";

const PROPERTIES = ["x", "y", "rotation"] as const satisfies readonly (keyof BonePose)[];

function ease(progress: number, easing: Clip["easing"]): number {
  if (easing !== "smoothstep") return progress;
  return progress * progress * (3 - 2 * progress);
}

function clipFrame(clip: Clip, frame: number): number {
  if (clip.duration <= 0) return 0;
  if (clip.loop) return ((frame % clip.duration) + clip.duration) % clip.duration;
  return Math.max(0, Math.min(frame, clip.duration));
}

export function sampleClip(clip: Clip, frame: number): Pose {
  const at = clipFrame(clip, frame);
  const position = clip.duration <= 0 ? 0 : (at / clip.duration) * POSE_INTERVALS;
  const lower = Math.max(0, Math.min(POSE_INTERVALS, Math.floor(position)));
  const upper = Math.min(POSE_INTERVALS, lower + 1);
  const progress = ease(Math.max(0, Math.min(1, position - lower)), clip.easing);

  const before = clip.poses[lower] ?? {};
  const after = clip.poses[upper] ?? before;
  const pose: Pose = {};

  for (const boneName of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const bone: BonePose = {};
    for (const property of PROPERTIES) {
      const from = before[boneName]?.[property];
      const to = after[boneName]?.[property];
      if (from === undefined && to === undefined) continue;
      const start = from ?? to!;
      const end = to ?? from!;
      bone[property] = start + (end - start) * progress;
    }
    pose[boneName] = bone;
  }
  return pose;
}
