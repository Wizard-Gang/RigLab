import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { setKeyPose } from "../../src/editor/poseEdits";
import { sampleAnimation, validateAnimation } from "../../src/format";
import type { RigLabAnimation } from "../../src/format";
import { HUMANOID_ANIMATIONS, HUMANOID_RIG } from "../../src/hexframe/humanoid";
import {
  chainEnd, constraintsAt, dragInPose, gripPoint, NO_CONSTRAINTS, runtimeRig, samplePose, toggleGrip, togglePin,
} from "../../src/solve";
import type { Constraints } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = HUMANOID_RIG;
const rest = restPose(rig);
const chain = (name: string) => rig.chains.find((candidate) => candidate.name === name)!;
const lengths = (pose: Pose) => skeletonFor(runtimeRig(rig), pose).segments.map(segmentLength);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function pinned(...chains: string[]): Constraints {
  return chains.reduce<Constraints>((constraints, name) => {
    const result = togglePin(rig, rest, constraints, name);
    if (!result.ok) throw new Error(result.error);
    return result.constraints;
  }, NO_CONSTRAINTS);
}

function gripped(): Constraints {
  const first = toggleGrip(rig, rest, NO_CONSTRAINTS, "arm-front");
  if (!first.ok) throw new Error(first.error);
  const second = toggleGrip(rig, rest, first.constraints, "arm-back");
  if (!second.ok) throw new Error(second.error);
  return second.constraints;
}

describe("planted feet", () => {
  it("keep both feet on their pins while the pelvis lunges down and forward", () => {
    const feet = pinned("leg-front", "leg-back");
    expect(feet.pins).toEqual([{ chain: "leg-front", x: 6, y: 1 }, { chain: "leg-back", x: -6, y: 1 }]);
    const lunge = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 4, y: -34 });
    expect(lunge).toMatchObject({ status: "ok", message: null });
    expect(lunge.pose.pelvis).toEqual({ x: 4, y: 8, rotation: 0 });
    for (const pin of feet.pins) expect(distance(chainEnd(rig, lunge.pose, chain(pin.chain)), pin)).toBeLessThan(1e-6);
    lengths(lunge.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
  });

  it("report a pin the legs cannot hold instead of stretching them", () => {
    const lift = dragInPose(rig, rest, pinned("leg-front"), { kind: "joint", bone: "pelvis" }, { x: 0, y: -60 });
    expect(lift.status).toBe("limited");
    // The hip rises to (6, -60); the pin is at (6, 1), 61 away, and the leg reaches 22 + 21 = 43.
    expect(lift.message).toBe("Pin: leg-front cannot reach: the target is 18.00 beyond full extension");
    lengths(lift.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
  });

  it("move a pin when its chain end is dragged, and release it on the second toggle", () => {
    const feet = pinned("leg-front");
    const moved = dragInPose(rig, rest, feet, { kind: "tip", bone: "shin-front" }, { x: 14, y: -2 });
    expect(moved.constraints.pins).toEqual([{ chain: "leg-front", x: 14, y: -2 }]);
    expect(distance(chainEnd(rig, moved.pose, chain("leg-front")), { x: 14, y: -2 })).toBeLessThan(1e-6);
    const released = togglePin(rig, rest, feet, "leg-front");
    expect(released.ok && released.constraints.pins).toEqual([]);
  });
});

describe("two-handed grip", () => {
  it("turns the second hand into a straight, rigid shaft", () => {
    const { prop } = gripped();
    expect(prop).toEqual({ name: "prop", x: 11, y: -26, rotation: 180, grips: [{ chain: "arm-front", at: [0, 0] }, { chain: "arm-back", at: [22, 0] }] });
    const third = toggleGrip(rig, rest, { ...gripped(), prop: { ...prop!, grips: [prop!.grips[0]!, { chain: "leg-front", at: [5, 0] }] } }, "arm-back");
    expect(third.ok ? "" : third.error).toBe("prop is already held by two hands");
  });

  it("carries both hands when the prop moves, turns, or one hand drags it", () => {
    const hands = gripped();
    for (const [handle, target] of [
      [{ kind: "prop-move" }, { x: 20, y: -50 }],
      [{ kind: "prop-turn" }, { x: 0, y: -60 }],
      [{ kind: "tip", bone: "forearm-front" }, { x: 16, y: -40 }],
    ] as const) {
      const moved = dragInPose(rig, rest, hands, handle, target);
      expect(moved.status, handle.kind).toBe("ok");
      for (const grip of moved.constraints.prop!.grips) {
        expect(distance(chainEnd(rig, moved.pose, chain(grip.chain)), gripPoint(moved.constraints.prop!, grip)), grip.chain).toBeLessThan(1e-6);
      }
    }
    const far = dragInPose(rig, rest, hands, { kind: "prop-move" }, { x: 60, y: -20 });
    expect(far.message).toMatch(/prop grip: arm-(front|back) cannot reach/);
  });

  it("takes a hand off the prop and drops the prop with its last hand", () => {
    const one = toggleGrip(rig, rest, gripped(), "arm-back");
    expect(one.ok && one.constraints.prop?.grips.map((grip) => grip.chain)).toEqual(["arm-front"]);
    const none = one.ok ? toggleGrip(rig, rest, one.constraints, "arm-front") : one;
    expect(none.ok && none.constraints.prop).toBeNull();
  });
});

