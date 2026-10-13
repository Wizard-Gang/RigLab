import { describe, expect, it } from "vitest";
import { createRig, forwardKinematics } from "../../vendor/hexframe/src/rig";
import type { Clip, Pose, RigContract } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { createRigLabRig, sampleAnimation, validateAnimation, validateRig } from "../../src/format";
import { HEXFRAME_CLIPS, HEXFRAME_CLIP_NAMES, HEXFRAME_FPS, HEXFRAME_RIG } from "../../src/hexframe/fighter";
import { HUMANOID_ANIMATIONS, HUMANOID_BENDS, HUMANOID_RIG } from "../../src/hexframe/humanoid";
import { importHexframeClip, importHexframeRig } from "../../src/hexframe/import";

const CHANNELS = ["x", "y", "rotation"] as const;

/** Compare two poses as FK sees them: an absent channel is zero. */
function expectSamePose(actual: Pose, expected: Pose, label: string): void {
  for (const bone of HUMANOID_RIG.bones) {
    for (const channel of CHANNELS) {
      const a = actual[bone.name]?.[channel] ?? 0;
      const e = expected[bone.name]?.[channel] ?? 0;
      expect(Math.abs(a - e), `${label} ${bone.name}.${channel}`).toBeLessThan(1e-9);
    }
  }
}

describe("Hexframe rig import", () => {
  it("produces a valid riglab.rig that Hexframe's own createRig accepts", () => {
    expect(validateRig(HUMANOID_RIG).ok).toBe(true);
    const rig = createRig(HUMANOID_RIG as unknown as RigContract);
    expect(rig.bones.map((bone) => bone.name)).toEqual(HEXFRAME_RIG.bones.map((bone) => bone.name));
  });

  it("keeps the rest pose: FK of the imported rig equals FK of the vendored rig", () => {
    const imported = forwardKinematics(createRigLabRig(HUMANOID_RIG), {});
    const vendored = forwardKinematics(HEXFRAME_RIG, {});
    expect([...imported.entries()]).toEqual([...vendored.entries()]);
  });

  it("finds the four limb chains and takes their bends from the caller", () => {
    expect(HUMANOID_RIG.chains).toEqual([
      { name: "leg-front", upper: "leg-front", lower: "shin-front", bend: 1 },
      { name: "leg-back", upper: "leg-back", lower: "shin-back", bend: 1 },
      { name: "arm-front", upper: "arm-front", lower: "forearm-front", bend: -1 },
      { name: "arm-back", upper: "arm-back", lower: "forearm-back", bend: -1 },
    ]);
    const { "leg-back": _omitted, ...missing } = HUMANOID_BENDS;
    expect(() => importHexframeRig(HEXFRAME_RIG.contract, "humanoid", missing)).toThrow(/no bend direction given for chain 'leg-back'/);
  });

  it("starts every bone without angle limits and carries the depth profiles", () => {
    expect(HUMANOID_RIG.bones.every((bone) => bone.limits === null)).toBe(true);
    expect(HUMANOID_RIG.depthProfiles).toEqual(HEXFRAME_RIG.contract.depthProfiles);
  });
});

describe("Hexframe clip import", () => {
  it("places all 13 poses on integer frames at the smallest exact rate", () => {
    const strike = HUMANOID_ANIMATIONS.labStrike!;
    // duration 20 at 60 Hz: poses every 5/3 frames, so 180 fps puts them every 5 frames.
    expect([strike.fps, strike.length]).toEqual([180, 60]);
    expect(strike.keys.map((key) => key.frame)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    const idle = HUMANOID_ANIMATIONS.labIdle!;
    expect([idle.fps, idle.length, idle.loop]).toEqual([60, 60, true]);
    for (const name of HEXFRAME_CLIP_NAMES) {
      const animation = HUMANOID_ANIMATIONS[name]!;
      expect(validateAnimation(animation, HUMANOID_RIG).ok, name).toBe(true);
      expect((animation.length * HEXFRAME_FPS) / animation.fps, name).toBe(HEXFRAME_CLIPS[name]!.duration);
    }
  });

  it("reproduces Hexframe's sampleClip on every Hexframe frame of every clip, including loop wraps", () => {
    for (const name of HEXFRAME_CLIP_NAMES) {
      const clip = HEXFRAME_CLIPS[name]!;
      const animation = HUMANOID_ANIMATIONS[name]!;
      const scale = animation.fps / HEXFRAME_FPS;
      for (let frame = -clip.duration; frame <= clip.duration * 2; frame += 1) {
        expectSamePose(sampleAnimation(animation, frame * scale), sampleClip(clip, frame), `${name}@${frame}`);
      }
    }
  });

  it("refuses clips it cannot import losslessly", () => {
    const strike = HEXFRAME_CLIPS.labStrike!;
    const gap: Clip = { ...strike, poses: strike.poses.map((pose, index) => (index === 3 ? { torso: pose.torso! } : pose)) };
    expect(() => importHexframeClip(gap, "gap", HUMANOID_RIG)).toThrow(/same channels in every pose/);
    const stretch: Clip = { ...strike, poses: strike.poses.map((pose) => ({ ...pose, "arm-front": { rotation: 0, x: 2 } })) };
    expect(() => importHexframeClip(stretch, "stretch", HUMANOID_RIG)).toThrow(/translates non-root bone 'arm-front'/);
    expect(() => importHexframeClip({ ...strike, poses: strike.poses.slice(1) }, "short", HUMANOID_RIG)).toThrow(/13 poses/);
    expect(() => importHexframeClip({ ...strike, duration: 0 }, "still", HUMANOID_RIG)).toThrow(/positive integer duration/);
    const stranger: Clip = { ...strike, poses: strike.poses.map((pose) => ({ ...pose, tail: { rotation: 1 } })) };
    expect(() => importHexframeClip(stranger, "tail", HUMANOID_RIG)).toThrow(/unknown bone 'tail'/);
  });
});
