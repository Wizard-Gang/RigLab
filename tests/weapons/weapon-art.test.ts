import { describe, expect, it } from "vitest";
import { restPose } from "../../src/editor/animations";
import type { RigLabRig } from "../../src/format";
import { artPlacements, paintOrder, withWeaponArt } from "../../src/hexframe/art";
import { bodyTransforms, holdConstraints, place, runtimeRig } from "../../src/solve";
import type { Wielded } from "../../src/solve";
import { LIBRARY } from "../../src/library/active";
import { partsBySlot } from "../../src/library/parts";
import { constraintGeometry } from "../../src/viewer/constraintGeometry";

const rig = LIBRARY.rig;
/** Rig parts draw in the editor's skin, the library's first, and each weapon in its own art set. */
const skin = LIBRARY.skins[0]!.name;
const PARTS = partsBySlot(LIBRARY);
const runtime = runtimeRig(rig);
const wielded = (name: string): Wielded => {
  const { weapon, hold } = LIBRARY.weapons.find((item) => item.name === name)!;
  return { weapon, bodies: hold.bodies };
};

/** The paint order of the chibi's art in a weapon's class, in its animation of `kind` (or none), as the art layer draws it. */
function painted(name: string, kind: string | null, on: RigLabRig = rig): string[] {
  const held = wielded(name);
  const animation = kind === null ? null : `${name}-${kind}`;
  const pose = holdConstraints(on, restPose(on), { pins: [], weapon: held }).pose;
  const placements = artPlacements(on, runtimeRig(on), place(on, pose), PARTS, animation, name);
  return withWeaponArt(on, runtimeRig(on), placements, bodyTransforms(on, pose, held), held.weapon, PARTS, animation)
    .map((item) => `${item.part.set}:${item.bone}`);
}
const art = (bones: readonly string[]): string[] => bones.map((bone) => `${skin}:${bone}`);
const LOWER_BODY = ["leg-front", "shin-front", "leg-back", "shin-back", "pelvis"];

describe("weapon art", () => {
  it("paints both arms over the torso and a two-handed weapon just under the near hand", () => {
    expect(rig.depthProfiles?.default).toBe("anatomical");
    for (const name of ["sword", "spear", "axe"]) {
      for (const kind of [null, "idle", "attack"]) {
        expect(painted(name, kind), `${name} in ${kind}`).toEqual([
          ...art([...LOWER_BODY, "torso", "arm-front", "forearm-front", "arm-back"]), `${name}:${name}`, ...art(["forearm-back", "head"]),
        ]);
      }
    }
  });

  it("keeps the far arm behind the torso unarmed and with the daggers, each dagger just under its hand", () => {
    const anatomical = [...LOWER_BODY, "arm-front", "forearm-front", "torso", "arm-back", "forearm-back", "head"];
    expect(paintOrder(rig, runtime, null, null)).toEqual(anatomical);
    expect(paintOrder(rig, runtime, "unarmed-idle", "unarmed")).toEqual(anatomical);
    expect(paintOrder(rig, runtime, "daggers-idle", "daggers")).toEqual(anatomical);
    expect(painted("daggers", "idle")).toEqual([
      ...art([...LOWER_BODY, "arm-front"]), "daggers:dagger-front", ...art(["forearm-front", "torso", "arm-back"]),
      "daggers:dagger-back", ...art(["forearm-back", "head"]),
    ]);
  });

  it("lets an animation's own byClip entry win over its class's", () => {
    const punch: RigLabRig = { ...rig, depthProfiles: { ...rig.depthProfiles!, byClip: { ...rig.depthProfiles!.byClip, "sword-attack": "punch" } } };
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
