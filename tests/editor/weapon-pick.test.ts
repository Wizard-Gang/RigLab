import { describe, expect, it } from "vitest";
import { heldWeapons, validateModel, weaponRigs } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { LIBRARY } from "../../src/library/active";
import { bodyPoint, chainEnd, constraintsOf, gripTargets, moveRoot, togglePin } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const rig = LIBRARY.rig;
const held = (state: EditorState): string[] => heldWeapons(modelOf(state)).map((weapon) => weapon.name);

/** Pose mode on the seeded attack (keys at 0, 8, 16 and 24) at `frame`. */
const posing = (frame = 0): EditorState => run(initialState(), { type: "activateAnimation", name: "attack" }, { type: "setMode", mode: "pose" }, { type: "setFrame", frame });
const keyAt = (state: EditorState, frame: number) => activeAnimationOf(state)!.keys.find((key) => key.frame === frame)!;

describe("picking a weapon", () => {
  for (const { weapon, hold } of LIBRARY.weapons) {
    it(`holds the ${weapon.name} at its hold, with the model's weapons untouched and undo taking it back`, () => {
      const before = posing();
      const state = run(before, { type: "holdWeapon", name: weapon.name });
      expect(state.status).toEqual({ tone: "info", text: `attack holds the ${weapon.name} at frame 0` });
      const model = modelOf(state);
      expect(model.weapons).toBe(modelOf(before).weapons);
      expect(validateModel(model).ok).toBe(true);
      const key = keyAt(state, 0);
      expect(key.weapon).toEqual(hold);
      for (const grip of gripTargets(constraintsOf(key, weaponRigs(model)).weapon!)) {
        const hand = chainEnd(rig, key.pose, rig.chains.find((chain) => chain.name === grip.chain)!);
        expect(Math.hypot(hand.x - grip.target.x, hand.y - grip.target.y)).toBeLessThan(1e-6);
      }
      expect(modelOf(run(state, { type: "undo" }))).toBe(modelOf(before));
    });
  }

  it("swaps weapons on a key, adding and pruning no weapon", () => {
    const start = posing();
    let state = run(start, { type: "holdWeapon", name: "sword" }, { type: "setFrame", frame: 8 }, { type: "holdWeapon", name: "daggers" });
    expect(held(state)).toEqual(["sword", "daggers"]);
    state = run(state, { type: "setFrame", frame: 0 }, { type: "holdWeapon", name: "spear" });
    expect(held(state)).toEqual(["spear", "daggers"]);
    state = run(state, { type: "holdWeapon", name: null });
    expect(state.status).toEqual({ tone: "info", text: "attack let go of the spear at frame 0" });
    expect(keyAt(state, 0).weapon).toBeUndefined();
    state = run(state, { type: "setFrame", frame: 8 }, { type: "holdWeapon", name: null });
    expect(held(state)).toEqual([]);
    expect(modelOf(state).weapons).toBe(modelOf(start).weapons);
    expect(run(state, { type: "holdWeapon", name: null }).status).toEqual({ tone: "error", text: "The key at frame 8 holds no weapon" });
  });

  it("is refused between keys, outside Pose and for a weapon it already holds", () => {
    const between = posing(4);
    expect(run(between, { type: "holdWeapon", name: "axe" }).status).toEqual({ tone: "error", text: "Frame 4 is between keys: attack poses at frames 0, 8, 16 and 24" });
    expect(modelOf(run(between, { type: "holdWeapon", name: "axe" }))).toBe(modelOf(between));
    expect(run(posing(), { type: "setMode", mode: "animate" }, { type: "holdWeapon", name: "axe" }).status?.text).toBe("Switch to Pose to hold a weapon");
    expect(run(posing(), { type: "holdWeapon", name: "axe" }, { type: "holdWeapon", name: "axe" }).status?.text).toBe("The key at frame 0 already holds the axe");
    expect(run(posing(), { type: "holdWeapon", name: "flail" }).status?.text).toBe("There is no weapon named 'flail'");
  });

  it("releases a pinned hand, saying so", () => {
    const start = posing();
    const pose = keyAt(start, 0).pose;
    const pinned = togglePin(rig, pose, { pins: [] }, "arm-front");
    if (!pinned.ok) throw new Error(pinned.error);
    const state = run(start, { type: "setPose", pose, constraints: pinned.constraints }, { type: "holdWeapon", name: "spear" });
    expect(state.status?.text).toBe("attack holds the spear at frame 0; unpinned arm-front");
    expect(keyAt(state, 0).pins).toBeUndefined();
  });

  it("carries the hold with the body when the pelvis has moved", () => {
    const start = posing();
    const lowered = moveRoot(rig, keyAt(start, 0).pose, { x: 3, y: -22 }).pose;
    const state = run(start, { type: "setPose", pose: lowered }, { type: "holdWeapon", name: "sword" });
    const sword = LIBRARY.weapons[0]!;
    const ready = sword.hold.bodies[0]!;
    expect(keyAt(state, 0).weapon!.bodies[0]).toEqual({ ...ready, x: ready.x + 3, y: ready.y + 3 });
    const tip = bodyPoint(keyAt(state, 0).weapon!.bodies[0]!, sword.weapon.bodies[0]!.axis[1]);
    expect(tip.y).toBeLessThan(-40);
  });

  it("keeps every weapon when the animation that held one is deleted", () => {
    const start = posing();
    let state = run(start, { type: "holdWeapon", name: "axe" });
    state = run(state, { type: "select", selection: { kind: "animation", name: "attack" } }, { type: "deleteSelection" });
    expect(modelOf(state).animations.map((animation) => animation.name)).toEqual(["idle", "walk", "jump", "hit"]);
    expect(modelOf(state).weapons).toBe(modelOf(start).weapons);
    expect(held(state)).toEqual([]);
  });
});
