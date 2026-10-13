import { describe, expect, it } from "vitest";
import { POSE_COUNT, POSE_INTERVALS, forwardKinematics, hierarchyOrder } from "../../vendor/hexframe/src/rig";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { HEXFRAME_CLIPS, HEXFRAME_CLIP_NAMES, HEXFRAME_RIG } from "../../src/hexframe/fighter";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = HEXFRAME_RIG;
const close = (value: number, expected: number): void => expect(value).toBeCloseTo(expected, 9);

describe("vendored Hexframe rig", () => {
  it("resolves the 11-bone humanoid with pelvis as its single root", () => {
    expect(rig.root).toBe("pelvis");
    expect(rig.bones).toHaveLength(11);
    expect(hierarchyOrder(rig)[0]?.name).toBe("pelvis");
    expect(rig.byName.get("torso")?.children).toEqual(["arm-front", "arm-back", "head"]);
  });

  it("places the rest pose from parent-relative offsets", () => {
    const placed = forwardKinematics(rig, {});
    const at = (name: string): [number, number] => {
      const value = placed.get(name)!;
      return [value.x, value.y];
    };
    expect(at("pelvis")).toEqual([0, -42]);
    expect(at("torso")).toEqual([0, -48]);
    expect(at("arm-front")).toEqual([11, -70]);
    expect(at("forearm-front")).toEqual([11, -49]);
    expect(at("head")).toEqual([0, -79]);
    expect(at("leg-back")).toEqual([-6, -42]);
    expect(at("shin-back")).toEqual([-6, -20]);
  });

  it("composes parent rotation into child position and rotation", () => {
    const placed = forwardKinematics(rig, { "arm-front": { rotation: -90 }, "forearm-front": { rotation: 90 } });
    const elbow = placed.get("forearm-front")!;
    // A -90° (counter-clockwise) shoulder swings the 21-unit upper arm from straight down to pointing +x.
    close(elbow.x, 11 + 21);
    close(elbow.y, -70);
    close(elbow.rotation, 0);
  });
});

describe("vendored Hexframe clips", () => {
  it("ships all 13 clips in the fixed 13-pose format", () => {
    expect(HEXFRAME_CLIP_NAMES).toHaveLength(13);
    for (const name of HEXFRAME_CLIP_NAMES) {
      const clip = HEXFRAME_CLIPS[name]!;
      expect(clip.poses, name).toHaveLength(POSE_COUNT);
      expect(clip.duration, name).toBeGreaterThan(0);
    }
  });

  it("samples each authored pose at its evenly spaced frame", () => {
    const clip = HEXFRAME_CLIPS.labStrike!;
    expect(sampleClip(clip, 0)).toEqual(clip.poses[0]);
    const last = sampleClip(clip, clip.duration);
    for (const [bone, value] of Object.entries(clip.poses[POSE_INTERVALS]!)) {
      close(last[bone]!.rotation ?? 0, value.rotation ?? 0);
    }
  });

  it("only ever translates the root, so every limb keeps its rest length on every frame", () => {
    const rest = new Map(skeletonFor(rig, {}).segments.map((segment) => [`${segment.bone}:${segment.kind}`, segmentLength(segment)]));
    for (const name of HEXFRAME_CLIP_NAMES) {
      const clip = HEXFRAME_CLIPS[name]!;
      for (const pose of clip.poses) {
        for (const [bone, value] of Object.entries(pose)) {
          if (bone !== rig.root) expect(value.x ?? 0, `${name} ${bone}.x`).toBe(0);
          if (bone !== rig.root) expect(value.y ?? 0, `${name} ${bone}.y`).toBe(0);
        }
      }
      for (let frame = 0; frame <= clip.duration; frame += 1) {
        for (const segment of skeletonFor(rig, sampleClip(clip, frame)).segments) {
          close(segmentLength(segment), rest.get(`${segment.bone}:${segment.kind}`)!);
        }
      }
    }
  });
});

describe("skeleton geometry", () => {
  it("draws one parent segment per non-root bone and one tip segment per tipped bone", () => {
    const skeleton = skeletonFor(rig, {});
    expect(skeleton.joints).toHaveLength(11);
    expect(skeleton.segments.filter((segment) => segment.kind === "parent")).toHaveLength(10);
    expect(skeleton.segments.filter((segment) => segment.kind === "tip").map((segment) => segment.bone).sort())
      .toEqual(["forearm-back", "forearm-front", "head", "shin-back", "shin-front"]);
  });
});
