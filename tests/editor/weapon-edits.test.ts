import { describe, expect, it } from "vitest";
import { fillClasses } from "../../src/editor/classes";
import { libraryModel, weaponRigs } from "../../src/editor/model";
import { editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { holdAtRest, weaponDragEdit } from "../../src/editor/weaponEdits";
import type { WeaponEdit } from "../../src/editor/weaponEdits";
import { poseFrames } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { bodyPoint, bodyTransforms, chainEnd, engineOf, gripTargets, playAt, rotate } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const rig = LIBRARY.rig;
const edit = (change: WeaponEdit): Action => ({ type: "weaponEdit", edit: change });
const heldOf = (state: EditorState, name: string) => modelOf(state).weapons.find((item) => item.weapon.name === name)!;

/** Rig setup with the class's idle active, on the library with all 25 animations. */
const setup = (animationClass: string): EditorState => run(
  initialState(fillClasses(libraryModel(LIBRARY)).model),
  { type: "select", selection: { kind: "animation", name: `${animationClass}-idle` } },
  { type: "setMode", mode: "setup" },
);

describe("weapon edits in Rig setup", () => {
  it("move the hold, a grip, a riding body's angle and an axis end, each as one undo step", () => {
    const start = setup("sword");
    const placement = { body: "sword", x: 12, y: -36, rotation: 60 };
    const held = run(start, edit({ kind: "setHold", weapon: "sword", placement }));
    expect(heldOf(held, "sword").hold.bodies).toEqual([placement]);
    expect(held.status).toEqual({ tone: "info", text: "Held the sword at 12, -36, 60°" });
    expect(held.history.past).toHaveLength(1);
    expect(modelOf(run(held, { type: "undo" }))).toBe(modelOf(start));

    const gripped = run(start, edit({ kind: "setGrip", weapon: "sword", body: "sword", grip: "upper", at: [0, 4] }));
    expect(heldOf(gripped, "sword").weapon.bodies[0]!.grips.map((grip) => grip.at)).toEqual([[0, 4], [0, 12]]);
    expect(gripped.status?.text).toBe("Moved the sword's upper grip to 0, 4; the hands hold it there on every sword key");
    expect(modelOf(run(gripped, { type: "undo" }))).toBe(modelOf(start));

    const axis = run(start, edit({ kind: "setAxis", weapon: "sword", body: "sword", end: "tip", at: [0, -34] }));
    expect(heldOf(axis, "sword").weapon.bodies[0]!.axis[1]).toEqual([0, -34]);

    const daggers = setup("daggers");
    const turned = run(daggers, edit({ kind: "setGripAngle", weapon: "daggers", body: "dagger-front", grip: "fist", angle: 170 }));
    expect(heldOf(turned, "daggers").weapon.bodies.map((body) => body.grips[0]!.angle)).toEqual([170, 180]);
    expect(modelOf(run(turned, { type: "undo" }))).toBe(modelOf(daggers));
  });

  it("refuses two grips on one point, an edit the weapon cannot take, and any weapon edit outside Rig setup", () => {
    const start = setup("sword");
    const twice = run(start, edit({ kind: "setGrip", weapon: "sword", body: "sword", grip: "upper", at: [0, 12] }));
    expect(twice.status).toEqual({ tone: "error", text: "The sword's two grips must be at different points" });
    expect(modelOf(twice)).toBe(modelOf(start));
    expect(run(start, edit({ kind: "setAxis", weapon: "sword", body: "sword", end: "tip", at: [0, 19.7] })).status?.text).toBe("The sword's butt and tip must be apart");
    expect(run(start, edit({ kind: "setGripAngle", weapon: "sword", body: "sword", grip: "upper", angle: 10 })).status?.text).toBe("Two hands turn the sword, so its grips have no angle");
    expect(run(start, edit({ kind: "setHold", weapon: "daggers", placement: { body: "dagger-front", x: 0, y: 0, rotation: 0 } })).status?.text).toBe("The daggers' dagger-front rides a hand, so it has no hold");
    expect(run(start, edit({ kind: "setGrip", weapon: "sword", body: "sword", grip: "pommel", at: [0, 1] })).status?.text).toBe("The sword has no grip 'pommel'");
    const daggerTurn = run(setup("daggers"), edit({ kind: "setGripAngle", weapon: "daggers", body: "dagger-back", grip: "fist", angle: 175 }));
    expect(daggerTurn.status?.text).toBe("Turned the daggers' dagger-back to 175° on its hand, on every daggers key");
    expect(run(start, edit({ kind: "setHold", weapon: "flail", placement: { body: "flail", x: 0, y: 0, rotation: 0 } })).status?.text).toBe("The library has no weapon 'flail'");
    for (const mode of ["pose", "animate", "export"] as const) {
      const elsewhere = run(start, { type: "setMode", mode }, edit({ kind: "setHold", weapon: "sword", placement: { body: "sword", x: 0, y: -30, rotation: 0 } }));
      expect(elsewhere.status).toEqual({ tone: "error", text: "Switch to Rig setup to change a weapon" });
      expect(elsewhere.history.past).toHaveLength(0);
    }
  });

  it("reports a grip the hands cannot reach at rest, keeping the edit and never stretching an arm", () => {
    const far = run(setup("spear"), edit({ kind: "setHold", weapon: "spear", placement: { body: "spear", x: 40, y: -30, rotation: 0 } }));
    expect(far.status?.tone).toBe("error");
    expect(far.status?.text).toMatch(/^Held the spear at 40, -30, 0°; spear grip '\w+': arm-\w+ cannot reach/);
    expect(heldOf(far, "spear").hold.bodies[0]!.x).toBe(40);
    expect(holdAtRest(rig, heldOf(far, "spear")).violations.length).toBeGreaterThan(0);
  });

  it("moves the hands with a moved grip on every key of the class", () => {
    const moved = run(setup("axe"), edit({ kind: "setGrip", weapon: "axe", body: "axe", grip: "lower", at: [0, 12] }));
    expect(moved.status?.tone).toBe("info");
    const model = modelOf(moved);
    for (const kind of ["idle", "attack"]) {
      const animation = model.animations.find((candidate) => candidate.name === `axe-${kind}`)!;
      const engine = engineOf(rig, animation, weaponRigs(model));
      for (const frame of poseFrames(animation.length)) {
        const played = playAt(engine, frame);
        expect(played.violations, `axe-${kind} at ${frame}`).toEqual([]);
        const lower = gripTargets(played.constraints.weapon!).find((grip) => grip.chain === "arm-back")!;
        const hand = chainEnd(rig, played.pose, rig.chains.find((chain) => chain.name === "arm-back")!);
        expect(Math.hypot(hand.x - lower.target.x, hand.y - lower.target.y), `axe-${kind} at ${frame}`).toBeLessThan(1e-5);
        expect(bodyPoint(played.constraints.weapon!.bodies[0]!, [0, 12])).toEqual(lower.target);
      }
    }
  });

  it("selects a body or a grip of the class weapon, and lets go of it when the class changes", () => {
    let state = run(setup("sword"), { type: "select", selection: { kind: "grip", weapon: "sword", body: "sword", grip: "lower" } });
    expect(state.selection).toEqual({ kind: "grip", weapon: "sword", body: "sword", grip: "lower" });
    expect(run(state, { type: "deleteSelection" })).toBe(state);
    state = run(state, { type: "select", selection: { kind: "body", weapon: "sword", body: "sword" } });
    expect(state.selection).toEqual({ kind: "body", weapon: "sword", body: "sword" });
    expect(run(state, { type: "setClass", animationClass: "spear" }).selection).toBeNull();
    expect(run(state, { type: "select", selection: { kind: "grip", weapon: "sword", body: "sword", grip: "pommel" } }).selection).toBeNull();
  });
});

describe("dragging a weapon in Rig setup", () => {
  const sword = () => heldOf(setup("sword"), "sword");

  it("moves a dragged grip's point by the drag, turned into the body's frame", () => {
    const held = sword();
    const rest = holdAtRest(rig, held);
    const transform = bodyTransforms(rig, rest.pose, rest.constraints.weapon!)[0]!;
    const grip = held.weapon.bodies[0]!.grips[0]!;
    const start = bodyPoint(transform, grip.at);
    const drag = { x: 3, y: -2 };
    const change = weaponDragEdit(rig, held, rest.pose, { kind: "weapon-grip", body: "sword", grip: grip.name }, { x: start.x + drag.x, y: start.y + drag.y });
    const local = rotate(drag, -transform.rotation);
    expect(change?.kind).toBe("setGrip");
    if (change?.kind !== "setGrip") return;
    expect(change.at[0]).toBeCloseTo(grip.at[0] + local.x, 5);
    expect(change.at[1]).toBeCloseTo(grip.at[1] + local.y, 5);
    const tip = bodyPoint(transform, held.weapon.bodies[0]!.axis[1]);
    const axis = weaponDragEdit(rig, held, rest.pose, { kind: "weapon-axis", body: "sword", end: "tip" }, { x: tip.x + drag.x, y: tip.y + drag.y });
    expect(axis?.kind).toBe("setAxis");
    if (axis?.kind !== "setAxis") return;
    expect(axis.at[0] - held.weapon.bodies[0]!.axis[1][0]).toBeCloseTo(local.x, 5);
    expect(axis.at[1] - held.weapon.bodies[0]!.axis[1][1]).toBeCloseTo(local.y, 5);
  });

  it("sets the hold with the move and turn handles, and a riding body's angle with its turn handle", () => {
    const held = sword();
    const rest = holdAtRest(rig, held);
    const moved = weaponDragEdit(rig, held, rest.pose, { kind: "weapon-move", body: "sword" }, { x: 4, y: -30 });
    expect(moved?.kind === "setHold" && moved.placement.body).toBe("sword");
    const daggers = heldOf(setup("daggers"), "daggers");
    const resting = holdAtRest(rig, daggers);
    const front = bodyTransforms(rig, resting.pose, resting.constraints.weapon!)[0]!;
    const hand = bodyPoint(front, daggers.weapon.bodies[0]!.grips[0]!.at);
    const turned = weaponDragEdit(rig, daggers, resting.pose, { kind: "weapon-turn", body: "dagger-front" }, { x: hand.x + 10, y: hand.y });
    expect(turned?.kind).toBe("setGripAngle");
    if (turned?.kind !== "setGripAngle") return;
    // With the new angle, the dagger's tip points from the hand toward the pointer.
    const weapon = { ...daggers.weapon, bodies: daggers.weapon.bodies.map((body, index) => (index === 0 ? { ...body, grips: [{ ...body.grips[0]!, angle: turned.angle }] } : body)) };
    const after = bodyTransforms(rig, resting.pose, { weapon, bodies: [] })[0]!;
    const tip = bodyPoint(after, weapon.bodies[0]!.axis[1]);
    expect(Math.atan2(tip.y - hand.y, tip.x - hand.x)).toBeCloseTo(0, 5);
    expect(weaponDragEdit(rig, daggers, resting.pose, { kind: "weapon-move", body: "dagger-front" }, hand)).toBeNull();
  });
});
