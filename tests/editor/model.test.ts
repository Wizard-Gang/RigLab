import { describe, expect, it } from "vitest";
import { ANIMATION_KINDS, KINDS, keyFrames, validateAnimation } from "../../src/format";
import { blankAnimation, restPose, uniqueName } from "../../src/editor/animations";
import { heldWeapons, libraryModel, validateModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { LIBRARY } from "../../src/library/active";
import { heldAnimation } from "../format/weapon-fixtures";

type Mutable = Record<string, any>;

/** The library with one blank animation of each kind. */
const moves = (): LibraryModel => ({ ...libraryModel(LIBRARY), animations: ANIMATION_KINDS.map((kind) => blankAnimation(LIBRARY.rig, kind)) });

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(moves()) as Mutable;
  change(value);
  const result = validateModel(value as LibraryModel);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("the editor's model", () => {
  it("is the library's chibi, every weapon with its hold, and its animations, in config order", () => {
    const model = libraryModel(LIBRARY);
    expect(validateModel(model).ok).toBe(true);
    expect([model.rig.name, model.animations.map((animation) => animation.name)]).toEqual(["chibi", ["unarmed-idle", "unarmed-walk", "unarmed-jump", "unarmed-attack", "unarmed-hit"]]);
    expect(model.weapons).toEqual(LIBRARY.weapons.map((item) => ({ weapon: item.weapon, hold: item.hold })));
    expect(weaponRigs(model).map((weapon) => weapon.name)).toEqual(["sword", "spear", "axe", "daggers"]);
    expect(model.weapons[3]!.hold).toEqual({ name: "daggers", bodies: [] });
  });

  it("lists only the weapons some animation's class holds, in config order", () => {
    const model = moves();
    expect(heldWeapons(model)).toEqual([]);
    const held = (name: string) => model.weapons.find((item) => item.weapon.name === name)!;
    const animations = [
      ...model.animations,
      heldAnimation(LIBRARY.rig, held("axe").weapon, held("axe").hold, "attack"),
      heldAnimation(LIBRARY.rig, held("sword").weapon, held("sword").hold, "walk"),
    ];
    expect(validateModel({ ...model, animations }).ok).toBe(true);
    expect(heldWeapons({ ...model, animations }).map((weapon) => weapon.name)).toEqual(["sword", "axe"]);
  });

  it("refuses an invalid model with the first failing path", () => {
    expect(errorsOf((value) => {
      value.rig.bones[2].offset = [0];
    })).toMatch(/^\$\.rig\.bones\[2\]\.offset/);
    expect(errorsOf((value) => {
      value.animations[3].keys[2].frame = 15;
    })).toBe("$.animations[3].keys[2].frame: must be 16: attack keys sit at frames 0, 8, 16 and 24");
    expect(errorsOf((value) => {
      value.animations[0].fps = 14;
    })).toBe("$.animations[0].fps: must be 60, Hexframe's clock");
    expect(errorsOf((value) => {
      value.animations[1] = value.animations[0];
    })).toBe("$.animations[1].name: duplicates animation 'unarmed-idle': a library holds one animation of each class and kind");
  });

  it("refuses a weapon or hold at its own path", () => {
    expect(errorsOf((value) => {
      value.weapons[0].weapon.bodies[0].grips[0].chain = "tail";
    })).toBe("$.weapons[0].weapon.bodies[0].grips[0].chain: must name a chain of rig 'chibi'");
    expect(errorsOf((value) => {
      value.weapons = [value.weapons[0], value.weapons[0]];
    })).toBe("$.weapons[1].weapon.name: duplicates weapon 'sword'");
    expect(errorsOf((value) => {
      value.weapons[0].hold = value.weapons[1].hold;
    })).toBe("$.weapons[0].hold.name: must be 'sword'");
    expect(errorsOf((value) => {
      value.weapons[1].hold.bodies = [];
    })).toBe("$.weapons[1].hold.bodies: must place free body 'spear'");
    expect(errorsOf((value) => {
      value.weapons[3].hold.bodies = [{ body: "dagger-front", x: 0, y: 0, rotation: 0 }];
    })).toBe("$.weapons[3].hold.bodies[0].body: 'dagger-front' rides its hand and takes no placement");
  });
});

describe("animation helpers", () => {
  it("starts each kind's unarmed animation with its rest-pose keys, easing in and out, on Hexframe's clock", () => {
    for (const kind of ANIMATION_KINDS) {
      const animation = blankAnimation(LIBRARY.rig, kind);
      expect([animation.name, animation.class, animation.kind, animation.fps, animation.length, animation.loop]).toEqual([`unarmed-${kind}`, "unarmed", kind, 60, KINDS[kind].length, KINDS[kind].loop]);
      expect(animation.keys.map((key) => key.frame)).toEqual(keyFrames(kind));
      for (const key of animation.keys) expect(key).toEqual({ frame: key.frame, interpolation: "smoothstep", pose: restPose(LIBRARY.rig) });
      expect(validateAnimation(animation, LIBRARY.rig).ok).toBe(true);
    }
    expect(restPose(LIBRARY.rig).pelvis).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(restPose(LIBRARY.rig).head).toEqual({ rotation: 0 });
  });

  it("names copies uniquely within 64 characters", () => {
    expect(uniqueName("idle", [])).toBe("idle");
    expect(uniqueName("idle", ["idle", "idle-2"])).toBe("idle-3");
    const long = "a".repeat(64);
    const next = uniqueName(long, [long]);
    expect(next).toHaveLength(64);
    expect(next.endsWith("-2")).toBe(true);
  });
});
