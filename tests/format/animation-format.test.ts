import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { DEFAULT_FPS, sampleAnimation, validateAnimation } from "../../src/format";
import type { Key, RigLabAnimation } from "../../src/format";
import { HUMANOID_RIG } from "../../src/hexframe/humanoid";

type Mutable = Record<string, any>;

/** A full humanoid pose: every bone rotated by `rotation`, the root lifted by `y`. */
function pose(rotation: number, y = 0): Pose {
  return Object.fromEntries(HUMANOID_RIG.bones.map((bone) => [
    bone.name,
    bone.name === HUMANOID_RIG.root ? { x: 0, y, rotation } : { rotation },
  ]));
}

function animation(keys: readonly Key[], length: number, loop = false): RigLabAnimation {
  return { format: "riglab.anim", version: 1, name: "test", rig: "humanoid", fps: DEFAULT_FPS, length, loop, keys };
}

const key = (frame: number, rotation: number, interpolation: Key["interpolation"] = "hold"): Key => ({ frame, interpolation, pose: pose(rotation) });
const rotationAt = (value: RigLabAnimation, frame: number): number => sampleAnimation(value, frame)["arm-front"]!.rotation!;

function errorsOf(change: (value: Mutable) => void): string {
  const value = structuredClone(animation([key(0, 0, "linear"), key(4, 40)], 8)) as Mutable;
  change(value);
  const result = validateAnimation(value, HUMANOID_RIG);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("riglab.anim validation", () => {
  it("accepts a three-key animation at the default 14 fps", () => {
    const value = animation([key(0, 0), key(3, 20, "linear"), key(6, 40)], 10);
    expect(validateAnimation(value, HUMANOID_RIG)).toEqual({ ok: true, value });
  });

  it("refuses a bad header, rig, rate, length or loop flag", () => {
    expect(errorsOf((value) => { value.format = "riglab.rig"; })).toMatch(/\$\.format/);
    expect(errorsOf((value) => { value.rig = "quadruped"; })).toMatch(/\$\.rig: must name rig 'humanoid'/);
    expect(errorsOf((value) => { value.fps = 14.5; })).toMatch(/\$\.fps: must be an integer from 1 to 720/);
    expect(errorsOf((value) => { value.length = 0; })).toMatch(/\$\.length/);
    expect(errorsOf((value) => { value.loop = "yes"; })).toMatch(/\$\.loop/);
    expect(errorsOf((value) => { value.speed = 2; })).toMatch(/has unknown field 'speed'/);
  });

  it("requires sorted integer keys from frame 0 within the length", () => {
    expect(errorsOf((value) => { value.keys = []; })).toMatch(/\$\.keys: must be a non-empty array/);
    expect(errorsOf((value) => { value.keys[0].frame = 1; })).toMatch(/\$\.keys\[0\]\.frame: must be 0/);
    expect(errorsOf((value) => { value.keys[1].frame = 0; })).toMatch(/\$\.keys\[1\]\.frame: must be greater/);
    expect(errorsOf((value) => { value.keys[1].frame = 9; })).toMatch(/must not exceed the animation length/);
    expect(errorsOf((value) => { value.keys[1].frame = 2.5; })).toMatch(/\$\.keys\[1\]\.frame: must be an integer/);
    expect(errorsOf((value) => { value.keys[1].interpolation = "cubic"; })).toMatch(/'hold', 'linear' or 'smoothstep'/);
  });

  it("requires a full pose that translates only the root", () => {
    expect(errorsOf((value) => { delete value.keys[1].pose.head; })).toMatch(/\$\.keys\[1\]\.pose: is missing bone 'head'/);
    expect(errorsOf((value) => { value.keys[1].pose.tail = { rotation: 0 }; })).toMatch(/unknown bone 'tail'/);
    expect(errorsOf((value) => { value.keys[1].pose["forearm-front"].x = 3; })).toMatch(/pose\.forearm-front: has unknown field 'x'/);
    expect(errorsOf((value) => { delete value.keys[1].pose.pelvis.y; })).toMatch(/pose\.pelvis: is missing 'y'/);
    expect(errorsOf((value) => { value.keys[1].pose.torso.rotation = Infinity; })).toMatch(/pose\.torso\.rotation: must be a finite number/);
  });
});

describe("sampleAnimation", () => {
  it("holds a key until the next key starts", () => {
    const held = animation([key(0, 0), key(4, 40)], 8);
    expect([0, 1, 3, 4, 7, 8].map((frame) => rotationAt(held, frame))).toEqual([0, 0, 0, 40, 40, 40]);
  });

  it("interpolates linearly and with smoothstep between keys", () => {
    const linear = animation([key(0, 0, "linear"), key(4, 40)], 8);
    expect([0, 1, 2, 3, 4].map((frame) => rotationAt(linear, frame))).toEqual([0, 10, 20, 30, 40]);
    const eased = animation([key(0, 0, "smoothstep"), key(4, 40)], 8);
    expect(rotationAt(eased, 1)).toBeCloseTo(40 * (0.25 * 0.25 * 2.5), 12);
    expect(rotationAt(eased, 2)).toBe(20);
  });

  it("clamps a non-looping animation and holds its last key", () => {
    const once = animation([key(0, 0, "linear"), key(4, 40, "linear")], 8);
    expect([-3, 6, 8, 20].map((frame) => rotationAt(once, frame))).toEqual([0, 40, 40, 40]);
  });

  it("wraps a looping animation and runs its last key back to key 0 at the length", () => {
    const loop = animation([key(0, 0, "linear"), key(4, 40, "linear")], 8, true);
    expect([4, 6, 8, 9, -2].map((frame) => rotationAt(loop, frame))).toEqual([40, 20, 0, 10, 20]);
    const stepped = animation([key(0, 0), key(4, 40)], 8, true);
    expect([7, 8, 12].map((frame) => rotationAt(stepped, frame))).toEqual([40, 0, 40]);
  });

  it("samples the root translation and returns a fresh pose", () => {
    const lift: RigLabAnimation = animation([{ frame: 0, interpolation: "linear", pose: pose(0, 0) }, { frame: 2, interpolation: "hold", pose: pose(0, -6) }], 2);
    expect(sampleAnimation(lift, 1).pelvis).toEqual({ x: 0, y: -3, rotation: 0 });
    const sampled = sampleAnimation(lift, 2);
    sampled.pelvis!.y = 99;
    expect(lift.keys[1]!.pose.pelvis!.y).toBe(-6);
  });
});
