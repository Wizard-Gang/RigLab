import { describe, expect, it } from "vitest";
import { createRig, depthProfileName, visualPaintOrder } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation } from "../../src/editor/animations";
import type { RigLabRig } from "../../src/format";
import { clipNotes, toHexframeClip, toHexframeRig } from "../../src/hexframe/adapter";
import { paintOrder } from "../../src/hexframe/art";
import { parsePart } from "../../src/hexframe/parts";
import { engineOf, runtimeRig, setRotation } from "../../src/solve";
import { heldAnimation } from "../format/weapon-fixtures";

const rig = LIBRARY.rig;
const held = (name: string) => LIBRARY.weapons.find((item) => item.name === name)!;
const attack = (name: string) => heldAnimation(rig, held(name).weapon, held(name).hold, "attack");

describe("Hexframe adapter", () => {
  it("returns the chibi in the rig shape Hexframe's own createRig loads", () => {
    const adapted = toHexframeRig(rig);
    if (!adapted.ok) throw new Error(adapted.error);
    expect(Object.keys(adapted.value)).toEqual(["space", "root", "bones", "depthProfiles"]);
    expect(adapted.value.bones.map((bone) => [bone.name, bone.parent, bone.offset, bone.slot])).toEqual(rig.bones.map((bone) => [bone.name, bone.parent, bone.offset, bone.slot]));
    expect(createRig(adapted.value).bones).toHaveLength(11);
    expect(adapted.notes).toEqual(["Hexframe has no angle limits or IK chains: 0 limits and 4 chains are left out"]);
    const { depthProfiles: _dropped, ...plain } = rig;
    expect(toHexframeRig(plain)).toEqual({ ok: false, error: "Hexframe paints a rig by depth profile, and 'chibi' has none" });
  });

  it("maps each animation's clip key to its class's depth profile, so Hexframe paints it as RigLab does", () => {
    const animations = [blankAnimation(rig, "idle"), attack("sword"), attack("spear"), attack("daggers")];
    const adapted = toHexframeRig(rig, animations);
    if (!adapted.ok) throw new Error(adapted.error);
    expect(adapted.value.depthProfiles.byClip).toEqual({ sword: "both-front", spear: "both-front", axe: "both-front", "sword-attack": "both-front", "spear-attack": "both-front" });
    expect(adapted.notes.at(-1)).toBe("2 clips paint with their class's depth profile");
    const runtime = createRig(adapted.value);
    for (const animation of animations) {
      expect(visualPaintOrder(runtime, 1, depthProfileName(runtime, animation.name)), animation.name).toEqual(paintOrder(rig, runtimeRig(rig), animation.name, animation.class));
    }
    // A clip key the rig already maps keeps its own profile.
    const own: RigLabRig = { ...rig, depthProfiles: { ...rig.depthProfiles!, byClip: { ...rig.depthProfiles!.byClip, "sword-attack": "punch" } } };
    const kept = toHexframeRig(own, [attack("sword")]);
    expect(kept.ok && kept.value.depthProfiles.byClip["sword-attack"]).toBe("punch");
    expect(kept.ok && kept.notes).toEqual(["Hexframe has no angle limits or IK chains: 0 limits and 4 chains are left out"]);
  });

  it("writes the clip file Hexframe loads: the animation's 13 poses over its length in ticks, linear between poses", () => {
    const blank = blankAnimation(rig, "idle");
    const sway = { ...blank, keys: blank.keys.map((key, index) => ({ ...key, pose: setRotation(rig, key.pose, "torso", [0, 6, 0, -6][index]!).pose })) };
    const clip = toHexframeClip(rig, sway);
    expect([clip.key, clip.loop, clip.duration, clip.easing, clip.poses.length]).toEqual(["unarmed-idle", true, 60, "linear", 13]);
    expect(clip.note).toBe("Exported by RigLab from the idle animation unarmed-idle.");
    expect(clipNotes(sway)).toEqual([]);
    expect(clipNotes(attack("axe"))).toEqual(["Hexframe's clip has no weapon channel, so the axe transforms are left out; the baked frames carry them"]);
    expect(clip.poses).toEqual(engineOf(rig, sway).clip.poses);
    expect(clip.poses[3]!.torso).toEqual({ rotation: 6 });
    for (const pose of clip.poses) {
      expect(Object.keys(pose)).toEqual(rig.bones.map((bone) => bone.name));
      expect(Object.keys(pose.pelvis!)).toEqual(["x", "y", "rotation"]);
      expect(Object.keys(pose.head!)).toEqual(["rotation"]);
    }
  });
});

describe("art parts", () => {
  it("refuses anything beyond plain paths", () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"><path class="part" d="M0 0L1 1Z"/></svg>';
    expect(parsePart(ok, "test")).toMatchObject({ bone: "head", set: "test" });
    expect(parsePart(ok, "test").paths).toHaveLength(1);
    for (const bad of [
      ok.replace("<path", '<script>alert(1)</script><path'),
      ok.replace('class="part"', 'class="part" onclick="x()"'),
      ok.replace('d="M0 0L1 1Z"', 'd="url(#x)"'),
      ok.replace('data-bone="head"', 'data-bone="head" style="x"'),
      ok.replace("<path", "<image href='x.png'/><path"),
      '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"></svg>',
    ]) expect(() => parsePart(bad, "test"), bad).toThrow(/part/);
  });
});
