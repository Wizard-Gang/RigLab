// The engine's 13 poses never put a bone a turn away from the pose before, so Hexframe's sampler, which interpolates the
// raw numbers, never spins it; keys still interpolate their raw numbers, so a swing of more than half a turn stays.
import { describe, expect, it } from "vitest";
import { fillClasses } from "../../src/editor/classes";
import { libraryModel, weaponRigs } from "../../src/editor/model";
import type { RigLabAnimation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { chainEnd, engineOf, gripTargets, playAt } from "../../src/solve";

const model = fillClasses(libraryModel(LIBRARY)).model;
const rig = model.rig;
const weapons = weaponRigs(model);
const jump = model.animations.find((animation) => animation.name === "sword-jump")!;
const armFront = jump.keys[0]!.pose["arm-front"]!.rotation!;

/** The sword jump with `arm-front` stored one turn lower on its airborne key: the same angle, as the owner's files had it. */
const turned: RigLabAnimation = {
  ...jump,
  keys: jump.keys.map((key, index) => (index === 2 ? { ...key, pose: { ...key.pose, "arm-front": { rotation: armFront - 360 } } } : key)),
};

describe("a held arm stored a whole turn apart on two keys", () => {
  it("keeps both hands on the sword's grips on every frame", () => {
    const engine = engineOf(rig, turned, weapons);
    for (let frame = 0; frame <= turned.length; frame += 1) {
      const played = playAt(engine, frame);
      for (const grip of gripTargets(played.constraints.weapon!)) {
        const hand = chainEnd(rig, played.pose, rig.chains.find((chain) => chain.name === grip.chain)!);
        expect(Math.hypot(hand.x - grip.target.x, hand.y - grip.target.y), `${grip.label} at frame ${frame}`).toBeLessThan(0.3);
      }
    }
  });

  it("never moves a bone more than half a turn between consecutive engine poses", () => {
    const { poses } = engineOf(rig, turned, weapons);
    for (let index = 1; index < poses.length; index += 1) {
      for (const bone of rig.bones) {
        const step = poses[index]!.pose[bone.name]!.rotation! - poses[index - 1]!.pose[bone.name]!.rotation!;
        expect(Math.abs(step), `${bone.name} into pose ${index}`).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("a free swing of more than half a turn between two keys", () => {
  it("plays the way it was keyed, as the owner's unarmed jump swings the front arm 190° forward and up", () => {
    const idle = model.animations.find((animation) => animation.name === "unarmed-jump")!;
    const swung: RigLabAnimation = {
      ...idle,
      keys: idle.keys.map((key, index) => ({ ...key, interpolation: "linear", pose: { ...key.pose, "arm-front": { rotation: index === 2 ? -150 : 40 } } })),
    };
    const engine = engineOf(rig, swung, weapons);
    const between = (swung.keys[1]!.frame + swung.keys[2]!.frame) / 2;
    expect(playAt(engine, between).pose["arm-front"]!.rotation).toBeCloseTo(-55, 6);
  });
});
