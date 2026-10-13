import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { blankAnimation } from "../../src/editor/animations";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { templateDocument } from "../../src/editor/templates";
import { validateDocument } from "../../src/format/document";
import type { RigLabDocument } from "../../src/format/document";
import { constraintsAt, engineOf, playAt, setRotation } from "../../src/solve";
import { STAFF } from "../format/weapon-fixtures";

const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const held = { name: "staff", bodies: [{ body: "staff", x: -6, y: -30, rotation: 0 }] };

/** A saved document whose attack holds the staff on every key. */
function armed(): RigLabDocument {
  const attack = blankAnimation(CHIBI_RIG, "attack", "attack");
  return { ...templateDocument(), animations: [{ ...attack, keys: attack.keys.map((key) => ({ ...key, weapon: held })) }], weapons: [STAFF] };
}

describe("an opened document that holds a weapon", () => {
  it("keeps the weapon through pose drops, timeline edits and undo", () => {
    let state = run(initialState(), { type: "open", document: armed(), fileName: "armed.riglab.json" }, { type: "setMode", mode: "pose" }, { type: "setFrame", frame: 8 });
    const document = documentOf(state);
    const played = playAt(engineOf(document.rig, activeAnimationOf(state)!, document.weapons), 8);
    expect(played.violations).toEqual([]);
    const turned = setRotation(document.rig, played.pose, "head", 12);
    state = run(state, { type: "setPose", pose: turned.pose, constraints: played.constraints });
    expect(state.status?.tone).toBe("info");
    state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
    const animation = activeAnimationOf(state)!;
    expect(animation.keys.map((key) => [key.interpolation, key.weapon])).toEqual([
      ["smoothstep", held], ["linear", held], ["smoothstep", held], ["smoothstep", held],
    ]);
    expect(animation.keys[1]!.pose.head).toEqual({ rotation: 12 });
    expect(validateDocument(documentOf(state)).ok).toBe(true);
    expect(constraintsAt(animation, 4, documentOf(state).weapons).weapon?.weapon).toBe(STAFF);
    const undone = run(state, { type: "undo" }, { type: "undo" });
    expect(documentOf(undone)).toEqual(armed());
  });
});
