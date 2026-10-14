import { describe, expect, it } from "vitest";
import { createRig } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation } from "../../src/editor/animations";
import { toHexframeClip, toHexframeRig } from "../../src/hexframe/adapter";
import { parsePart } from "../../src/hexframe/parts";
import { engineOf, setRotation } from "../../src/solve";

const rig = LIBRARY.rig;

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

  it("writes the clip file Hexframe loads: the animation's 13 poses over its length in ticks, linear between poses", () => {
    const blank = blankAnimation(rig, "sway", "idle");
    const sway = { ...blank, keys: blank.keys.map((key, index) => ({ ...key, pose: setRotation(rig, key.pose, "torso", [0, 6, 0, -6][index]!).pose })) };
    const clip = toHexframeClip(rig, sway);
    expect([clip.key, clip.loop, clip.duration, clip.easing, clip.poses.length]).toEqual(["sway", true, 60, "linear", 13]);
    expect(clip.note).toBe("Exported by RigLab from the idle animation sway.");
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
