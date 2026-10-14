import { describe, expect, it } from "vitest";
import { libraryModel, validateModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { LIBRARY } from "../../src/library/active";
import { heldAnimation, HOLDS, STAFF, TWIN } from "./weapon-fixtures";

type Mutable = Record<string, any>;

/** A library whose only weapons are the staff and the twin blades, with a staff idle and a twin walk. */
function armed(): LibraryModel {
  return {
    ...libraryModel(LIBRARY),
    weapons: [{ weapon: STAFF, hold: HOLDS.staff! }, { weapon: TWIN, hold: HOLDS.twin! }],
    animations: [heldAnimation(LIBRARY.rig, STAFF, HOLDS.staff!, "idle"), heldAnimation(LIBRARY.rig, TWIN, HOLDS.twin!, "walk")],
  };
}

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(armed()) as Mutable;
  change(value);
  const result = validateModel(value as LibraryModel);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

const KEY = "$.animations[0].keys[0]";

describe("keys of an armed class", () => {
  it("validate with the library's weapons", () => {
    const model = armed();
    const result = validateModel(model);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(model.animations.map((animation) => [animation.name, animation.class])).toEqual([["staff-idle", "staff"], ["twin-walk", "twin"]]);
  });

  it("need no weapon when every animation is unarmed", () => {
    const plain = libraryModel(LIBRARY);
    expect(validateModel({ ...plain, weapons: [] }).ok).toBe(true);
  });

  it("belong to a class the library has", () => {
    expect(errorsOf((value) => {
      value.weapons = [value.weapons[1]];
    })).toBe("$.animations[0].class: must be 'unarmed', 'twin'");
  });

  it("place exactly the class weapon's free bodies", () => {
    expect(errorsOf((value) => {
      value.animations[0].keys[0].bodies = [];
    })).toBe(`${KEY}.bodies: must place free body 'staff'`);
    expect(errorsOf((value) => {
      const placement = value.animations[0].keys[0].bodies[0];
      value.animations[0].keys[0].bodies = [placement, { ...placement }, { body: "hilt", x: 0, y: 0, rotation: "up" }];
    })).toBe([
      `${KEY}.bodies[1].body: places 'staff' twice`,
      `${KEY}.bodies[2].body: must name a free body of weapon 'staff'`,
      `${KEY}.bodies[2].rotation: must be a finite number`,
    ].join("\n"));
    expect(errorsOf((value) => {
      value.animations[1].keys[1].bodies = [{ body: "front", x: 0, y: 0, rotation: 0 }];
    })).toBe("$.animations[1].keys[1].bodies: must be left out: every body of the twin rides a hand");
  });

  it("refuse the legacy prop, and never pin a chain the class weapon grips", () => {
    expect(errorsOf((value) => {
      value.animations[0].keys[0].prop = { name: "prop", x: 0, y: 0, rotation: 0, grips: [{ chain: "leg-front", at: [0, 0] }] };
    })).toBe(`${KEY}: has unknown field 'prop'`);
    expect(errorsOf((value) => {
      value.animations[0].keys[0].pins = [{ chain: "arm-back", x: 0, y: 0 }];
    })).toBe(`${KEY}.pins[0].chain: 'arm-back' grips the staff, so it cannot be pinned`);
    expect(errorsOf((value) => {
      value.animations[0].keys[0].bodies[0].grip = "near";
    })).toBe(`${KEY}.bodies[0]: has unknown field 'grip'`);
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
