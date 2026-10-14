import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { blankAnimation, restPose } from "../../src/editor/animations";
import { fillClasses, startClassAnimation } from "../../src/editor/classes";
import { libraryModel, validateModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { setKeyPose } from "../../src/editor/poseEdits";
import { initialState, isDirty, modelOf, openState } from "../../src/editor/state";
import { poseFrames, validateAnimation } from "../../src/format";
import type { RigLabAnimation, RigLabRig } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { chainEnd, dragInPose, engineOf, gripTargets, NO_CONSTRAINTS, playAt, runtimeRig, setRotation, togglePin } from "../../src/solve";
import type { Constraints, Played } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";

const rig = LIBRARY.rig;
const held = (name: string) => LIBRARY.weapons.find((item) => item.name === name)!;
const BODY = ["pelvis", "leg-front", "shin-front", "leg-back", "shin-back", "torso", "head"];
const ARMS = ["arm-front", "forearm-front", "arm-back", "forearm-back"];
const lengths = (on: RigLabRig, pose: Pose) => skeletonFor(runtimeRig(on), pose).segments.map(segmentLength);

/**
 * An unarmed attack that moves: both feet planted while the pelvis lunges, the torso and head turned, the arms swung,
 * and the front hand pinned on its first key.
 */
function lunge(): RigLabAnimation {
  let animation = blankAnimation(rig, "attack");
  let feet: Constraints = NO_CONSTRAINTS;
  for (const chain of ["leg-front", "leg-back"]) {
    const result = togglePin(rig, restPose(rig), feet, chain);
    if (!result.ok) throw new Error(result.error);
    feet = result.constraints;
  }
  for (const [index, frame] of [0, 8, 16, 24].entries()) {
    const low = dragInPose(rig, restPose(rig), feet, { kind: "joint", bone: "pelvis" }, { x: index, y: -23 + index });
    let pose = setRotation(rig, low.pose, "torso", 8 * index).pose;
    pose = setRotation(rig, pose, "head", -5 * index).pose;
    pose = setRotation(rig, pose, "arm-front", -40 + 20 * index).pose;
    pose = setRotation(rig, pose, "arm-back", 30 - 10 * index).pose;
    let constraints = low.constraints;
    if (index === 0) {
      const hand = togglePin(rig, pose, constraints, "arm-front");
      if (!hand.ok) throw new Error(hand.error);
      constraints = hand.constraints;
    }
    const result = setKeyPose(rig, animation, frame, pose, constraints);
    if (!result.ok) throw new Error(result.error);
    animation = result.animation;
  }
  return animation;
}

/** Each grip's distance from the hand that holds it. */
const misses = (played: Pick<Played, "pose" | "constraints">): number[] =>
  gripTargets(played.constraints.weapon!).map((grip) => {
    const hand = chainEnd(rig, played.pose, rig.chains.find((chain) => chain.name === grip.chain)!);
    return Math.hypot(hand.x - grip.target.x, hand.y - grip.target.y);
  });

describe("starting a class's animation from the unarmed one", () => {
  const source = lunge();

  it("keeps the legs, pelvis, torso and head of the unarmed source on every key, and its timing", () => {
    for (const name of ["sword", "spear", "axe", "daggers"]) {
      const { animation } = startClassAnimation(rig, held(name), "attack", source);
      expect([animation.name, animation.class, animation.kind, animation.length, animation.loop]).toEqual([`${name}-attack`, name, "attack", 24, false]);
      expect(validateAnimation(animation, rig, weaponRigs(libraryModel(LIBRARY))).ok, name).toBe(true);
      animation.keys.forEach((key, index) => {
        const from = source.keys[index]!;
        expect([key.frame, key.interpolation], `${name} key ${index}`).toEqual([from.frame, from.interpolation]);
        for (const bone of BODY) expect(key.pose[bone], `${name} ${bone} at ${key.frame}`).toEqual(from.pose[bone]);
      });
    }
  });

  it("puts both hands on a two-handed weapon's grips at every key and at Hexframe's 13 poses", () => {
    for (const name of ["sword", "spear", "axe"]) {
      const started = startClassAnimation(rig, held(name), "attack", source);
      expect(started.misses, name).toEqual([]);
      const { animation } = started;
      const weapons = [held(name).weapon];
      for (const key of animation.keys) {
        expect(key.bodies, `${name} at ${key.frame}`).toHaveLength(1);
        expect(Math.max(...misses({ pose: key.pose, constraints: { pins: [], weapon: { weapon: held(name).weapon, bodies: key.bodies! } } })), `${name} key ${key.frame}`).toBeLessThan(1e-5);
        expect(lengths(rig, key.pose)).toEqual(lengths(rig, restPose(rig)).map((length) => expect.closeTo(length, 9)));
      }
      const engine = engineOf(rig, animation, weapons);
      for (const frame of poseFrames(animation.length)) {
        const played = playAt(engine, frame);
        expect(played.violations, `${name} at ${frame}`).toEqual([]);
        expect(Math.max(...misses(played)), `${name} pose at ${frame}`).toBeLessThan(1e-5);
      }
    }
  });

  it("carries the hold with the torso", () => {
    const { animation } = startClassAnimation(rig, held("sword"), "attack", source);
    const [rest, turned] = [animation.keys[0]!.bodies![0]!, animation.keys[3]!.bodies![0]!];
    expect(turned.rotation - rest.rotation).toBeCloseTo(24, 6);
    expect(rest).not.toEqual(held("sword").hold.bodies[0]);
  });

  it("keeps the unarmed arms for the daggers, which ride the hands", () => {
    const { animation, misses: missed } = startClassAnimation(rig, held("daggers"), "attack", source);
    expect(missed).toEqual([]);
    animation.keys.forEach((key, index) => {
      for (const bone of ARMS) expect(key.pose[bone], `${bone} at ${key.frame}`).toEqual(source.keys[index]!.pose[bone]);
      expect(key.bodies).toBeUndefined();
    });
  });

  it("drops pins on the chains the weapon grips and keeps the others", () => {
    expect(source.keys[0]!.pins!.map((pin) => pin.chain)).toEqual(["leg-front", "leg-back", "arm-front"]);
    for (const name of ["sword", "daggers"]) {
      const { animation } = startClassAnimation(rig, held(name), "attack", source);
      expect(animation.keys.map((key) => key.pins?.map((pin) => pin.chain)), name).toEqual(source.keys.map(() => ["leg-front", "leg-back"]));
    }
  });

  it("reports a grip a hand cannot reach, and never stretches the arm", () => {
    const short: RigLabRig = { ...rig, bones: rig.bones.map((bone) => (bone.name.startsWith("forearm") ? { ...bone, tip: [0, 3] } : bone)) };
    const { animation, misses: missed } = startClassAnimation(short, held("sword"), "idle");
    expect(missed[0]).toMatch(/^sword-idle at frame 0: sword grip '\w+': arm-\w+ cannot reach: the target is \d+\.\d\d beyond full extension$/);
    expect(missed).toHaveLength(8);
    for (const key of animation.keys) expect(lengths(short, key.pose)).toEqual(lengths(short, restPose(short)).map((length) => expect.closeTo(length, 9)));
  });

  it("starts at the rest pose without an unarmed animation of its kind", () => {
    const { animation } = startClassAnimation(rig, held("daggers"), "jump");
    expect(animation.keys.map((key) => key.pose)).toEqual(blankAnimation(rig, "jump").keys.map((key) => key.pose));
  });
});

describe("filling the library's classes", () => {
  const library = libraryModel(LIBRARY);
  const grid = ["unarmed", "sword", "spear", "axe", "daggers"].flatMap((name) => ["idle", "walk", "jump", "attack", "hit"].map((kind) => `${name}-${kind}`));

  it("starts every missing class and kind in config and kind order, after the animations the library has", () => {
    const filled = fillClasses(library);
    expect(filled.started).toEqual(grid.slice(5));
    expect(filled.misses).toEqual([]);
    expect(filled.model.animations.map((animation) => animation.name)).toEqual(grid);
    expect(filled.model.animations.slice(0, 5)).toEqual(library.animations);
    library.animations.forEach((animation, index) => expect(filled.model.animations[index]).toBe(animation));
    expect(validateModel(filled.model).ok).toBe(true);
  });

  it("is idempotent, and never changes an animation the library has", () => {
    const filled = fillClasses(library);
    const again = fillClasses(filled.model);
    expect(again.started).toEqual([]);
    expect(again.model).toBe(filled.model);
    const own = startClassAnimation(rig, held("spear"), "walk").animation;
    const partial: LibraryModel = { ...library, animations: [library.animations[2]!, own] };
    const kept = fillClasses(partial);
    expect(kept.model.animations[0]).toBe(partial.animations[0]);
    expect(kept.model.animations[1]).toBe(own);
    expect(kept.started.slice(0, 4)).toEqual(["unarmed-idle", "unarmed-walk", "unarmed-attack", "unarmed-hit"]);
    expect(kept.started).not.toContain("spear-walk");
    expect(kept.model.animations).toHaveLength(25);
  });

  it("opens a library of five unarmed animations with 20 started and unsaved", () => {
    const state = openState();
    expect(modelOf(state).animations.map((animation) => animation.name)).toEqual(grid);
    expect([isDirty(state), state.history.past.length, state.activeAnimation]).toEqual([true, 0, "unarmed-idle"]);
    expect(state.status).toEqual({ tone: "info", text: "Started 20 missing animations, one of each class and kind; Save writes them" });
    expect(state.saved).toEqual(library);
    const complete = openState(fillClasses(library).model);
    expect([isDirty(complete), complete.status]).toEqual([false, null]);
    expect(initialState().history.present).toEqual(library);
  });
});
