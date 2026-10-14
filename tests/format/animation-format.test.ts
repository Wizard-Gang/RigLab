import { describe, expect, it } from "vitest";
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { ANIMATION_KINDS, ENGINE_FPS, keyFrames, KINDS, poseFrames, sampleAnimation, validateAnimation } from "../../src/format";
import { weaponRigs, libraryModel } from "../../src/editor/model";
import type { AnimationKind, Key, RigLabAnimation } from "../../src/format";

type Mutable = Record<string, any>;

/** A full chibi pose: every bone rotated by `rotation`, the root lifted by `y`. */
function pose(rotation: number, y = 0): Pose {
  return Object.fromEntries(LIBRARY.rig.bones.map((bone) => [
    bone.name,
    bone.name === LIBRARY.rig.root ? { x: 0, y, rotation } : { rotation },
  ]));
}

const WEAPONS = weaponRigs(libraryModel(LIBRARY));

/** A kind's unarmed keys, rotated key by key, all with one interpolation. */
function animation(kind: AnimationKind, rotations: readonly number[], interpolation: Key["interpolation"] = "hold"): RigLabAnimation {
  const { length, loop } = KINDS[kind];
  return {
    format: "riglab.anim",
    version: 3,
    name: `unarmed-${kind}`,
    rig: "chibi",
    class: "unarmed",
    kind,
    fps: ENGINE_FPS,
    length,
    loop,
    keys: keyFrames(kind).map((frame, index) => ({ frame, interpolation, pose: pose(rotations[index] ?? 0) })),
  };
}

/** The attack of a class: each key places the class weapon's free bodies at its library hold. */
function classed(animationClass: string): RigLabAnimation {
  const base = animation("attack", [0, 40, 20, 0], "linear");
  const hold = LIBRARY.weapons.find((item) => item.name === animationClass)?.hold.bodies ?? [];
  return { ...base, name: `${animationClass}-attack`, class: animationClass, keys: base.keys.map((key) => (hold.length ? { ...key, bodies: hold } : key)) };
}

const rotationAt = (value: RigLabAnimation, frame: number): number => sampleAnimation(value, frame)["arm-front"]!.rotation!;

