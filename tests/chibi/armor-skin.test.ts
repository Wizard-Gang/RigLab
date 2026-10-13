import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_PARTS } from "../../src/chibi/chibi";
import { CHIBI_ARMOR_PARTS } from "../../src/chibi/armor";

const CELL = /M(-?\d+) (-?\d+)h2v2h-2z/g;
const TOKEN = /^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/;

describe("optional pixel-art chibi armor", () => {
  it("maps exactly eleven separate skin parts to the unchanged chibi bones", () => {
    const slots = CHIBI_RIG.bones.map((bone) => bone.slot);
    expect(slots).toHaveLength(11);
    expect(Object.keys(CHIBI_ARMOR_PARTS).sort()).toEqual([...slots].sort());
    for (const bone of CHIBI_RIG.bones) {
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.set).toBe("chibi-armor");
      expect(CHIBI_PARTS[bone.slot]?.bone).toBe(bone.name);
    }
  });

  it("uses identical nonmerged 2×2 unit squares on one even-aligned grid for every path", () => {
    let totalCells = 0;
    for (const bone of CHIBI_RIG.bones) {
      const part = CHIBI_ARMOR_PARTS[bone.slot]!;
      expect(part.paths.length).toBeGreaterThan(0);
      for (const path of part.paths) {
        expect(path.className).toMatch(TOKEN);
        const cells = [...path.d.matchAll(CELL)];
        expect(cells.length).toBeGreaterThan(0);
        // No arbitrary segments, unequal-size blocks, off-grid coords, or hidden fragments.
        expect(cells.map(([whole]) => whole).join(" ")).toBe(path.d);
        for (const [, x, y] of cells) {
          expect(Number(x) % 2).toBe(0);
          expect(Number(y) % 2).toBe(0);
        }
        totalCells += cells.length;
      }
    }
    expect(totalCells).toBe(2500); // Current reference asset inventory.
  });

  it("does not add weapons, joints, or changes to the base chibi rig", () => {
    expect(CHIBI_RIG.bones).toHaveLength(11);
    expect(CHIBI_RIG.chains).toHaveLength(4);
    expect(Object.keys(CHIBI_ARMOR_PARTS)).toHaveLength(11);
    expect(Object.keys(CHIBI_ARMOR_PARTS).some((slot) => /weapon|spear|prop/i.test(slot))).toBe(false);
  });
});
