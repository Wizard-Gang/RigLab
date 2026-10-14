import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/library/active";
import { blankAnimation } from "../../src/editor/animations";
import { libraryModel, validateModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { constraintsAt, engineOf, playAt, setRotation } from "../../src/solve";
import { HOLDS, STAFF } from "../format/weapon-fixtures";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const held = { name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] };

/** A saved library whose only weapon is the staff, and whose attack holds it on every key. */
function armed(): LibraryModel {
  const attack = blankAnimation(LIBRARY.rig, "attack", "attack");
  return { ...libraryModel(LIBRARY), animations: [{ ...attack, keys: attack.keys.map((key) => ({ ...key, weapon: held })) }], weapons: [{ weapon: STAFF, hold: HOLDS.staff! }] };
}

describe("a library whose animation holds a weapon", () => {
  it("keeps the weapon through pose drops, timeline edits and undo", () => {
    let state = run(initialState(armed()), { type: "setMode", mode: "pose" }, { type: "setFrame", frame: 8 });
    const model = modelOf(state);
    const played = playAt(engineOf(model.rig, activeAnimationOf(state)!, weaponRigs(model)), 8);
    expect(played.violations).toEqual([]);
    const turned = setRotation(model.rig, played.pose, "head", 12);
    state = run(state, { type: "setPose", pose: turned.pose, constraints: played.constraints });
    expect(state.status?.tone).toBe("info");
    state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
    const animation = activeAnimationOf(state)!;
    expect(animation.keys.map((key) => [key.interpolation, key.weapon])).toEqual([
      ["smoothstep", held], ["linear", held], ["smoothstep", held], ["smoothstep", held],
    ]);
    expect(animation.keys[1]!.pose.head).toEqual({ rotation: 12 });
    expect(validateModel(modelOf(state)).ok).toBe(true);
    expect(constraintsAt(animation, 4, weaponRigs(modelOf(state))).weapon?.weapon).toBe(STAFF);
    const undone = run(state, { type: "undo" }, { type: "undo" });
    expect(modelOf(undone)).toEqual(armed());
  });
});
