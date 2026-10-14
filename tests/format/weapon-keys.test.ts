import { describe, expect, it } from "vitest";
import { blankAnimation } from "../../src/editor/animations";
import { libraryModel, validateModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { LIBRARY } from "../../src/library/active";
import { HOLDS, STAFF, TWIN } from "./weapon-fixtures";

type Mutable = Record<string, any>;

/** The chibi holding the staff on its idle's first key and the twin blades on its second. */
function armed(): LibraryModel {
  const idle = blankAnimation(LIBRARY.rig, "idle", "idle");
  const keys = idle.keys.map((key, index) => (
    index === 0 ? { ...key, weapon: { name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] } }
      : index === 1 ? { ...key, weapon: { name: "twin", bodies: [] } } : key
  ));
  return { ...libraryModel(LIBRARY), animations: [{ ...idle, keys }], weapons: [{ weapon: STAFF, hold: HOLDS.staff! }, { weapon: TWIN, hold: HOLDS.twin! }] };
}

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(armed()) as Mutable;
  change(value);
  const result = validateModel(value as LibraryModel);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

const KEY = "$.animations[0].keys[0]";

describe("keys that hold weapons", () => {
  it("validate with the library's weapons", () => {
    const result = validateModel(armed());
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("need no weapon when no key holds one", () => {
    const plain = libraryModel(LIBRARY);
    expect(validateModel({ ...plain, weapons: [] }).ok).toBe(true);
  });

  it("must name one of the library's weapons", () => {
    expect(errorsOf((value) => {
      value.weapons = [value.weapons[1]];
    })).toBe(`${KEY}.weapon.name: must name one of the library's weapons`);
  });

  it("place exactly the weapon's free bodies", () => {
    expect(errorsOf((value) => {
      value.animations[0].keys[0].weapon.bodies = [];
    })).toBe(`${KEY}.weapon.bodies: must place free body 'staff'`);
    expect(errorsOf((value) => {
      const placement = value.animations[0].keys[0].weapon.bodies[0];
      value.animations[0].keys[0].weapon.bodies = [placement, { ...placement }, { body: "hilt", x: 0, y: 0, rotation: "up" }];
    })).toBe([
      `${KEY}.weapon.bodies[1].body: places 'staff' twice`,
      `${KEY}.weapon.bodies[2].body: must name a free body of weapon 'staff'`,
      `${KEY}.weapon.bodies[2].rotation: must be a finite number`,
    ].join("\n"));
    expect(errorsOf((value) => {
      value.animations[0].keys[1].weapon.bodies = [{ body: "front", x: 0, y: 0, rotation: 0 }];
    })).toBe("$.animations[0].keys[1].weapon.bodies[0].body: 'front' rides its hand and takes no placement");
  });

  it("refuse the legacy prop beside a weapon, and never pin a chain the weapon grips", () => {
    expect(errorsOf((value) => {
      value.animations[0].keys[0].prop = { name: "prop", x: 0, y: 0, rotation: 0, grips: [{ chain: "leg-front", at: [0, 0] }] };
    })).toBe(`${KEY}: has unknown field 'prop'`);
    expect(errorsOf((value) => {
      value.animations[0].keys[0].pins = [{ chain: "arm-back", x: 0, y: 0 }];
    })).toBe(`${KEY}.weapon.name: grips chain 'arm-back', which the key already holds`);
    expect(errorsOf((value) => {
      value.animations[0].keys[0].weapon.grip = "near";
    })).toBe(`${KEY}.weapon: has unknown field 'grip'`);
  });

  it("refuse an invalid or duplicated library weapon at its own path", () => {
    expect(errorsOf((value) => {
      value.weapons[0].weapon.bodies[0].grips[0].chain = "tail";
    })).toBe("$.weapons[0].weapon.bodies[0].grips[0].chain: must name a chain of rig 'chibi'");
    expect(errorsOf((value) => {
      value.weapons = [value.weapons[0], value.weapons[0], value.weapons[1]];
    })).toBe("$.weapons[1].weapon.name: duplicates weapon 'staff'");
  });
});
