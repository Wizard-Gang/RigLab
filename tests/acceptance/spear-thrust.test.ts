// The RigLab recommendation's first acceptance test, run through the editor's own reducer and export path:
// import Hexframe's humanoid, lengthen its forearms, author a three-key spear thrust with planted feet and
// both hands on the spear, export the bundle, reload it, and prove connectivity, lengths and playback.
import { describe, expect, it } from "vitest";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { bakeAnimation } from "../../src/export/bake";
import type { RigLabBaked } from "../../src/export/bake";
import { buildBundle, EXPORT_ROOT, readBundle } from "../../src/export/bundle";
import { unzip, zip } from "../../src/export/zip";
import type { RigLabDocument, RigLabRig } from "../../src/format";
import { constraintsAt, dragInPose, rotate, samplePose, toggleGrip, togglePin } from "../../src/solve";
import type { HoldResult } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => {
  const next = actions.reduce(editorReducer, state);
  expect(next.status?.tone, next.status?.text).not.toBe("error");
  return next;
};

/** Apply a pin or grip toggle at the current frame, the way the Pose inspector does. */
function hold(state: EditorState, toggle: (rig: RigLabRig, pose: ReturnType<typeof samplePose>["pose"], constraints: ReturnType<typeof constraintsAt>) => HoldResult): EditorState {
  const rig = documentOf(state).rig;
  const animation = activeAnimationOf(state)!;
  const result = toggle(rig, samplePose(rig, animation, state.frame).pose, constraintsAt(animation, state.frame));
  if (!result.ok) throw new Error(result.error);
  return run(state, { type: "setPose", pose: samplePose(rig, animation, state.frame).pose, constraints: result.constraints, note: result.message });
}

/** Drag the spear's move handle to put the front hand at `target`, keying the current frame. */
function thrust(state: EditorState, frame: number, target: { x: number; y: number }): EditorState {
  const moved = run(state, { type: "setFrame", frame });
  const rig = documentOf(moved).rig;
  const animation = activeAnimationOf(moved)!;
  const drag = dragInPose(rig, samplePose(rig, animation, frame).pose, constraintsAt(animation, frame), { kind: "prop-move" }, target);
  expect(drag.status, drag.message ?? "").toBe("ok");
  return run(moved, { type: "setPose", pose: drag.pose, constraints: drag.constraints });
}

function author(): RigLabDocument {
  let state = run(initialState(), { type: "setMode", mode: "setup" });
  // Rig setup: lengthen both forearms from 23 to 27 units.
  state = run(state,
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-front", tip: [0, 27] } },
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-back", tip: [0, 27] } });
  state = run(state, { type: "addAnimation" }, { type: "renameAnimation", from: "animation", to: "spear-thrust" });
  state = run(state, { type: "setMode", mode: "pose" }, { type: "timeline", edit: { kind: "setTiming", length: 8 } });
  // Frame 0: plant both feet, then put both hands on one spear.
  for (const chain of ["leg-front", "leg-back"]) state = hold(state, (rig, pose, constraints) => togglePin(rig, pose, constraints, chain));
  for (const chain of ["arm-front", "arm-back"]) state = hold(state, (rig, pose, constraints) => toggleGrip(rig, pose, constraints, chain));
  // Wind-up with the elbows back, a transition with them centered, an extension with the hands pushed forward.
  state = thrust(state, 0, { x: 6, y: -50 });
  state = thrust(state, 3, { x: 34, y: -54 });
  state = thrust(state, 6, { x: 52, y: -62 });
  state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 3, interpolation: "linear" } });
  return documentOf(state);
}

const BONE_LENGTH_TOLERANCE = 1e-5;

/** World position of a baked bone's point, from its baked transform. */
function pointOf(baked: RigLabBaked, frame: number, bone: string, local: readonly [number, number]) {
  const [x, y, rotation] = baked.frames[frame]![baked.bones.indexOf(bone)]!;
  const offset = rotate({ x: local[0], y: local[1] }, rotation);
  return { x: x + offset.x, y: y + offset.y };
}

describe("spear-thrust acceptance", () => {
  it("authors, exports and reloads a constrained three-key thrust with every joint connected and every length kept", async () => {
    const document = author();
    const animation = document.animations.find((candidate) => candidate.name === "spear-thrust")!;
    expect(animation.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "hold"], [3, "linear"], [6, "hold"]]);
    expect(animation.keys.every((key) => key.pins?.length === 2 && key.prop?.grips.length === 2)).toBe(true);

    const files = await buildBundle(document, { baked: true, generator: "RigLab acceptance" });
    const archive = zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])));
    const reloaded = await readBundle(await unzip(archive));
    if (!reloaded.ok) throw new Error(reloaded.errors.join("\n"));
    expect(reloaded.value).toEqual(document);

    const rig = reloaded.value.rig;
    const again = reloaded.value.animations.find((candidate) => candidate.name === "spear-thrust")!;
    const baked: RigLabBaked = JSON.parse(new TextDecoder().decode(files.get("baked/spear-thrust.baked.json")!));
    expect(bakeAnimation(rig, again)).toEqual(baked);
    expect(rig.bones.find((bone) => bone.name === "forearm-front")!.tip).toEqual([0, 27]);

    for (let frame = 0; frame < baked.frames.length; frame += 1) {
      expect(samplePose(rig, again, frame)).toEqual(samplePose(document.rig, animation, frame));
      for (const bone of rig.bones) {
        if (bone.parent !== null) {
          // Connected: each joint sits exactly at its offset from the parent's joint, so the limb keeps its length.
          const joint = pointOf(baked, frame, bone.name, [0, 0]);
          const expected = pointOf(baked, frame, bone.parent, bone.offset);
          expect(Math.hypot(joint.x - expected.x, joint.y - expected.y), `${bone.name} at frame ${frame}`).toBeLessThan(BONE_LENGTH_TOLERANCE);
        }
        if (bone.tip) {
          const start = pointOf(baked, frame, bone.name, [0, 0]);
          const end = pointOf(baked, frame, bone.name, bone.tip);
          expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(Math.hypot(...bone.tip), 5);
        }
      }
      for (const pin of constraintsAt(again, frame).pins) {
        const shin = pin.chain === "leg-front" ? "shin-front" : "shin-back";
        const foot = pointOf(baked, frame, shin, rig.bones.find((bone) => bone.name === shin)!.tip!);
        expect(Math.hypot(foot.x - pin.x, foot.y - pin.y), `${pin.chain} planted at frame ${frame}`).toBeLessThan(BONE_LENGTH_TOLERANCE);
      }
    }

    const shoulder = (frame: number) => pointOf(baked, frame, "arm-front", [0, 0]);
    const elbow = (frame: number) => pointOf(baked, frame, "forearm-front", [0, 0]);
    const hand = (frame: number) => pointOf(baked, frame, "forearm-front", [0, 27]);
    expect(elbow(0).x).toBeLessThan(shoulder(0).x - 5);
    expect(Math.abs(elbow(3).x - shoulder(3).x)).toBeLessThan(6);
    expect(hand(6).x).toBeGreaterThan(shoulder(6).x + 35);
    expect(elbow(6).x).toBeGreaterThan(shoulder(6).x);
  });
});
