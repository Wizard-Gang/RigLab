import { describe, expect, it } from "vitest";
import { fillClasses } from "../../src/editor/classes";
import { libraryModel } from "../../src/editor/model";
import { LIBRARY } from "../../src/library/active";
import { heldWeapon, initialWardrobe, shownClass, shownKind, shownMotion, wardrobeReducer, wornParts } from "../../src/wardrobe/state";
import type { WardrobeAction, WardrobeState } from "../../src/wardrobe/state";

const run = (state: WardrobeState, ...actions: WardrobeAction[]): WardrobeState => actions.reduce((current, action) => wardrobeReducer(LIBRARY, current, action), state);
const start = initialWardrobe(LIBRARY);
const slots = LIBRARY.rig.bones.map((bone) => bone.slot);
const setsOf = (state: WardrobeState) => slots.map((slot) => wornParts(LIBRARY, state)[slot]!.set);
const skins = LIBRARY.skins.map((skin) => skin.name);
const steps = (type: "class" | "motion", count: number): WardrobeAction[] => Array.from({ length: count }, () => ({ type, step: 1 }));
/** The placeholder library with every class's five kinds, as the editor starts them. */
const full = { ...LIBRARY, animations: fillClasses(libraryModel(LIBRARY)).model.animations };

describe("the wardrobe", () => {
  it("starts in the first skin on every slot, at rest, holding nothing", () => {
    expect(start).toEqual({ skin: 0, outfit: slots.map(() => 0), slot: 0, class: 0, motion: 0 });
    expect(setsOf(start)).toEqual(slots.map(() => skins[0]));
    expect([heldWeapon(LIBRARY, start), shownMotion(LIBRARY, start)]).toEqual([null, null]);
  });

  it("puts each skin on every slot, wrapping both ways", () => {
    const seen = Array.from({ length: skins.length + 1 }, (_, index) => setsOf(run(start, ...Array.from({ length: index }, (): WardrobeAction => ({ type: "skin", step: 1 }))))[0]);
    expect(seen).toEqual([...skins, skins[0]]);
    expect(setsOf(run(start, { type: "skin", step: -1 }))).toEqual(slots.map(() => skins.at(-1)));
  });

  it("cycles one slot's part through every skin and leaves the others alone", () => {
    const torso = slots.indexOf("chibi_torso");
    let state = run(start, { type: "selectSlot", slot: torso });
    for (const expected of [...skins.slice(1), skins[0]]) {
      state = run(state, { type: "part", step: 1 });
      expect(setsOf(state)[torso]).toBe(expected);
      expect(setsOf(state).filter((_, index) => index !== torso)).toEqual(slots.slice(1).map(() => skins[0]));
    }
    expect(run(start, { type: "part", step: -1, slot: torso }).outfit[torso]).toBe(skins.length - 1);
  });

  it("mixes parts across skins and puts the current skin back on Reset", () => {
    const mixed = run(start, { type: "skin", step: 1 }, { type: "part", step: 1, slot: 0 }, { type: "part", step: -1, slot: 3 });
    expect(new Set(setsOf(mixed)).size).toBe(3);
    expect(run(mixed, { type: "reset" }).outfit).toEqual(slots.map(() => 1));
  });

  it("steps the selected slot with wraparound and ignores out-of-range picks", () => {
    expect(run(start, { type: "slot", step: -1 }).slot).toBe(slots.length - 1);
    expect(run(start, { type: "slot", step: 1 }, { type: "slot", step: 1 }).slot).toBe(2);
    expect(run(start, { type: "selectSlot", slot: 99 })).toBe(start);
    expect(run(start, { type: "part", step: 1, slot: -1 })).toBe(start);
  });

  it("cycles Unarmed and each weapon's class, and Rest and each kind, both ways", () => {
    const classes = Array.from({ length: LIBRARY.weapons.length + 2 }, (_, index) => shownClass(LIBRARY, run(start, ...steps("class", index))));
    expect(classes).toEqual(["unarmed", "sword", "spear", "axe", "daggers", "unarmed"]);
    expect(shownClass(LIBRARY, run(start, { type: "class", step: -1 }))).toBe("daggers");
    expect([heldWeapon(LIBRARY, start), heldWeapon(LIBRARY, run(start, ...steps("class", 1)))?.name]).toEqual([null, "sword"]);
    const held = run(start, ...steps("class", 1));
    expect(Object.keys(wornParts(LIBRARY, held))).toEqual([...slots, ...Object.keys(LIBRARY.weapons[0]!.parts)]);
    const kinds = Array.from({ length: 7 }, (_, index) => shownKind(run(start, ...steps("motion", index))));
    expect(kinds).toEqual([null, "idle", "walk", "jump", "attack", "hit", null]);
    expect(shownKind(run(start, { type: "motion", step: -1 }))).toBe("hit");
  });

  it("plays the class's animation of the shown kind, keeping the kind across classes", () => {
    const attack = run(start, ...steps("motion", 4));
    expect(shownMotion(LIBRARY, attack)?.name).toBe("unarmed-attack");
    const sword = run(attack, ...steps("class", 1));
    expect(shownMotion(full, sword)?.name).toBe("sword-attack");
    expect(shownMotion(full, run(sword, ...steps("class", 1)))?.name).toBe("spear-attack");
    expect(shownMotion(full, run(sword, { type: "class", step: -1 }))?.name).toBe("unarmed-attack");
    // The placeholder holds only unarmed animations, so an armed class rests until the library holds its kinds.
    expect(shownMotion(LIBRARY, sword)).toBeNull();
    expect(shownMotion(full, run(sword, { type: "motion", step: 1 }))?.name).toBe("sword-hit");
  });
});
