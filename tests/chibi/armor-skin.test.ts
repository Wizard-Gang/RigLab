import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_PARTS } from "../../src/chibi/chibi";
import { CHIBI_ARMOR_PARTS } from "../../src/chibi/armor";

describe("optional chibi armor skin", () => {
  it("covers the exact eleven original slots and skeleton bones", () => {
    const expectedSlots = CHIBI_RIG.bones.map((bone) => bone.slot);
    expect(expectedSlots).toHaveLength(11);
    expect(Object.keys(CHIBI_ARMOR_PARTS).sort()).toEqual([...expectedSlots].sort());
    for (const bone of CHIBI_RIG.bones) {
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.set).toBe("chibi-armor");
    }
  });

  it("preserves every native path and adds classed armor paths", () => {
    for (const bone of CHIBI_RIG.bones) {
      const original = CHIBI_PARTS[bone.slot]!;
      const armored = CHIBI_ARMOR_PARTS[bone.slot]!;
      expect(armored.paths.length).toBeGreaterThan(original.paths.length);
      expect(armored.paths.slice(0, original.paths.length)).toEqual(original.paths);
      expect(armored.paths.every((path) => /^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/.test(path.className))).toBe(true);
    }
  });

  it("adds no props, weapons, joints or new skeleton", () => {
    expect(CHIBI_RIG.chains).toHaveLength(4);
    expect(Object.keys(CHIBI_ARMOR_PARTS)).toHaveLength(11);
    expect(Object.keys(CHIBI_ARMOR_PARTS).some((slot) => /weapon|spear|prop/i.test(slot))).toBe(false);
  });
});
