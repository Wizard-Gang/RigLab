import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { setKeyPose } from "../../src/editor/poseEdits";
import type { RigLabAnimation } from "../../src/format";
import type { RigLabRig } from "../../src/format/rig";
import {
  bodyPoint, bodyTransforms, chainEnd, constraintsAt, constraintsOf, engineOf, holdConstraints, place, playAt, runtimeRig,
  togglePin, withRotation,
} from "../../src/solve";
import type { Constraints, Wielded } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";
import { STAFF, TWIN } from "../format/weapon-fixtures";

const rig = LIBRARY.rig;
const rest = restPose(rig);
const weapons = [STAFF, TWIN];
const chain = (name: string) => rig.chains.find((candidate) => candidate.name === name)!;
const lengths = (on: RigLabRig, pose: Pose) => skeletonFor(runtimeRig(on), pose).segments.map(segmentLength);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const staffAt = (x: number, y: number, rotation = 0): Constraints => ({ pins: [], weapon: { weapon: STAFF, bodies: [{ body: "staff", x, y, rotation }] } });
const TWIN_HELD: Constraints = { pins: [], weapon: { weapon: TWIN, bodies: [] } };

/** Each staff grip's miss: how far its hand is from it. */
function misses(on: RigLabRig, pose: Pose, wielded: Wielded): number[] {
  const [placement] = wielded.bodies;
  return STAFF.bodies[0]!.grips.map((grip) => distance(chainEnd(on, pose, chain(grip.chain)), bodyPoint(placement!, grip.at)));
}

describe("a free weapon body", () => {
  it("puts both hands on its grips by rotation alone, keeping every length", () => {
    const held = holdConstraints(rig, rest, staffAt(-6, -30));
    expect(held.violations).toEqual([]);
    expect(Math.max(...misses(rig, held.pose, staffAt(-6, -30).weapon!))).toBeLessThan(1e-6);
    expect(lengths(rig, held.pose)).toEqual(lengths(rig, rest).map((length) => expect.closeTo(length, 9)));
    expect(held.pose.pelvis).toEqual(rest.pelvis);
    for (const bone of rig.bones.filter((candidate) => candidate.parent !== null)) expect(Object.keys(held.pose[bone.name]!)).toEqual(["rotation"]);
  });

  it("reports a grip out of reach and never stretches the arm", () => {
    const held = holdConstraints(rig, rest, staffAt(30, -30));
    expect(held.violations).toEqual([
      "staff grip 'near': arm-back cannot reach: the target is 20.79 beyond full extension",
      "staff grip 'far': arm-front cannot reach: the target is 15.25 beyond full extension",
    ]);
    expect(lengths(rig, held.pose)).toEqual(lengths(rig, rest).map((length) => expect.closeTo(length, 9)));
  });

  it("respects angle limits and reports the capped hold", () => {
    const limited: RigLabRig = { ...rig, bones: rig.bones.map((bone) => (bone.name === "forearm-front" ? { ...bone, limits: { min: -10, max: 10 } } : bone)) };
    const held = holdConstraints(limited, rest, staffAt(-6, -30));
    expect(held.violations).toEqual(["staff grip 'far': arm-front is held by its angle limits"]);
    const rotation = held.pose["forearm-front"]!.rotation!;
    expect(rotation).toBeGreaterThanOrEqual(-10);
    expect(rotation).toBeLessThanOrEqual(10);
    expect(lengths(limited, held.pose)).toEqual(lengths(limited, rest).map((length) => expect.closeTo(length, 9)));
  });
});

describe("bodies that ride a hand", () => {
  it("follow each hand at the grip's angle to the forearm", () => {
    const raised = withRotation(withRotation(rest, "arm-front", -150), "forearm-front", -40);
    for (const pose of [rest, raised]) {
      const placed = place(rig, pose);
      const transforms = bodyTransforms(rig, pose, TWIN_HELD.weapon!);
      expect(transforms.map((transform) => transform.body)).toEqual(["front", "back"]);
      TWIN.bodies.forEach((body, index) => {
        const grip = body.grips[0]!;
        const lower = chain(grip.chain).lower;
        expect(distance(bodyPoint(transforms[index]!, grip.at), chainEnd(rig, pose, chain(grip.chain)))).toBeLessThan(1e-9);
        expect(transforms[index]!.rotation).toBeCloseTo((placed.get(lower)!.rotation * 180) / Math.PI + 180, 9);
      });
    }
    expect(holdConstraints(rig, raised, TWIN_HELD)).toEqual({ pose: raised, violations: [] });
  });
});

describe("weapons between keys", () => {
  const keyed = (animation: RigLabAnimation, frame: number, constraints: Constraints): RigLabAnimation => {
    const result = setKeyPose(rig, animation, frame, rest, constraints, weapons);
    if (!result.ok) throw new Error(result.error);
    return result.animation;
  };
  const linear = (animation: RigLabAnimation): RigLabAnimation => ({ ...animation, keys: animation.keys.map((key) => ({ ...key, interpolation: "linear" })) });

  it("are stored on the key, move a free body with the pose's easing and hold when the next key lets go", () => {
    let animation = keyed(linear(blankAnimation(rig, "swing", "attack")), 0, staffAt(-6, -30));
    animation = keyed(animation, 8, staffAt(-2, -34, 20));
    expect(animation.keys[0]!.weapon).toEqual({ name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] });
    expect(constraintsOf(animation.keys[0]!, weapons)).toEqual(staffAt(-6, -30));
    expect(constraintsAt(animation, 4, weapons).weapon!.bodies).toEqual([{ body: "staff", x: -4, y: -32, rotation: 10 }]);
    expect(constraintsAt(animation, 12, weapons).weapon!.bodies).toEqual([{ body: "staff", x: -2, y: -34, rotation: 20 }]);
    expect(constraintsAt(animation, 20, weapons).weapon).toBeUndefined();
  });

  it("play on Hexframe's engine with both hands on the staff at every pose", () => {
    let animation = keyed(linear(blankAnimation(rig, "swing", "attack")), 0, staffAt(-6, -30));
    animation = keyed(animation, 8, staffAt(-2, -34, 20));
    animation = keyed(animation, 16, staffAt(-4, -28, -10));
    const engine = engineOf(rig, animation, weapons);
    for (let frame = 0; frame <= 16; frame += 2) {
      const played = playAt(engine, frame);
      expect(played.violations).toEqual([]);
      expect(Math.max(...misses(rig, played.pose, played.constraints.weapon!))).toBeLessThan(1e-5);
    }
    expect(engineOf(rig, animation).poses[0]!.constraints.weapon).toBeUndefined();
  });

  it("refuse a pin on a hand that holds the weapon, and keep the weapon when a foot is pinned", () => {
    expect(togglePin(rig, rest, staffAt(-6, -30), "arm-back")).toEqual({ ok: false, error: "arm-back holds the staff; let go of the weapon to pin it" });
    const foot = togglePin(rig, rest, staffAt(-6, -30), "leg-front");
    expect(foot.ok && foot.constraints).toEqual({ pins: [{ chain: "leg-front", x: 5, y: 0 }], weapon: staffAt(-6, -30).weapon });
  });
});
