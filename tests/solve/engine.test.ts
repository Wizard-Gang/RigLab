import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { setKeyPose } from "../../src/editor/poseEdits";
import { ANIMATION_KINDS, poseFrames } from "../../src/format";
import type { AnimationKind, Interpolation, RigLabAnimation } from "../../src/format";
import { toHexframeClip } from "../../src/hexframe/adapter";
import { chainEnd, constraintsAt, dragInPose, engineOf, NO_CONSTRAINTS, playAt, samplePose, togglePin } from "../../src/solve";

const rig = LIBRARY.rig;
const INTERPOLATIONS: readonly Interpolation[] = ["smoothstep", "linear", "hold"];

function difference(a: Pose, b: Pose): number {
  let largest = 0;
  for (const bone of rig.bones) {
    for (const channel of ["x", "y", "rotation"] as const) largest = Math.max(largest, Math.abs((a[bone.name]?.[channel] ?? 0) - (b[bone.name]?.[channel] ?? 0)));
  }
  return largest;
}

/** A kind's keys posed apart, with the root moving, cycling through every interpolation unless one is given. */
function posed(kind: AnimationKind, interpolation?: Interpolation): RigLabAnimation {
  const blank = blankAnimation(rig, kind, kind);
  return {
    ...blank,
    keys: blank.keys.map((key, index) => ({
      ...key,
      interpolation: interpolation ?? INTERPOLATIONS[index % INTERPOLATIONS.length]!,
      pose: Object.fromEntries(rig.bones.map((bone, at) => [
        bone.name,
        bone.name === rig.root ? { x: index, y: -2 * index, rotation: 3 * index } : { rotation: (((index + 1) * (at + 3) * 7) % 50) - 25 },
      ])),
    })),
  };
}

describe("engine playback", () => {
  it("plays every frame exactly as Hexframe's sampler plays the exported clip", () => {
    for (const kind of ANIMATION_KINDS) {
      const animation = posed(kind);
      const engine = engineOf(rig, animation);
      const clip = toHexframeClip(rig, animation);
      for (let frame = -animation.length; frame <= animation.length * 2; frame += 1) {
        expect(difference(playAt(engine, frame).pose, sampleClip(clip, frame)), `${kind}@${frame}`).toBeLessThan(1e-9);
      }
    }
  });

  it("keeps a smoothstep idle on Hexframe's 60 frames with no frame that differs, where 14 fps drifted", () => {
    const idle = posed("idle", "smoothstep");
    const clip = toHexframeClip(rig, idle);
    expect([clip.duration, clip.poses.length, clip.easing]).toEqual([60, 13, "linear"]);
    const engine = engineOf(rig, idle);
    const differing = Array.from({ length: 61 }, (_, frame) => frame).filter((frame) => difference(playAt(engine, frame).pose, sampleClip(clip, frame)) > 1e-9);
    expect(differing).toEqual([]);
  });

  it("is each key's own pose on its key frame, and the sampled keys on each of Hexframe's 13 poses", () => {
    for (const kind of ANIMATION_KINDS) {
      const animation = posed(kind);
      const engine = engineOf(rig, animation);
      for (const frame of poseFrames(animation.length)) expect(playAt(engine, frame).pose, `${kind}@${frame}`).toEqual(samplePose(rig, animation, frame).pose);
      for (const key of animation.keys) expect(playAt(engine, key.frame).pose, `${kind} key ${key.frame}`).toEqual(key.pose);
    }
  });

  it("moves linearly between Hexframe's poses, even across a smoothstep key", () => {
    const attack = posed("attack", "smoothstep");
    const engine = engineOf(rig, attack);
    const rotationAt = (frame: number) => playAt(engine, frame).pose.head!.rotation!;
    // Hexframe poses fall every 2 frames, so frame 1 is halfway between the poses at frames 0 and 2.
    expect(rotationAt(1)).toBeCloseTo((rotationAt(0) + rotationAt(2)) / 2, 12);
    expect(rotationAt(1)).not.toBeCloseTo(samplePose(rig, attack, 1).pose.head!.rotation!, 6);
  });

  it("holds pins on each of Hexframe's poses, and moves pins linearly between them", () => {
    const pinned = togglePin(rig, restPose(rig), NO_CONSTRAINTS, "leg-front");
    if (!pinned.ok) throw new Error(pinned.error);
    const blank = blankAnimation(rig, "step", "attack");
    const first = setKeyPose(rig, blank, 0, restPose(rig), pinned.constraints);
    if (!first.ok) throw new Error(first.error);
    const stepped = dragInPose(rig, restPose(rig), pinned.constraints, { kind: "tip", bone: "shin-front" }, { x: 12, y: -3 });
    const second = setKeyPose(rig, first.animation, 8, stepped.pose, stepped.constraints);
    if (!second.ok) throw new Error(second.error);
    const animation = second.animation;
    const engine = engineOf(rig, animation);
    const leg = rig.chains.find((chain) => chain.name === "leg-front")!;
    for (const frame of [0, 2, 4, 6, 8]) {
      const played = playAt(engine, frame);
      const pin = constraintsAt(animation, frame).pins[0]!;
      expect(played.violations, `frame ${frame}`).toEqual([]);
      expect(played.constraints.pins).toEqual([pin]);
      const foot = chainEnd(rig, played.pose, leg);
      expect(Math.hypot(foot.x - pin.x, foot.y - pin.y), `frame ${frame}`).toBeLessThan(1e-6);
    }
    const [before, after, between] = [0, 2, 1].map((frame) => playAt(engine, frame).constraints.pins[0]!);
    expect(between.x).toBeCloseTo((before!.x + after!.x) / 2, 12);
    expect(between.y).toBeCloseTo((before!.y + after!.y) / 2, 12);
  });

  it("wraps a loop back to its first pose at the length, and holds a one-shot's last pose after it", () => {
    const walk = engineOf(rig, posed("walk"));
    expect(playAt(walk, 48)).toBe(playAt(walk, 0));
    expect(playAt(walk, -12)).toBe(playAt(walk, 36));
    const hit = engineOf(rig, posed("hit"));
    expect(playAt(hit, 30)).toBe(playAt(hit, 24));
    expect(playAt(hit, -5)).toBe(playAt(hit, 0));
  });
});