function errorsOf(change: (value: Mutable) => void, base: RigLabAnimation = animation("attack", [0, 40, 20, 0], "linear")): string {
  const value = structuredClone(base) as Mutable;
  change(value);
  const result = validateAnimation(value, LIBRARY.rig, WEAPONS);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("engine timing", () => {
  it("runs every animation on Hexframe's 60 Hz clock", () => {
    expect(ENGINE_FPS).toBe(60);
    expect(ANIMATION_KINDS).toEqual(["idle", "walk", "jump", "attack", "hit"]);
  });

  it("gives idle four looping keys over Hexframe's one-second labIdle", () => {
    expect(KINDS.idle).toEqual({ label: "Idle", length: 60, loop: true, keys: 4 });
    expect(keyFrames("idle")).toEqual([0, 15, 30, 45]);
  });

  it("puts every kind's keys on Hexframe's 13 poses, on whole frames, evenly spaced", () => {
    const layouts = Object.fromEntries(ANIMATION_KINDS.map((kind) => [kind, keyFrames(kind)]));
    expect(layouts).toEqual({ idle: [0, 15, 30, 45], walk: [0, 12, 24, 36], jump: [0, 12, 24, 36], attack: [0, 8, 16, 24], hit: [0, 12, 24] });
    for (const kind of ANIMATION_KINDS) {
      const { length, loop } = KINDS[kind];
      expect(length % POSE_INTERVALS, kind).toBe(0);
      const poses = poseFrames(length);
      expect(poses.every(Number.isInteger), kind).toBe(true);
      expect(keyFrames(kind).every((frame) => poses.includes(frame)), kind).toBe(true);
      expect(keyFrames(kind).at(-1), kind).toBe(loop ? length - length / keyFrames(kind).length : length);
    }
  });
});

describe("riglab.anim validation", () => {
  it("accepts every kind's keys", () => {
    for (const kind of ANIMATION_KINDS) {
      const value = animation(kind, [0, 20, 40, 10]);
      expect(validateAnimation(value, LIBRARY.rig)).toEqual({ ok: true, value });
    }
  });

  it("refuses a bad header, rig, rate or kind", () => {
    expect(errorsOf((value) => { value.format = "riglab.rig"; })).toMatch(/\$\.format/);
    expect(errorsOf((value) => { value.version = 2; })).toMatch(/\$\.version: must be 3/);
    expect(errorsOf((value) => { value.rig = "quadruped"; })).toMatch(/\$\.rig: must name rig 'chibi'/);
    expect(errorsOf((value) => { value.fps = 14; })).toMatch(/\$\.fps: must be 60, Hexframe's clock/);
    expect(errorsOf((value) => { value.kind = "dance"; })).toMatch(/\$\.kind: must be 'idle', 'walk', 'jump', 'attack', 'hit'/);
    expect(errorsOf((value) => { delete value.kind; })).toMatch(/\$: is missing 'kind'/);
    expect(errorsOf((value) => { value.speed = 2; })).toMatch(/has unknown field 'speed'/);
  });

  it("holds every animation to its kind's length, looping and key frames", () => {
    expect(errorsOf((value) => { value.length = 25; })).toMatch(/\$\.length: must be 24: attack animations last 24 frames/);
    expect(errorsOf((value) => { value.loop = true; })).toMatch(/\$\.loop: must be false: attack animations play once/);
    expect(errorsOf((value) => { value.keys = []; })).toMatch(/\$\.keys: must be a non-empty array/);
    expect(errorsOf((value) => { value.keys.pop(); })).toMatch(/\$\.keys: must hold 4 keys: attack keys sit at frames 0, 8, 16 and 24/);
    expect(errorsOf((value) => { value.keys[1].frame = 6; })).toMatch(/\$\.keys\[1\]\.frame: must be 8: attack keys sit at frames 0, 8, 16 and 24/);
    expect(errorsOf((value) => { value.keys[1].interpolation = "cubic"; })).toMatch(/'hold', 'linear' or 'smoothstep'/);
  });

  it("requires a full pose that translates only the root", () => {
    expect(errorsOf((value) => { delete value.keys[1].pose.head; })).toMatch(/\$\.keys\[1\]\.pose: is missing bone 'head'/);
    expect(errorsOf((value) => { value.keys[1].pose.tail = { rotation: 0 }; })).toMatch(/unknown bone 'tail'/);
    expect(errorsOf((value) => { value.keys[1].pose["forearm-front"].x = 3; })).toMatch(/pose\.forearm-front: has unknown field 'x'/);
    expect(errorsOf((value) => { delete value.keys[1].pose.pelvis.y; })).toMatch(/pose\.pelvis: is missing 'y'/);
    expect(errorsOf((value) => { value.keys[1].pose.torso.rotation = Infinity; })).toMatch(/pose\.torso\.rotation: must be a finite number/);
  });

  it("refuses a key that still holds the legacy prop or a version 2 weapon, at the key's path", () => {
    const prop = { name: "prop", x: 9, y: -24, rotation: 180, grips: [{ chain: "arm-front", at: [0, 0] }, { chain: "arm-back", at: [18, 0] }] };
    expect(errorsOf((value) => { value.keys[2].prop = prop; })).toBe("$.keys[2]: has unknown field 'prop'");
    expect(errorsOf((value) => { value.keys[0].weapon = { name: "sword", bodies: [] }; })).toBe("$.keys[0]: has unknown field 'weapon'");
  });
});

describe("animation classes", () => {
  it("accept a valid animation for each class: unarmed or one of the library's weapons", () => {
    for (const name of ["unarmed", "sword", "spear", "axe", "daggers"]) {
      const value = classed(name);
      expect(validateAnimation(value, LIBRARY.rig, WEAPONS), name).toEqual({ ok: true, value });
    }
    expect(classed("sword").keys.every((key) => key.bodies?.length === 1)).toBe(true);
    expect(classed("daggers").keys.every((key) => key.bodies === undefined)).toBe(true);
  });

  it("refuse an unknown class, and a name other than its class and kind", () => {
    expect(errorsOf((value) => { value.class = "flail"; value.name = "flail-attack"; })).toBe("$.class: must be 'unarmed', 'sword', 'spear', 'axe', 'daggers'");
    expect(errorsOf((value) => { delete value.class; })).toMatch(/\$: is missing 'class'/);
    expect(errorsOf((value) => { value.name = "attack"; })).toBe("$.name: must be 'unarmed-attack': an animation is named after its class and kind");
    expect(errorsOf((value) => { value.name = "sword-attack"; })).toBe("$.name: must be 'unarmed-attack': an animation is named after its class and kind");
    const swordless = validateAnimation(classed("sword"), LIBRARY.rig);
    expect(swordless.ok ? [] : swordless.errors).toEqual(["$.class: must be 'unarmed'"]);
  });

  it("place exactly the class weapon's free bodies on every key, and no bodies otherwise", () => {
    expect(errorsOf((value) => { delete value.keys[1].bodies; }, classed("sword"))).toBe("$.keys[1].bodies: must place free body 'sword'");
    expect(errorsOf((value) => { value.keys[2].bodies = []; }, classed("spear"))).toBe("$.keys[2].bodies: must place free body 'spear'");
    expect(errorsOf((value) => {
      value.keys[0].bodies = [value.keys[0].bodies[0], { ...value.keys[0].bodies[0] }, { body: "haft", x: 0, y: 0, rotation: 0 }];
    }, classed("axe"))).toBe([
      "$.keys[0].bodies[1].body: places 'axe' twice",
      "$.keys[0].bodies[2].body: must name a free body of weapon 'axe'",
    ].join("\n"));
    expect(errorsOf((value) => { value.keys[3].bodies = [{ body: "sword", x: 0, y: -30, rotation: 0 }]; })).toBe("$.keys[3].bodies: must be left out: an unarmed key places no bodies");
    expect(errorsOf((value) => { value.keys[0].bodies = []; }, classed("daggers"))).toBe("$.keys[0].bodies: must be left out: every body of the daggers rides a hand");
  });

  it("never pin a chain the class weapon grips, though the feet may be pinned", () => {
    expect(errorsOf((value) => { value.keys[0].pins = [{ chain: "arm-front", x: 9, y: -30 }]; }, classed("sword")))
      .toBe("$.keys[0].pins[0].chain: 'arm-front' grips the sword, so it cannot be pinned");
    expect(errorsOf((value) => { value.keys[1].pins = [{ chain: "arm-back", x: 0, y: -30 }]; }, classed("daggers")))
      .toBe("$.keys[1].pins[0].chain: 'arm-back' grips the daggers, so it cannot be pinned");
    const planted = classed("sword");
    const feet = { ...planted, keys: planted.keys.map((key) => ({ ...key, pins: [{ chain: "leg-front", x: 5, y: 0 }, { chain: "leg-back", x: -5, y: 0 }] })) };
    expect(validateAnimation(feet, LIBRARY.rig, WEAPONS).ok).toBe(true);
    expect(validateAnimation({ ...animation("idle", [0]), keys: animation("idle", [0]).keys.map((key) => ({ ...key, pins: [{ chain: "arm-front", x: 9, y: -24 }] })) }, LIBRARY.rig, WEAPONS).ok).toBe(true);
  });
});

describe("sampleAnimation", () => {
  it("holds a key until the next key starts", () => {
    const held = animation("attack", [0, 40, 20, 0]);
    expect([0, 1, 7, 8, 15, 16].map((frame) => rotationAt(held, frame))).toEqual([0, 0, 0, 40, 40, 20]);
  });

  it("interpolates linearly and with smoothstep between keys", () => {
    const linear = animation("attack", [0, 40, 40, 40], "linear");
    expect([0, 2, 4, 6, 8].map((frame) => rotationAt(linear, frame))).toEqual([0, 10, 20, 30, 40]);
    const eased = animation("attack", [0, 40, 40, 40], "smoothstep");
    expect(rotationAt(eased, 2)).toBeCloseTo(40 * (0.25 * 0.25 * 2.5), 12);
    expect(rotationAt(eased, 4)).toBe(20);
  });

  it("clamps a non-looping animation and holds its last key", () => {
    const once = animation("hit", [0, 40, 10], "linear");
    expect([-3, 12, 24, 40].map((frame) => rotationAt(once, frame))).toEqual([0, 40, 10, 10]);
  });

  it("wraps a looping animation and runs its last key back to key 0 at the length", () => {
    const loop = animation("walk", [0, 40, 0, 40], "linear");
    expect([12, 18, 36, 42, 48, 54, -6].map((frame) => rotationAt(loop, frame))).toEqual([40, 20, 40, 20, 0, 20, 20]);
    const stepped = animation("walk", [0, 40, 0, 40]);
    expect([47, 48, 60].map((frame) => rotationAt(stepped, frame))).toEqual([40, 0, 40]);
  });

  it("samples the root translation and returns a fresh pose", () => {
    const base = animation("hit", [0, 0, 0], "linear");
    const lift: RigLabAnimation = { ...base, keys: base.keys.map((key, index) => ({ ...key, pose: pose(0, [0, -6, 0][index]) })) };
    expect(sampleAnimation(lift, 6).pelvis).toEqual({ x: 0, y: -3, rotation: 0 });
    const sampled = sampleAnimation(lift, 12);
    sampled.pelvis!.y = 99;
    expect(lift.keys[1]!.pose.pelvis!.y).toBe(-6);
  });
});
