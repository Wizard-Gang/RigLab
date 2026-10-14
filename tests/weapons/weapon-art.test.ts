import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_SKIN } from "../../src/chibi/chibi";
import { restPose } from "../../src/editor/animations";
import { ART_PARTS } from "../../src/editor/templates";
import type { RigLabRig } from "../../src/format";
import { artPlacements, paintOrder, withWeaponArt } from "../../src/hexframe/art";
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

/** The paint order of the chibi's art with a weapon in an animation, as the art layer draws it. */
function painted(name: string, animation: string | null, on: RigLabRig = rig): string[] {
  const held = wielded(name);
  const pose = holdConstraints(on, restPose(on), { pins: [], weapon: held }).pose;
  const placements = artPlacements(on, runtimeRig(on), place(on, pose), ART_PARTS, animation);
  return withWeaponArt(on, runtimeRig(on), placements, bodyTransforms(on, pose, held), held.weapon, ART_PARTS, animation)
    .map((item) => `${item.part.set}:${item.bone}`);
}
const art = (bones: readonly string[]): string[] => bones.map((bone) => `${skin}:${bone}`);
const LOWER_BODY = ["leg-front", "shin-front", "leg-back", "shin-back", "pelvis"];

describe("weapon art", () => {
  it("paints both arms over the torso and a two-handed weapon just under the near hand", () => {
    expect(rig.depthProfiles?.default).toBe("anatomical");
    for (const name of ["sword", "spear", "axe"]) {
      for (const animation of [null, "idle"]) {
        expect(painted(name, animation), `${name} in ${animation}`).toEqual([
          ...art([...LOWER_BODY, "torso", "arm-front", "forearm-front", "arm-back"]), `${name}:${name}`, ...art(["forearm-back", "head"]),
        ]);
      }
    }
  });

  it("keeps the far arm behind the torso unarmed and with the daggers, each dagger just under its hand", () => {
    const anatomical = [...LOWER_BODY, "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"];
    expect(paintOrder(rig, runtime, null, null)).toEqual(anatomical);
    expect(paintOrder(rig, runtime, "idle", null)).toEqual(anatomical);
    expect(painted("daggers", "idle")).toEqual([
      ...art([...LOWER_BODY, "arm-front"]), "daggers:dagger-front", ...art(["forearm-front", "torso", "arm-back"]),
      "daggers:dagger-back", ...art(["forearm-back", "head"]),
    ]);
  });

  it("lets an animation's own byClip entry win over its weapon's", () => {
    const punch: RigLabRig = { ...rig, depthProfiles: { ...rig.depthProfiles!, byClip: { ...rig.depthProfiles!.byClip, attack: "punch" } } };
    expect(painted("sword", "attack", punch)).toEqual([
      ...art([...LOWER_BODY, "torso", "head", "arm-front", "forearm-front", "arm-back"]), "sword:sword", `${skin}:forearm-back`,
    ]);
    expect(painted("sword", "idle", punch)).toEqual(painted("sword", "idle"));
  });
});

describe("weapon markers", () => {
  it("give free bodies handles at their grips' midpoint and tip, and mark riding bodies", () => {
    const sword = wielded("sword");
    const pose = holdConstraints(rig, restPose(rig), { pins: [], weapon: sword }).pose;
    const [marker] = constraintGeometry(rig, pose, { pins: [], weapon: sword }).weapons;
    expect(marker!.free).toBe(true);
    expect(marker!.body).toBe("sword");
    const [upper, lower] = marker!.grips;
    expect(marker!.center.x).toBeCloseTo((upper!.x + lower!.x) / 2, 9);
    expect(marker!.center.y).toBeCloseTo((upper!.y + lower!.y) / 2, 9);
    expect(marker!.tip.y).toBeLessThan(marker!.butt.y);
    const daggers = constraintGeometry(rig, restPose(rig), { pins: [], weapon: wielded("daggers") }).weapons;
    expect(daggers.map((item) => [item.body, item.free])).toEqual([["dagger-front", false], ["dagger-back", false]]);
    expect(constraintGeometry(rig, restPose(rig), { pins: [] }).weapons).toEqual([]);
  });
});
