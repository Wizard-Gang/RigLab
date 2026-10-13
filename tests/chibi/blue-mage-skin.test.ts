import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_PARTS } from "../../src/chibi/chibi";
import { CHIBI_ARMOR_PARTS } from "../../src/chibi/armor";
import { BLUE_MAGE_PARTS } from "../../src/chibi/blue-mage";
import { readFileSync } from "node:fs";

const palette = readFileSync(new URL("../../src/chibi/blue-mage.css", import.meta.url), "utf8");

const CELL = /M(-?\d+) (-?\d+)h2v2h-2z/g;
const TOKEN = /^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/;

describe("optional blue mage chibi pixel-art skin", () => {
  it("maps eleven parts to the native bones and art slots", () => {
    const slots = CHIBI_RIG.bones.map(b => b.slot);
    expect(slots).toHaveLength(11);
    expect(Object.keys(BLUE_MAGE_PARTS).sort()).toEqual([...slots].sort());
    for (const bone of CHIBI_RIG.bones) {
      expect(BLUE_MAGE_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(BLUE_MAGE_PARTS[bone.slot]?.set).toBe("blue-mage");
      expect(CHIBI_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.bone).toBe(bone.name);
    }
  });
  it("uses exactly 2x2 unmerged pixel cells with even coordinates", () => {
    let total = 0;
    for (const part of Object.values(BLUE_MAGE_PARTS)) {
      for (const path of part.paths) {
        expect(path.className).toMatch(TOKEN);
        const cells = [...path.d.matchAll(CELL)];
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.map(([whole]) => whole).join(" ")).toBe(path.d);
        for (const [,x,y] of cells) {
          expect(Number.isInteger(Number(x) / 2)).toBe(true);
          expect(Number.isInteger(Number(y) / 2)).toBe(true);
        }
        total += cells.length;
      }
    }
    expect(total).toBe(1904);
  });
  it("supplies isolated flat-fill CSS for every palette token", () => {
    const tokens = new Set<string>();
    for (const part of Object.values(BLUE_MAGE_PARTS))
      for (const path of part.paths)
        for (const token of path.className.split(" "))
          if (token !== "part") tokens.add(token);
    for (const token of tokens) expect(palette).toContain(`.art-set--blue-mage .${token}`);
    expect(palette).not.toContain(".art-set--chibi .");
    expect(palette).not.toContain("stroke-width");
  });
  it("does not add bones, props, weapons or replace the original armor", () => {
    expect(CHIBI_RIG.bones).toHaveLength(11);
    expect(CHIBI_RIG.chains).toHaveLength(4);
    expect(Object.keys(CHIBI_ARMOR_PARTS)).toHaveLength(11);
    expect(Object.keys(BLUE_MAGE_PARTS)).toHaveLength(11);
    expect(Object.keys(BLUE_MAGE_PARTS).some(slot => /weapon|spear|prop|crystal/i.test(slot))).toBe(false);
  });
});
