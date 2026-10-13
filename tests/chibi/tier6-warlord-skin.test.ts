import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHIBI_RIG, CHIBI_PARTS } from "../../src/chibi/chibi";
import { CHIBI_ARMOR_PARTS } from "../../src/chibi/armor";
import { BLUE_MAGE_PARTS } from "../../src/chibi/blue-mage";
import { TIER6_WARLORD_PARTS } from "../../src/chibi/tier6-warlord";

const palette = readFileSync(new URL("../../src/chibi/tier6-warlord.css", import.meta.url), "utf8");
const CELL = /M(-?\d+) (-?\d+)h2v2h-2z/g;
const TOKEN = /^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/;

function positions(slot: string): Array<{ x: number; y: number }> {
  return TIER6_WARLORD_PARTS[slot]!.paths.flatMap(({ d }) =>
    [...d.matchAll(CELL)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
  );
}

describe("Tier 6 Warlord optional pixel armor skin", () => {
  it("maps exactly eleven independent parts to RigLab's unchanged chibi bones", () => {
    const slots = CHIBI_RIG.bones.map((bone) => bone.slot);
    expect(slots).toHaveLength(11);
    expect(Object.keys(TIER6_WARLORD_PARTS).sort()).toEqual([...slots].sort());
    for (const bone of CHIBI_RIG.bones) {
      expect(TIER6_WARLORD_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(TIER6_WARLORD_PARTS[bone.slot]?.set).toBe("tier6-warlord");
      expect(CHIBI_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(CHIBI_ARMOR_PARTS[bone.slot]?.bone).toBe(bone.name);
      expect(BLUE_MAGE_PARTS[bone.slot]?.bone).toBe(bone.name);
    }
  });

  it("uses only even-aligned, separate 2x2 SVG square cells", () => {
    let total = 0;
    for (const part of Object.values(TIER6_WARLORD_PARTS)) {
      for (const path of part.paths) {
        expect(path.className).toMatch(TOKEN);
        const cells = [...path.d.matchAll(CELL)];
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.map(([whole]) => whole).join(" ")).toBe(path.d);
        for (const [, x, y] of cells) {
          expect(Number.isInteger(Number(x) / 2)).toBe(true);
          expect(Number.isInteger(Number(y) / 2)).toBe(true);
        }
        total += cells.length;
      }
    }
    expect(total).toBe(2331);
  });

  it("keeps spiked pauldrons on the torso rather than rotating upper arms", () => {
    for (const slot of ["chibi_arm_upper_l", "chibi_arm_upper_r"]) {
      const cells = positions(slot);
      expect(cells.length).toBeGreaterThan(0);
      expect(Math.max(...cells.map(({ x }) => Math.abs(x)))).toBeLessThanOrEqual(10);
      expect(Math.min(...cells.map(({ y }) => y))).toBeGreaterThanOrEqual(-6);
      expect(Math.max(...cells.map(({ y }) => y))).toBeLessThanOrEqual(14);
    }
    const body = positions("chibi_torso");
    expect(Math.min(...body.map(({ x }) => x))).toBeLessThanOrEqual(-32);
    expect(Math.max(...body.map(({ x }) => x))).toBeGreaterThanOrEqual(32);
    expect(Math.min(...body.map(({ y }) => y))).toBeLessThanOrEqual(-34);
  });

  it("declares isolated flat-fill CSS for every class token", () => {
    const tokens = new Set<string>();
    for (const part of Object.values(TIER6_WARLORD_PARTS))
      for (const path of part.paths)
        for (const token of path.className.split(" "))
          if (token !== "part") tokens.add(token);
    for (const token of tokens) expect(palette).toContain(`.art-set--tier6-warlord .${token}`);
    expect(palette).not.toContain(".art-set--chibi .");
    expect(palette).not.toContain("stroke-width");
  });

  it("does not add bones, props, weapons or animations", () => {
    expect(CHIBI_RIG.bones).toHaveLength(11);
    expect(CHIBI_RIG.chains).toHaveLength(4);
    expect(Object.keys(TIER6_WARLORD_PARTS).some((slot) => /weapon|spear|prop/i.test(slot))).toBe(false);
  });
});
