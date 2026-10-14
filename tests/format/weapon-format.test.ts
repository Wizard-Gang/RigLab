import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/library/active";
import { freeBodies, parseWeapon, serializeWeapon, validateWeapon, weaponChains } from "../../src/format/weapon";
import { STAFF, TWIN } from "./weapon-fixtures";

type Mutable = Record<string, any>;

function errorsOf(base: unknown, change: (value: Mutable) => void): string {
  const value = structuredClone(base) as Mutable;
  change(value);
  const result = validateWeapon(value, LIBRARY.rig);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("riglab.weapon", () => {
  it("accepts a free two-grip body and one-grip bodies that ride their hands", () => {
    for (const weapon of [STAFF, TWIN]) {
      const result = validateWeapon(weapon, LIBRARY.rig);
      expect(result.ok ? [] : result.errors).toEqual([]);
      expect(parseWeapon(serializeWeapon(weapon), LIBRARY.rig)).toEqual({ ok: true, value: weapon });
    }
    expect(freeBodies(STAFF).map((body) => body.name)).toEqual(["staff"]);
    expect(freeBodies(TWIN)).toEqual([]);
    expect(weaponChains(TWIN)).toEqual(["arm-front", "arm-back"]);
  });

  it("refuses unknown fields and a wrong header, each with its path", () => {
    expect(errorsOf(STAFF, (value) => {
      value.extra = 1;
      value.format = "riglab.prop";
      value.version = 2;
      value.bodies[0].weight = 3;
      value.bodies[0].grips[0].hand = "left";
    })).toBe([
      "$: has unknown field 'extra'",
      "$.format: must be 'riglab.weapon'",
      "$.version: must be 1",
      "$.bodies[0]: has unknown field 'weight'",
      "$.bodies[0].grips[0]: has unknown field 'hand'",
    ].join("\n"));
  });

  it("refuses duplicate bodies and grips, and a chain bound twice", () => {
    expect(errorsOf(TWIN, (value) => {
      value.bodies[1].name = "front";
      value.bodies[1].grips[0].chain = "arm-front";
    })).toBe(["$.bodies[1].name: duplicates body 'front'", "$.bodies[1].grips[0].chain: binds chain 'arm-front' twice"].join("\n"));
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips[1].name = "near";
    })).toBe("$.bodies[0].grips[1].name: duplicates grip 'near'");
  });

  it("refuses chains the rig lacks, and grip counts outside one or two", () => {
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips[0].chain = "tail";
    })).toBe("$.bodies[0].grips[0].chain: must name a chain of rig 'chibi'");
    expect(validateWeapon({ ...STAFF, bodies: [{ ...STAFF.bodies[0]!, grips: [{ name: "x", chain: "tail", at: [0, 0] }, STAFF.bodies[0]!.grips[1]!] }] }).ok).toBe(true);
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips.push({ name: "third", chain: "leg-front", at: [20, 0] });
    })).toBe("$.bodies[0].grips: must hold 1 to 2 grips");
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips = [];
    })).toBe("$.bodies[0].grips: must hold 1 to 2 grips");
    expect(errorsOf(STAFF, (value) => {
      value.bodies = [];
    })).toBe("$.bodies: must be a non-empty array");
  });

  it("requires an angle exactly on one-grip bodies", () => {
    expect(errorsOf(TWIN, (value) => {
      delete value.bodies[0].grips[0].angle;
    })).toBe("$.bodies[0].grips[0].angle: must be a finite number: a one-grip body rides its hand at this angle");
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips[1].angle = 90;
    })).toBe("$.bodies[0].grips[1].angle: is only for a one-grip body; two hands set a free body's rotation");
  });

  it("refuses non-finite points, a degenerate axis and two grips on one point", () => {
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips[0].at = [0, null];
      value.bodies[0].axis = [[1, 1], [1, 1]];
    })).toBe(["$.bodies[0].axis: must be [[x, y], [x, y]]: the butt and the tip, apart", "$.bodies[0].grips[0].at: must be [x, y] finite numbers"].join("\n"));
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].grips[1].at = [0, 0];
    })).toBe("$.bodies[0].grips: must hold its two grips at different points");
    expect(errorsOf(STAFF, (value) => {
      value.bodies[0].slot = "has space";
    })).toMatch(/^\$\.bodies\[0\]\.slot: must be a name/);
  });
});
