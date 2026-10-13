import { describe, expect, it } from "vitest";
import { forwardKinematics, hierarchyOrder } from "../../vendor/hexframe/src/rig";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { blankAnimation } from "../../src/editor/animations";
import { ANIMATION_KINDS } from "../../src/format";
import { engineOf, playAt, runtimeRig } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = runtimeRig(CHIBI_RIG);
const close = (value: number, expected: number): void => expect(value).toBeCloseTo(expected, 9);

describe("the chibi on Hexframe's rig engine", () => {
  it("resolves through Hexframe's createRig with pelvis as its single root", () => {
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
    expect(at("pelvis")).toEqual([0, -25]);
    expect(at("torso")).toEqual([0, -29]);
    expect(at("arm-front")).toEqual([9, -45]);
    expect(at("forearm-front")).toEqual([9, -35]);
    expect(at("head")).toEqual([0, -47]);
    expect(at("leg-back")).toEqual([-5, -25]);
    expect(at("shin-back")).toEqual([-5, -13]);
  });

  it("composes parent rotation into child position and rotation", () => {
    const placed = forwardKinematics(rig, { "arm-front": { rotation: -90 }, "forearm-front": { rotation: 90 } });
    const elbow = placed.get("forearm-front")!;
    // A -90° (counter-clockwise) shoulder swings the 10-unit upper arm from straight down to pointing +x.
    close(elbow.x, 9 + 10);
    close(elbow.y, -45);
    close(elbow.rotation, 0);
  });

  it("keeps every limb at its rest length on every frame the engine plays, moving only the root", () => {
    const rest = new Map(skeletonFor(rig, {}).segments.map((segment) => [`${segment.bone}:${segment.kind}`, segmentLength(segment)]));
    for (const kind of ANIMATION_KINDS) {
      const blank = blankAnimation(CHIBI_RIG, kind, kind);
      const animation = {
        ...blank,
        keys: blank.keys.map((key, index) => ({
          ...key,
          pose: Object.fromEntries(CHIBI_RIG.bones.map((bone, at) => [
            bone.name,
            bone.name === CHIBI_RIG.root ? { x: 2 * index, y: -3 * index, rotation: 5 * index } : { rotation: ((index + 2) * (at + 1) * 13) % 90 - 45 },
          ])),
        })),
      };
      const engine = engineOf(CHIBI_RIG, animation);
      for (let frame = 0; frame <= animation.length; frame += 1) {
        const pose = playAt(engine, frame).pose;
        for (const [bone, value] of Object.entries(pose)) {
          if (bone !== CHIBI_RIG.root) expect([value.x, value.y], `${kind}@${frame} ${bone}`).toEqual([undefined, undefined]);
        }
        for (const segment of skeletonFor(rig, pose).segments) close(segmentLength(segment), rest.get(`${segment.bone}:${segment.kind}`)!);
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
