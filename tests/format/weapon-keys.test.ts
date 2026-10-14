import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { blankAnimation } from "../../src/editor/animations";
import { libraryDocument } from "../../src/editor/templates";
import { parseDocument, serializeDocument, validateDocument } from "../../src/format/document";
import type { RigLabDocument } from "../../src/format/document";
import { STAFF, TWIN } from "./weapon-fixtures";

type Mutable = Record<string, any>;

/** The chibi holding the staff on its idle's first key and the twin blades on its second. */
function armed(): RigLabDocument {
  const idle = blankAnimation(CHIBI_RIG, "idle", "idle");
  const keys = idle.keys.map((key, index) => (
    index === 0 ? { ...key, weapon: { name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] } }
      : index === 1 ? { ...key, weapon: { name: "twin", bodies: [] } } : key
  ));
  return { ...libraryDocument(), animations: [{ ...idle, keys }], weapons: [STAFF, TWIN] };
}

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(armed()) as Mutable;
  change(value);
  const result = validateDocument(value);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

const KEY = "$.animations[0].keys[0]";

describe("keys that hold weapons", () => {
  it("validate with the document's weapons and reopen deep-equal", () => {
    const document = armed();
    const result = validateDocument(document);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(parseDocument(serializeDocument(document))).toEqual({ ok: true, value: document });
  });

  it("leave documents without weapons as they were", () => {
    const plain = libraryDocument();
    expect("weapons" in plain).toBe(false);
    expect(validateDocument({ ...plain, weapons: [] }).ok).toBe(true);
  });

  it("must name one of the document's weapons", () => {
    expect(errorsOf((value) => {
      value.weapons = [TWIN];
    })).toBe(`${KEY}.weapon.name: must name one of the document's weapons`);
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

  it("refuse an invalid or duplicated document weapon at its own path", () => {
    expect(errorsOf((value) => {
      value.weapons[0].bodies[0].grips[0].chain = "tail";
    })).toBe("$.weapons[0].bodies[0].grips[0].chain: must name a chain of rig 'chibi'");
    expect(errorsOf((value) => {
      value.weapons = [STAFF, STAFF, TWIN];
    })).toBe("$.weapons[1].name: duplicates weapon 'staff'");
    expect(errorsOf((value) => {
      value.weapons = {};
    })).toBe("$.weapons: must be an array");
  });
});
