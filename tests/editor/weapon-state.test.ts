import { describe, expect, it } from "vitest";
import { libraryModel, validateModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { LIBRARY } from "../../src/library/active";
import { bodyPoint, chainEnd, constraintsAt, dragInPose, engineOf, gripCenter, gripTargets, playAt, setRotation, togglePin } from "../../src/solve";
import { heldAnimation, HOLDS, STAFF } from "../format/weapon-fixtures";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const rig = LIBRARY.rig;

/** A saved library whose only weapon is the staff, with the unarmed animations and a staff attack. */
function armed(): LibraryModel {
  const model = libraryModel(LIBRARY);
  return { ...model, weapons: [{ weapon: STAFF, hold: HOLDS.staff! }], animations: [...model.animations, heldAnimation(rig, STAFF, HOLDS.staff!, "attack")] };
}

/** Animate, paused, on the staff attack at `frame`. */
const posing = (frame: number): EditorState => run(initialState(armed()), { type: "select", selection: { kind: "animation", name: "staff-attack" } }, { type: "setMode", mode: "animate" }, { type: "setFrame", frame });

describe("an animation whose class holds a weapon", () => {
  it("holds it on every key, with both hands on its grips", () => {
    const state = posing(0);
    const animation = activeAnimationOf(state)!;
    expect(animation.keys.map((key) => key.bodies)).toEqual(animation.keys.map(() => HOLDS.staff!.bodies));
    for (const frame of [0, 4, 8, 20]) {
      const played = playAt(engineOf(rig, animation, weaponRigs(modelOf(state))), frame);
      expect(played.violations, `frame ${frame}`).toEqual([]);
      for (const grip of gripTargets(played.constraints.weapon!)) {
        const hand = chainEnd(rig, played.pose, rig.chains.find((chain) => chain.name === grip.chain)!);
        expect(Math.hypot(hand.x - grip.target.x, hand.y - grip.target.y), `${grip.label} at ${frame}`).toBeLessThan(1e-6);
      }
    }
  });

  it("keeps the weapon through pose drops, timeline edits and undo", () => {
    let state = posing(8);
    const model = modelOf(state);
    const played = playAt(engineOf(model.rig, activeAnimationOf(state)!, weaponRigs(model)), 8);
    const turned = setRotation(model.rig, played.pose, "head", 12);
    state = run(state, { type: "setPose", pose: turned.pose, constraints: played.constraints });
    expect(state.status?.tone).toBe("info");
    state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
    const animation = activeAnimationOf(state)!;
    expect(animation.keys.map((key) => [key.interpolation, key.bodies])).toEqual([
      ["smoothstep", HOLDS.staff!.bodies], ["linear", HOLDS.staff!.bodies], ["smoothstep", HOLDS.staff!.bodies], ["smoothstep", HOLDS.staff!.bodies],
    ]);
    expect(animation.keys[1]!.pose.head).toEqual({ rotation: 12 });
    expect(validateModel(modelOf(state)).ok).toBe(true);
    expect(constraintsAt(animation, 4, weaponRigs(modelOf(state))).weapon?.weapon).toBe(STAFF);
    const undone = run(state, { type: "undo" }, { type: "undo" });
    expect(modelOf(undone)).toEqual(armed());
  });

  it("moves and turns its free body per key in Animate, as one undo step", () => {
    const state = posing(16);
    const model = modelOf(state);
    const animation = activeAnimationOf(state)!;
    const played = playAt(engineOf(rig, animation, weaponRigs(model)), 16);
    const center = bodyPoint(played.constraints.weapon!.bodies[0]!, gripCenter(STAFF.bodies[0]!));
    const moved = dragInPose(rig, played.pose, played.constraints, { kind: "weapon-move", body: "staff" }, { x: center.x + 3, y: center.y - 2 });
    const next = run(state, { type: "setPose", pose: moved.pose, constraints: moved.constraints, warning: moved.message });
    const key = activeAnimationOf(next)!.keys[2]!;
    expect(key.bodies).toEqual(moved.constraints.weapon!.bodies);
    expect(key.bodies).not.toEqual(HOLDS.staff!.bodies);
    expect(activeAnimationOf(next)!.keys[1]!.bodies).toEqual(HOLDS.staff!.bodies);
    expect(modelOf(run(next, { type: "undo" }))).toBe(modelOf(state));
  });

  it("refuses a pin on a hand that grips it", () => {
    const state = posing(0);
    const key = activeAnimationOf(state)!.keys[0]!;
    const held = constraintsAt(activeAnimationOf(state)!, 0, weaponRigs(modelOf(state)));
    expect(togglePin(rig, key.pose, held, "arm-front")).toEqual({ ok: false, error: "arm-front holds the staff, so it cannot be pinned" });
    const refused = run(state, { type: "setPose", pose: key.pose, constraints: { ...held, pins: [{ chain: "arm-front", x: 0, y: 0 }] } });
    expect(refused.status).toEqual({ tone: "error", text: "$.keys[0].pins[0].chain: 'arm-front' grips the staff, so it cannot be pinned" });
    expect(modelOf(refused)).toBe(modelOf(state));
  });
});
