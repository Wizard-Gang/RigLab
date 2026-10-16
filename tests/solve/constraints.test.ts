import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { setKeyPose } from "../../src/editor/poseEdits";
import { sampleAnimation, validateAnimation } from "../../src/format";
import type { RigLabAnimation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { chainEnd, constraintsAt, dragInPose, NO_CONSTRAINTS, place, runtimeRig, samplePose, togglePin } from "../../src/solve";
import type { Constraints } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = LIBRARY.rig;
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

describe("planted feet", () => {
  it("keep both feet on their pins while the pelvis lunges down and forward", () => {
    const feet = pinned("leg-front", "leg-back");
    expect(feet.pins).toEqual([{ chain: "leg-front", x: 5, y: 0 }, { chain: "leg-back", x: -5, y: 0 }]);
    const lunge = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 4, y: -21 });
    expect(lunge).toMatchObject({ status: "ok", message: null });
    expect(lunge.pose.pelvis).toEqual({ x: 4, y: 4, rotation: 0 });
    for (const pin of feet.pins) expect(distance(chainEnd(rig, lunge.pose, chain(pin.chain)), pin)).toBeLessThan(1e-6);
    lengths(lunge.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
  });

  it("note a pin the legs cannot hold, by how far the foot is off it, instead of stretching them", () => {
    const lift = dragInPose(rig, rest, pinned("leg-front"), { kind: "joint", bone: "pelvis" }, { x: 0, y: -50 });
    expect(lift.status).toBe("limited");
    // The hip rises to (5, -50); the pin is at (5, 0), 50 away, and the leg reaches 12 + 13 = 25.
    expect(lift.message).toBe("leg-front is 25.00 off its pin");
    lengths(lift.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
  });

  it("straighten a dragged leg toward a foot target past its reach, with no note", () => {
    const hip = place(rig, rest).get("leg-front")!;
    // Straight down from the hip and 10 past the leg's full 12 + 13 = 25.
    const reach = dragInPose(rig, rest, NO_CONSTRAINTS, { kind: "tip", bone: "shin-front" }, { x: hip.x + 21, y: hip.y + 28 });
    expect(reach).toMatchObject({ status: "unreachable", message: null });
    const foot = chainEnd(rig, reach.pose, chain("leg-front"));
    expect(foot.x - hip.x).toBeCloseTo(15, 6);
    expect(foot.y - hip.y).toBeCloseTo(20, 6);
    lengths(reach.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
  });

  it("move a pin when its chain end is dragged, and release it on the second toggle", () => {
    const feet = pinned("leg-front");
    const moved = dragInPose(rig, rest, feet, { kind: "tip", bone: "shin-front" }, { x: 12, y: -3 });
    expect(moved.constraints.pins).toEqual([{ chain: "leg-front", x: 12, y: -3 }]);
    expect(distance(chainEnd(rig, moved.pose, chain("leg-front")), { x: 12, y: -3 })).toBeLessThan(1e-6);
    const released = togglePin(rig, rest, feet, "leg-front");
    expect(released.ok && released.constraints.pins).toEqual([]);
  });
});

describe("constraints on keys", () => {
  const keyed = (constraints: Constraints, frame: number, animation: RigLabAnimation): RigLabAnimation => {
    const result = setKeyPose(rig, animation, frame, sampleAnimation(animation, frame), constraints);
    if (!result.ok) throw new Error(result.error);
    return result.animation;
  };
  const linear = (animation: RigLabAnimation): RigLabAnimation => ({ ...animation, keys: animation.keys.map((key) => ({ ...key, interpolation: "linear" })) });

  it("are stored with the key and validated as part of the animation", () => {
    const animation = keyed(pinned("leg-front"), 0, blankAnimation(rig, "idle"));
    expect(animation.keys[0]!.pins).toEqual([{ chain: "leg-front", x: 5, y: 0 }]);
    expect(validateAnimation({ ...animation, keys: [{ ...animation.keys[0]!, pins: [{ chain: "tail", x: 0, y: 0 }] }, ...animation.keys.slice(1)] }, rig).ok).toBe(false);
    const twice = { ...animation.keys[0]!, pins: [...animation.keys[0]!.pins!, { chain: "leg-front", x: 6, y: 0 }] };
    const result = validateAnimation({ ...animation, keys: [twice, ...animation.keys.slice(1)] }, rig);
    expect(result.ok ? "" : result.errors.join("\n")).toBe("$.keys[0].pins[1].chain: holds chain 'leg-front' twice");
  });

  it("move between keys with the pose's easing, and hold when only the key in force has them", () => {
    let animation = keyed({ pins: [{ chain: "leg-front", x: 5, y: 0 }] }, 0, linear(blankAnimation(rig, "attack")));
    animation = keyed({ pins: [{ chain: "leg-front", x: 13, y: 0 }] }, 8, animation);
    expect(animation.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "linear"], [8, "linear"], [16, "linear"], [24, "linear"]]);
    expect(constraintsAt(animation, 4).pins).toEqual([{ chain: "leg-front", x: 9, y: 0 }]);
    expect(constraintsAt(animation, 8).pins).toEqual([{ chain: "leg-front", x: 13, y: 0 }]);
    expect(constraintsAt(animation, 12).pins).toEqual([{ chain: "leg-front", x: 13, y: 0 }]);
    const unpinned = keyed(NO_CONSTRAINTS, 8, animation);
    expect(constraintsAt(unpinned, 4).pins).toEqual([{ chain: "leg-front", x: 5, y: 0 }]);
    expect(setKeyPose(rig, animation, 5, sampleAnimation(animation, 5))).toEqual({ ok: false, error: "Frame 5 is between keys: unarmed-attack poses at frames 0, 8, 16 and 24" });
  });

  it("keep pinned feet planted on every frame between keys while the pelvis moves", () => {
    const feet = pinned("leg-front", "leg-back");
    const start = keyed(feet, 0, blankAnimation(rig, "attack"));
    const low = dragInPose(rig, rest, feet, { kind: "joint", bone: "pelvis" }, { x: 4, y: -21 });
    const result = setKeyPose(rig, start, 8, low.pose, low.constraints);
    if (!result.ok) throw new Error(result.error);
    for (let frame = 0; frame <= 8; frame += 1) {
      const sampled = samplePose(rig, result.animation, frame);
      expect(sampled.violations, `frame ${frame}`).toEqual([]);
      for (const pin of feet.pins) expect(distance(chainEnd(rig, sampled.pose, chain(pin.chain)), pin), `frame ${frame}`).toBeLessThan(1e-6);
      lengths(sampled.pose).forEach((length, index) => expect(length).toBeCloseTo(lengths(rest)[index]!, 9));
    }
    // Without the held pins, interpolated leg angles alone would let the feet slide between the keys.
    const raw = sampleAnimation(result.animation, 4);
    expect(distance(chainEnd(rig, raw, chain("leg-front")), feet.pins[0]!)).toBeGreaterThan(0.01);
  });

  it("leave unconstrained animations exactly as sampled", () => {
    const idle = blankAnimation(rig, "idle");
    const swaying = { ...idle, keys: idle.keys.map((key, index) => ({ ...key, pose: { ...key.pose, head: { rotation: [0, 8, 0, -8][index]! } } })) };
    for (const frame of [0, 7, 33, 59]) {
      expect(samplePose(rig, swaying, frame)).toEqual({ pose: sampleAnimation(swaying, frame), violations: [] });
    }
  });
});
