import { describe, expect, it } from "vitest";
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { ANIMATION_KINDS, ENGINE_FPS, keyFrames, KINDS, poseFrames, sampleAnimation, validateAnimation } from "../../src/format";
import type { AnimationKind, Key, RigLabAnimation } from "../../src/format";

type Mutable = Record<string, any>;

/** A full chibi pose: every bone rotated by `rotation`, the root lifted by `y`. */
function pose(rotation: number, y = 0): Pose {
  return Object.fromEntries(CHIBI_RIG.bones.map((bone) => [
    bone.name,
    bone.name === CHIBI_RIG.root ? { x: 0, y, rotation } : { rotation },
  ]));
}

/** A kind's keys, rotated key by key, all with one interpolation. */
function animation(kind: AnimationKind, rotations: readonly number[], interpolation: Key["interpolation"] = "hold"): RigLabAnimation {
  const { length, loop } = KINDS[kind];
  return {
    format: "riglab.anim",
    version: 2,
    name: "test",
    rig: "chibi",
    kind,
    fps: ENGINE_FPS,
    length,
    loop,
    keys: keyFrames(kind).map((frame, index) => ({ frame, interpolation, pose: pose(rotations[index] ?? 0) })),
  };
}

const rotationAt = (value: RigLabAnimation, frame: number): number => sampleAnimation(value, frame)["arm-front"]!.rotation!;

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(animation("attack", [0, 40, 20, 0], "linear")) as Mutable;
  change(value);
  const result = validateAnimation(value, CHIBI_RIG);
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
      expect(validateAnimation(value, CHIBI_RIG)).toEqual({ ok: true, value });
    }
  });

  it("refuses a bad header, rig, rate or kind", () => {
    expect(errorsOf((value) => { value.format = "riglab.rig"; })).toMatch(/\$\.format/);
    expect(errorsOf((value) => { value.version = 1; })).toMatch(/\$\.version: must be 2/);
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

  it("refuses a key that still holds the legacy prop, at the key's path", () => {
    const prop = { name: "prop", x: 9, y: -24, rotation: 180, grips: [{ chain: "arm-front", at: [0, 0] }, { chain: "arm-back", at: [18, 0] }] };
    expect(errorsOf((value) => { value.keys[2].prop = prop; })).toBe("$.keys[2]: has unknown field 'prop'");
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
