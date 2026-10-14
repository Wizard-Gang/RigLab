import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { restPose } from "../../src/editor/animations";
import { isFree, validateWeapon } from "../../src/format/weapon";
import type { RigLabWeapon, WeaponPoint } from "../../src/format/weapon";
import type { Part } from "../../src/hexframe/parts";
import { bodyPoint, bodyTransforms, chainEnd, holdConstraints, place, runtimeRig, withRotation } from "../../src/solve";
import type { Constraints } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = LIBRARY.rig;
const chain = (name: string) => rig.chains.find((candidate) => candidate.name === name)!;
const lengths = (pose: Pose) => skeletonFor(runtimeRig(rig), pose).segments.map(segmentLength);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const item = (name: string) => LIBRARY.weapons.find((candidate) => candidate.name === name)!;
const weapon = (name: string): RigLabWeapon => item(name).weapon;
/** Weapon art by slot; both daggers share one part. */
const weaponParts: Readonly<Record<string, Part>> = Object.assign({}, ...LIBRARY.weapons.map((candidate) => candidate.parts));
/** Both feet planted where they stand. */
const FEET = [{ chain: "leg-front", x: 5, y: 0 }, { chain: "leg-back", x: -5, y: 0 }];


/** A raised guard: both forearms up in front of the body, hands above the elbows. */
const GUARD = [["arm-front", -45], ["forearm-front", -135], ["arm-back", -20], ["forearm-back", -150]] as const;

const onAxis = (point: WeaponPoint, [butt, tip]: readonly [WeaponPoint, WeaponPoint]) =>
  Math.abs((tip[0] - butt[0]) * (point[1] - butt[1]) - (tip[1] - butt[1]) * (point[0] - butt[0])) < 1e-9;

describe("the chibi's weapons", () => {
  it("are the sword, spear, axe and daggers, valid for the chibi, with art for every body", () => {
    const weapons = LIBRARY.weapons.map((candidate) => candidate.weapon);
    expect(weapons.map((candidate) => candidate.name)).toEqual(["sword", "spear", "axe", "daggers"]);
    for (const candidate of weapons) {
      expect(validateWeapon(candidate, rig).ok).toBe(true);
      for (const body of candidate.bodies) expect(weaponParts[body.slot]?.set).toBe(candidate.name);
    }
    expect(Object.keys(weaponParts).sort()).toEqual(["weapon_axe", "weapon_dagger", "weapon_spear", "weapon_sword"]);
  });

  it("use only the weapons palette's classes", () => {
    const palette = new Set(["part", "part--steel", "part--steel-dark", "part--wood", "part--wood-dark", "part--grip", "part--accent", "part--gem", "detail"]);
    const used = Object.values(weaponParts).flatMap((part) => part.paths.flatMap((path) => path.className.split(" ")));
    expect(used.filter((name) => !palette.has(name))).toEqual([]);
  });

  it("hold two-handed weapons by two grips on one free body, spaced for two fists", () => {
    for (const name of ["sword", "spear", "axe"] as const) {
      const [body, ...rest] = weapon(name).bodies;
      expect(rest).toEqual([]);
      expect(isFree(body!)).toBe(true);
      expect(body!.grips.map((grip) => grip.chain)).toEqual(["arm-front", "arm-back"]);
      const [a, b] = body!.grips.map((grip) => grip.at);
      const spacing = Math.hypot(a![0] - b![0], a![1] - b![1]);
      expect(spacing).toBeGreaterThanOrEqual(7);
      expect(spacing).toBeLessThanOrEqual(16);
      for (const grip of body!.grips) expect(onAxis(grip.at, body!.axis)).toBe(true);
    }
  });

  it("point the sword's blade and the axe's head up, with their grips on the hilt and haft", () => {
    for (const name of ["sword", "axe"]) {
      const body = weapon(name).bodies[0]!;
      const [butt, tip] = body.axis;
      expect(tip[0]).toBe(butt[0]);
      expect(tip[1]).toBeLessThan(butt[1]);
      // Both hands sit on the butt's half of the body, below the blade or head.
      for (const grip of body.grips) expect(grip.at[1]).toBeGreaterThan((butt[1] + tip[1]) / 2);
    }
  });

  it("point the spear toward the facing direction, with the front hand ahead of the rear", () => {
    const body = weapon("spear").bodies[0]!;
    const [butt, tip] = body.axis;
    expect([tip[1], butt[1]]).toEqual([0, 0]);
    expect(tip[0]).toBeGreaterThan(butt[0]);
    const [front, rear] = body.grips;
    expect([front!.chain, rear!.chain]).toEqual(["arm-front", "arm-back"]);
    expect(front!.at[0]).toBeGreaterThan(rear!.at[0]);
  });

  it("give each hand one dagger in a reverse grip", () => {
    const daggers = weapon("daggers");
    expect(daggers.bodies.map((body) => [body.name, body.grips.length, body.grips[0]!.chain, body.grips[0]!.angle])).toEqual([
      ["dagger-front", 1, "arm-front", 180],
      ["dagger-back", 1, "arm-back", 180],
    ]);
  });
});

