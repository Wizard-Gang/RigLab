import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { validateDocument } from "../../src/format/document";
import { bodyPoint, chainEnd, constraintsOf, gripTargets, moveRoot, togglePin, toggleGrip } from "../../src/solve";
import { readyHold, WEAPONS } from "../../src/weapons/weapons";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const rig = CHIBI_RIG;

/** Pose mode on a new attack (keys at 0, 8, 16 and 24) at `frame`. */
const posing = (frame = 0): EditorState => run(initialState(), { type: "addAnimation", kind: "attack" }, { type: "setMode", mode: "pose" }, { type: "setFrame", frame });
const keyAt = (state: EditorState, frame: number) => activeAnimationOf(state)!.keys.find((key) => key.frame === frame)!;

describe("picking a weapon", () => {
  for (const weapon of WEAPONS) {
    it(`holds the ${weapon.name} at its ready hold, with the document carrying it and undo taking it back`, () => {
      const before = posing();
      const state = run(before, { type: "holdWeapon", name: weapon.name });
      expect(state.status).toEqual({ tone: "info", text: `attack holds the ${weapon.name} at frame 0` });
      const document = documentOf(state);
      expect(document.weapons).toEqual([weapon]);
      expect(validateDocument(document).ok).toBe(true);
      const key = keyAt(state, 0);
      expect(key.weapon).toEqual(readyHold(weapon));
      for (const grip of gripTargets(constraintsOf(key, document.weapons).weapon!)) {
        const hand = chainEnd(rig, key.pose, rig.chains.find((chain) => chain.name === grip.chain)!);
        expect(Math.hypot(hand.x - grip.target.x, hand.y - grip.target.y)).toBeLessThan(1e-6);
      }
      expect(documentOf(run(state, { type: "undo" }))).toBe(documentOf(before));
    });
  }

  it("swaps weapons on a key and keeps only the weapons some key holds", () => {
    let state = run(posing(), { type: "holdWeapon", name: "sword" }, { type: "setFrame", frame: 8 }, { type: "holdWeapon", name: "daggers" });
    expect(documentOf(state).weapons!.map((weapon) => weapon.name)).toEqual(["sword", "daggers"]);
    state = run(state, { type: "setFrame", frame: 0 }, { type: "holdWeapon", name: "spear" });
    expect(documentOf(state).weapons!.map((weapon) => weapon.name)).toEqual(["daggers", "spear"]);
    state = run(state, { type: "holdWeapon", name: null });
    expect(state.status).toEqual({ tone: "info", text: "attack let go of the spear at frame 0" });
    expect(keyAt(state, 0).weapon).toBeUndefined();
    state = run(state, { type: "setFrame", frame: 8 }, { type: "holdWeapon", name: null });
    expect("weapons" in documentOf(state)).toBe(false);
    expect(run(state, { type: "holdWeapon", name: null }).status).toEqual({ tone: "error", text: "The key at frame 8 holds no weapon" });
  });

  it("is refused between keys, outside Pose and for a weapon it already holds", () => {
    const between = posing(4);
    expect(run(between, { type: "holdWeapon", name: "axe" }).status).toEqual({ tone: "error", text: "Frame 4 is between keys: attack poses at frames 0, 8, 16 and 24" });
    expect(documentOf(run(between, { type: "holdWeapon", name: "axe" }))).toBe(documentOf(between));
    expect(run(posing(), { type: "setMode", mode: "animate" }, { type: "holdWeapon", name: "axe" }).status?.text).toBe("Switch to Pose to hold a weapon");
    expect(run(posing(), { type: "holdWeapon", name: "axe" }, { type: "holdWeapon", name: "axe" }).status?.text).toBe("The key at frame 0 already holds the axe");
    expect(run(posing(), { type: "holdWeapon", name: "flail" }).status?.text).toBe("There is no weapon named 'flail'");
  });

  it("releases a pinned hand and replaces an old prop, saying so", () => {
    const start = posing();
    const pose = keyAt(start, 0).pose;
    const pinned = togglePin(rig, pose, { pins: [], prop: null }, "arm-front");
    const propped = pinned.ok ? toggleGrip(rig, pose, pinned.constraints, "arm-back") : pinned;
    if (!propped.ok) throw new Error(propped.error);
    const state = run(start, { type: "setPose", pose, constraints: propped.constraints }, { type: "holdWeapon", name: "spear" });
    expect(state.status?.text).toBe("attack holds the spear at frame 0; let go of prop; unpinned arm-front");
    expect([keyAt(state, 0).pins, keyAt(state, 0).prop]).toEqual([undefined, undefined]);
  });

  it("carries the ready hold with the body when the pelvis has moved", () => {
    const start = posing();
    const lowered = moveRoot(rig, keyAt(start, 0).pose, { x: 3, y: -22 }).pose;
    const state = run(start, { type: "setPose", pose: lowered }, { type: "holdWeapon", name: "sword" });
    const ready = readyHold(WEAPONS[0]!).bodies[0]!;
    expect(keyAt(state, 0).weapon!.bodies[0]).toEqual({ ...ready, x: ready.x + 3, y: ready.y + 3 });
    const tip = bodyPoint(keyAt(state, 0).weapon!.bodies[0]!, WEAPONS[0]!.bodies[0]!.axis[1]);
    expect(tip.y).toBeLessThan(-40);
  });

  it("drops a weapon copy when its last animation is deleted", () => {
    let state = run(posing(), { type: "holdWeapon", name: "axe" });
    state = run(state, { type: "select", selection: { kind: "animation", name: "attack" } }, { type: "deleteSelection" });
    expect(documentOf(state).animations).toEqual([]);
    expect("weapons" in documentOf(state)).toBe(false);
  });
});