describe("constraints on keys", () => {
  const base = HUMANOID_ANIMATIONS.labIdle!;
  const keyed = (constraints: Constraints, frame = 0, animation: RigLabAnimation = base): RigLabAnimation => {
    const result = setKeyPose(rig, animation, frame, sampleAnimation(animation, frame), constraints);
    if (!result.ok) throw new Error(result.error);
    return result.animation;
  };

  it("are stored with the key and validated as part of the animation", () => {
    const animation = keyed(pinned("leg-front"));
    expect(animation.keys[0]!.pins).toEqual([{ chain: "leg-front", x: 6, y: 1 }]);
    expect(validateAnimation({ ...animation, keys: [{ ...animation.keys[0]!, pins: [{ chain: "tail", x: 0, y: 0 }] }, ...animation.keys.slice(1)] }, rig).ok).toBe(false);
    const both = { ...animation.keys[0]!, prop: { ...gripped().prop!, grips: [{ chain: "leg-front", at: [0, 0] as const }] } };
    const result = validateAnimation({ ...animation, keys: [both, ...animation.keys.slice(1)] }, rig);
    expect(result.ok ? "" : result.errors.join("\n")).toMatch(/holds chain 'leg-front' twice/);
  });

  it("move between keys with the pose's easing, and hold when only the key in force has them", () => {
    const blank: RigLabAnimation = { ...blankAnimation(rig, "lunge"), keys: [{ frame: 0, interpolation: "linear", pose: rest }] };
    let animation = keyed({ pins: [{ chain: "leg-front", x: 6, y: 1 }], prop: null }, 0, blank);
    animation = keyed({ pins: [{ chain: "leg-front", x: 16, y: 1 }], prop: null }, 10, animation);
    expect(animation.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "linear"], [10, "linear"]]);
    expect(constraintsAt(animation, 5).pins).toEqual([{ chain: "leg-front", x: 11, y: 1 }]);
    expect(constraintsAt(animation, 12).pins).toEqual([{ chain: "leg-front", x: 16, y: 1 }]);
    const unpinned = keyed(NO_CONSTRAINTS, 10, animation);
    expect(constraintsAt(unpinned, 5).pins).toEqual([{ chain: "leg-front", x: 6, y: 1 }]);
    const inserted = setKeyPose(rig, animation, 5, sampleAnimation(animation, 5));
    expect(inserted.ok && inserted.animation.keys[1]?.pins).toEqual([{ chain: "leg-front", x: 11, y: 1 }]);
  });

  it("keep pinned feet planted on every frame between keys while the pelvis moves", () => {
    const feet = pinned("leg-front", "leg-back");
    const start: RigLabAnimation = { ...blankAnimation(rig, "lunge"), keys: [{ frame: 0, interpolation: "smoothstep", pose: rest, pins: feet.pins }] };
    const low = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 5, y: -30 });
    const result = setKeyPose(rig, start, 14, low.pose, low.constraints);
    if (!result.ok) throw new Error(result.error);
    for (let frame = 0; frame <= 14; frame += 1) {
      const sampled = samplePose(rig, result.animation, frame);
      expect(sampled.violations, `frame ${frame}`).toEqual([]);
      for (const pin of feet.pins) expect(distance(chainEnd(rig, sampled.pose, chain(pin.chain)), pin), `frame ${frame}`).toBeLessThan(1e-6);
      lengths(sampled.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
    }
    // Without the held pins, interpolated leg angles alone would let the feet slide between the keys.
    const raw = sampleAnimation(result.animation, 7);
    expect(distance(chainEnd(rig, raw, chain("leg-front")), feet.pins[0]!)).toBeGreaterThan(0.01);
  });

  it("leave unconstrained animations exactly as sampled", () => {
    for (const frame of [0, 7, 33]) {
      expect(samplePose(rig, base, frame)).toEqual({ pose: sampleAnimation(base, frame), violations: [] });
    }
  });
});