describe("a normal two-hand pose", () => {
  for (const name of ["sword", "spear", "axe"] as const) {
    it(`holds the ${name} at its hold in both hands with both feet planted, every length kept and no limit passed`, () => {
      const ready = item(name).hold;
      expect(ready.bodies.map((placement) => placement.body)).toEqual([name]);
      const placement = ready.bodies[0]!;
      const held: Constraints = { pins: FEET, weapon: { weapon: weapon(name), bodies: ready.bodies } };
      const rest = restPose(rig);
      const result = holdConstraints(rig, rest, held);
      expect(result.violations).toEqual([]);
      for (const grip of weapon(name).bodies[0]!.grips) {
        expect(distance(chainEnd(rig, result.pose, chain(grip.chain)), bodyPoint(placement, grip.at))).toBeLessThan(1e-6);
      }
      for (const pin of FEET) expect(distance(chainEnd(rig, result.pose, chain(pin.chain)), pin)).toBeLessThan(1e-6);
      expect(lengths(result.pose)).toEqual(lengths(rest).map((length) => expect.closeTo(length, 9)));
      for (const bone of rig.bones.filter((candidate) => candidate.limits)) {
        const rotation = result.pose[bone.name]!.rotation!;
        expect(rotation).toBeGreaterThanOrEqual(bone.limits!.min);
        expect(rotation).toBeLessThanOrEqual(bone.limits!.max);
      }
    });
  }

  it("carries both daggers with their blades down along the forearms in a raised guard", () => {
    const guard = GUARD.reduce<Pose>((pose, [bone, rotation]) => withRotation(pose, bone, rotation), restPose(rig));
    const daggers = weapon("daggers");
    expect(item("daggers").hold).toEqual({ name: "daggers", bodies: [] });
    const held: Constraints = { pins: FEET, weapon: { weapon: daggers, bodies: [] } };
    expect(holdConstraints(rig, guard, held).violations).toEqual([]);
    const placed = place(rig, guard);
    const transforms = bodyTransforms(rig, guard, held.weapon!);
    daggers.bodies.forEach((body, index) => {
      const transform = transforms[index]!;
      const grip = body.grips[0]!;
      const hand = chainEnd(rig, guard, chain(grip.chain));
      const elbow = placed.get(chain(grip.chain).lower)!;
      expect(hand.y).toBeLessThan(elbow.y);
      expect(distance(bodyPoint(transform, grip.at), hand)).toBeLessThan(1e-9);
      const [butt, tip] = body.axis.map((point) => bodyPoint(transform, point));
      const blade = Math.atan2(tip!.y - butt!.y, tip!.x - butt!.x);
      const forearm = Math.atan2(elbow.y - hand.y, elbow.x - hand.x);
      expect(tip!.y).toBeGreaterThan(butt!.y);
      expect(Math.abs((((blade - forearm) * 180) / Math.PI + 540) % 360 - 180)).toBeLessThan(15);
    });
  });
});
