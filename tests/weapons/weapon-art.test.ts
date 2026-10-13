import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_SKIN } from "../../src/chibi/chibi";
import { restPose } from "../../src/editor/animations";
import { ART_PARTS } from "../../src/editor/templates";
import { artPlacements, withWeaponArt } from "../../src/hexframe/art";
import { bodyTransforms, holdConstraints, place, runtimeRig } from "../../src/solve";
import type { Wielded } from "../../src/solve";
import { constraintGeometry } from "../../src/viewer/constraintGeometry";
import { readyHold, weaponNamed } from "../../src/weapons/weapons";

const rig = CHIBI_RIG;
/** Rig parts draw in the editor's skin, and each weapon in its own art set. */
const skin = CHIBI_SKIN.name;
const runtime = runtimeRig(rig);
const wielded = (name: string): Wielded => {
  const weapon = weaponNamed(name)!;
  return { weapon, bodies: readyHold(weapon).bodies };
};

/** The paint order of the chibi's art with a weapon, as the art layer draws it. */
function painted(name: string): string[] {
  const held = wielded(name);
  const pose = holdConstraints(rig, restPose(rig), { pins: [], prop: null, weapon: held }).pose;
  const placements = artPlacements(rig, runtime, place(rig, pose), ART_PARTS, null);
  return withWeaponArt(rig, runtime, placements, bodyTransforms(rig, pose, held), held.weapon, ART_PARTS, null).map((item) => `${item.part.set}:${item.bone}`);
}

describe("weapon art", () => {
  it("paints a two-handed weapon just under the near hand, over the torso and the far arm", () => {
    expect(painted("sword")).toEqual([
      "leg-front", "shin-front", "leg-back", "shin-back", "pelvis", "arm-front", "forearm-front", "torso", "arm-back",
    ].map((bone) => `${skin}:${bone}`).concat(["sword:sword", `${skin}:forearm-back`, `${skin}:head`]));
  });

  it("paints each dagger just under the hand that holds it", () => {
    const order = painted("daggers");
    expect(order.indexOf("daggers:dagger-front")).toBe(order.indexOf(`${skin}:forearm-front`) - 1);
    expect(order.indexOf("daggers:dagger-back")).toBe(order.indexOf(`${skin}:forearm-back`) - 1);
  });
});

describe("weapon markers", () => {
  it("give free bodies handles at their grips' midpoint and tip, and mark riding bodies", () => {
    const sword = wielded("sword");
    const pose = holdConstraints(rig, restPose(rig), { pins: [], prop: null, weapon: sword }).pose;
    const [marker] = constraintGeometry(rig, pose, { pins: [], prop: null, weapon: sword }).weapons;
    expect(marker!.free).toBe(true);
    expect(marker!.body).toBe("sword");
    const [upper, lower] = marker!.grips;
    expect(marker!.center.x).toBeCloseTo((upper!.x + lower!.x) / 2, 9);
    expect(marker!.center.y).toBeCloseTo((upper!.y + lower!.y) / 2, 9);
    expect(marker!.tip.y).toBeLessThan(marker!.butt.y);
    const daggers = constraintGeometry(rig, restPose(rig), { pins: [], prop: null, weapon: wielded("daggers") }).weapons;
    expect(daggers.map((item) => [item.body, item.free])).toEqual([["dagger-front", false], ["dagger-back", false]]);
    expect(constraintGeometry(rig, restPose(rig), { pins: [], prop: null }).weapons).toEqual([]);
  });
});
