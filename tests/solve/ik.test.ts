import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { Chain, RigLabRig } from "../../src/format/rig";
import { restPose } from "../../src/editor/animations";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { angleOf, dragTip, place, REACH_TOLERANCE, solveChain, solveWithGridSnap, wrap } from "../../src/solve";
import { runtimeRig } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

/** Deterministic mulberry32 so the property runs are reproducible. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const lengths = (rig: RigLabRig, pose: Pose): Map<string, number> =>
  new Map(skeletonFor(runtimeRig(rig), pose).segments.map((segment) => [`${segment.bone}:${segment.kind}`, segmentLength(segment)]));

function endOf(rig: RigLabRig, pose: Pose, chain: Chain) {
  const lower = rig.bones.find((bone) => bone.name === chain.lower)!;
  const at = place(rig, pose).get(lower.name)!;
  const [x, y] = lower.tip!;
  return { x: at.x + x * Math.cos(at.rotation) - y * Math.sin(at.rotation), y: at.y + x * Math.sin(at.rotation) + y * Math.cos(at.rotation) };
}

/** Sign of the lower bone's bend away from straight. */
function bendOf(rig: RigLabRig, pose: Pose, chain: Chain): number {
  const lower = rig.bones.find((bone) => bone.name === chain.lower)!;
  const straight = angleOf({ x: lower.offset[0], y: lower.offset[1] }) - angleOf({ x: lower.tip![0], y: lower.tip![1] });
  return Math.sign(wrap(pose[chain.lower]!.rotation! - straight));
}

/** Every bone but the root turned up to 60° either way. */
function randomPose(next: () => number): Pose {
  return Object.fromEntries(Object.entries(restPose(CHIBI_RIG)).map(([bone, value]) => [
    bone,
    bone === CHIBI_RIG.root ? value : { rotation: (next() * 2 - 1) * 60 },
  ]));
}

const limited: RigLabRig = {
  ...CHIBI_RIG,
  bones: CHIBI_RIG.bones.map((bone) => {
    if (bone.name.startsWith("forearm")) return { ...bone, limits: { min: -145, max: -5 } };
    if (bone.name.startsWith("shin")) return { ...bone, limits: { min: 5, max: 150 } };
    if (bone.name.startsWith("arm")) return { ...bone, limits: { min: -170, max: 60 } };
    if (bone.name.startsWith("leg")) return { ...bone, limits: { min: -110, max: 45 } };
    return bone;
  }),
};

describe("two-bone IK", () => {
  it("reaches every reachable target without changing a length, on the chain's bend side", () => {
    const next = random(1205);
    const poses = random(13);
    const rest = lengths(CHIBI_RIG, restPose(CHIBI_RIG));
    let reached = 0;
    for (let run = 0; run < 400; run += 1) {
      const chain = CHIBI_RIG.chains[run % 4]!;
      const start = randomPose(poses);
      const origin = place(CHIBI_RIG, start).get(chain.upper)!;
      const angle = next() * Math.PI * 2;
      const distance = 2 + next() * 22;
      const target = { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
      const solved = solveChain(CHIBI_RIG, start, chain, target);
      for (const [segment, length] of lengths(CHIBI_RIG, solved.pose)) expect(Math.abs(length - rest.get(segment)!), segment).toBeLessThan(1e-9);
      if (solved.status === "ok") {
        reached += 1;
        const end = endOf(CHIBI_RIG, solved.pose, chain);
        expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeLessThanOrEqual(REACH_TOLERANCE);
        expect(bendOf(CHIBI_RIG, solved.pose, chain), `${chain.name} bend`).toBe(chain.bend);
      } else {
        expect(solved.status).toBe("unreachable");
        expect(solved.message).toMatch(/cannot reach/);
      }
    }
    expect(reached).toBeGreaterThan(300);
  });

  it("never exceeds angle limits and reports when they hold the chain", () => {
    const next = random(77);
    let held = 0;
    for (let run = 0; run < 400; run += 1) {
      const chain = limited.chains[run % 4]!;
      const start = restPose(limited);
      const origin = place(limited, start).get(chain.upper)!;
      const angle = next() * Math.PI * 2;
      const target = { x: origin.x + Math.cos(angle) * (2 + next() * 24), y: origin.y + Math.sin(angle) * (2 + next() * 24) };
      const solved = solveChain(limited, start, chain, target);
      for (const bone of [chain.upper, chain.lower]) {
        const { min, max } = limited.bones.find((candidate) => candidate.name === bone)!.limits!;
        const rotation = solved.pose[bone]!.rotation!;
        expect(rotation).toBeGreaterThanOrEqual(min - 1e-9);
        expect(rotation).toBeLessThanOrEqual(max + 1e-9);
      }
      if (solved.status === "limited") held += 1;
    }
    expect(held).toBeGreaterThan(0);
  });

  it("names the shortfall for targets beyond full extension or inside the folded reach", () => {
    const arm = CHIBI_RIG.chains.find((chain) => chain.name === "arm-front")!;
    const shoulder = place(CHIBI_RIG, restPose(CHIBI_RIG)).get("arm-front")!;
    const far = solveChain(CHIBI_RIG, restPose(CHIBI_RIG), arm, { x: shoulder.x + 30, y: shoulder.y });
    expect(far).toMatchObject({ status: "unreachable", message: "arm-front cannot reach: the target is 9.00 beyond full extension" });
    const end = endOf(CHIBI_RIG, far.pose, arm);
    expect(end.x - shoulder.x).toBeCloseTo(21, 9);
    const near = solveChain(CHIBI_RIG, restPose(CHIBI_RIG), arm, { x: shoulder.x + 0.25, y: shoulder.y });
    expect(near.message).toMatch(/0\.75 inside its folded reach/);
  });

  it("drags a non-chain tip by aiming its own bone", () => {
    const pose = restPose(CHIBI_RIG);
    const head = place(CHIBI_RIG, pose).get("head")!;
    const solved = dragTip(CHIBI_RIG, pose, "head", { x: head.x + 16, y: head.y }, 0);
    expect(solved.pose.head!.rotation).toBeCloseTo(90, 9);
    expect(solved.pose["forearm-front"]).toEqual(pose["forearm-front"]);
  });

  it("snaps the target to the grid when the limb can reach the grid point, and falls back otherwise", () => {
    const arm = CHIBI_RIG.chains.find((chain) => chain.name === "arm-front")!;
    const pose = restPose(CHIBI_RIG);
    const solve = (target: { x: number; y: number }) => solveChain(CHIBI_RIG, pose, arm, target);
    const snapped = solveWithGridSnap(solve, { x: 20.2, y: -39.1 }, 5, true);
    const end = endOf(CHIBI_RIG, snapped.pose, arm);
    expect([end.x, end.y].map((value) => Math.round(value * 1e6) / 1e6)).toEqual([20, -40]);
    // The shoulder is at (9, -45) and the arm reaches 21. (29, -49) is 20.40 away, but its grid point (30, -50) is 21.59 away.
    const exact = solveWithGridSnap(solve, { x: 29, y: -49 }, 5, true);
    expect(exact).toMatchObject({ status: "ok", message: "Off the grid: the nearest grid point is out of reach" });
    const beyond = solveWithGridSnap(solve, { x: 40, y: -45 }, 5, true);
    expect(beyond.status).toBe("unreachable");
    expect(solveWithGridSnap(solve, { x: 20.2, y: -39.1 }, 5, false).status).toBe("ok");
  });
});
