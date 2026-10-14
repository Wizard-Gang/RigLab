import { describe, expect, it } from "vitest";
import { restPose } from "../../src/editor/animations";
import type { RigLabRig } from "../../src/format/rig";
import { LIBRARY } from "../../src/library/active";
import { aimBone, dragJoint, moveRoot, nearest, place, setRotation, snapAngle, wrap } from "../../src/solve";

const rest = restPose(LIBRARY.rig);

describe("angle helpers", () => {
  it("wraps into (-180, 180] and keeps rotations continuous", () => {
    expect([wrap(190), wrap(-180), wrap(540), wrap(-190)]).toEqual([-170, 180, 180, 170]);
    expect(nearest(-170, 175)).toBe(190);
    expect(nearest(10, -350)).toBe(-350);
    expect(snapAngle(22, 15)).toBe(15);
    expect(snapAngle(22, 0)).toBe(22);
  });
});

describe("rotation-only posing", () => {
  it("swings a parent bone so the dragged joint points at the target", () => {
    const solved = dragJoint(LIBRARY.rig, rest, "forearm-front", { x: 40, y: -45 });
    const placed = place(LIBRARY.rig, solved.pose);
    const shoulder = placed.get("arm-front")!;
    const elbow = placed.get("forearm-front")!;
    expect([shoulder.x, shoulder.y]).toEqual([9, -45]);
    expect(solved.pose["arm-front"]!.rotation).toBeCloseTo(-90, 9);
    expect(Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x)).toBeCloseTo(0, 9);
    expect(Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y)).toBeCloseTo(10, 9);
  });

  it("translates only the root", () => {
    const solved = moveRoot(LIBRARY.rig, rest, { x: 3, y: -21 });
    expect(solved.pose.pelvis).toEqual({ x: 3, y: 4, rotation: 0 });
    expect(dragJoint(LIBRARY.rig, rest, "pelvis", { x: 3, y: -21 })).toEqual(solved);
    const placed = place(LIBRARY.rig, solved.pose);
    expect([placed.get("torso")!.x, placed.get("torso")!.y]).toEqual([3, -25]);
  });

  it("snaps rotations to the increment, then holds them inside the bone's limits", () => {
    expect(setRotation(LIBRARY.rig, rest, "head", 22, 15).pose.head!.rotation).toBe(15);
    const limited: RigLabRig = {
      ...LIBRARY.rig,
      bones: LIBRARY.rig.bones.map((bone) => (bone.name === "head" ? { ...bone, limits: { min: -20, max: 30 } } : bone)),
    };
    expect(setRotation(limited, rest, "head", 50)).toMatchObject({ status: "limited", message: "head is held at its maximum angle" });
    expect(setRotation(limited, rest, "head", -50).pose.head!.rotation).toBe(-20);
    const aimed = aimBone(limited, rest, "head", { x: 0, y: -16 }, { x: 100, y: -47 });
    expect(aimed).toMatchObject({ status: "limited" });
    expect(aimed.pose.head!.rotation).toBe(30);
  });

  it("chooses the equivalent rotation nearest the current one", () => {
    const turned = { ...rest, "arm-front": { rotation: 350 } };
    const solved = dragJoint(LIBRARY.rig, turned, "forearm-front", { x: 40, y: -45 });
    expect(solved.pose["arm-front"]!.rotation).toBeCloseTo(270, 9);
  });

  it("leaves the pose alone for a target on the joint itself", () => {
    expect(dragJoint(LIBRARY.rig, rest, "forearm-front", { x: 9, y: -45 }).pose).toBe(rest);
  });
});
