// The RigLab recommendation's first acceptance test, run through the editor's own reducer and export path:
// start the chibi, lengthen its forearms, author the spear class's attack as a thrust (keys at 0, 8, 16 and 24) with
// planted feet and both hands on the library's spear, export the bundle, check what it wrote, and prove connectivity,
// lengths, grips and playback, and that Hexframe plays the exported clip exactly as RigLab baked it.
import { describe, expect, it } from "vitest";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { startClassAnimation } from "../../src/editor/classes";
import { libraryModel, weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import type { RigLabBaked, Transform } from "../../src/export/bake";
import { buildBundle } from "../../src/export/bundle";
import { toHexframeClip } from "../../src/hexframe/adapter";
import { LIBRARY } from "../../src/library/active";
import { constraintsAt, dragInPose, engineOf, place, playAt, rotate, samplePose, togglePin } from "../../src/solve";
import { written } from "../export/written";

const run = (state: EditorState, ...actions: Action[]): EditorState => {
  const next = actions.reduce(editorReducer, state);
  expect(next.status?.tone, next.status?.text).not.toBe("error");
  return next;
};

/** Plant a foot where it stands at the current frame, the way Pin end does. */
function pin(state: EditorState, chain: string): EditorState {
  const { rig } = modelOf(state);
  const weapons = weaponRigs(modelOf(state));
  const animation = activeAnimationOf(state)!;
  const pose = samplePose(rig, animation, state.frame, weapons).pose;
  const result = togglePin(rig, pose, constraintsAt(animation, state.frame, weapons), chain);
  if (!result.ok) throw new Error(result.error);
  return run(state, { type: "setPose", pose, constraints: result.constraints, note: result.message });
}

/** Drag the spear's move handle to put the midpoint of its grips at `target`, keying the current frame. */
function thrust(state: EditorState, target: { x: number; y: number }): EditorState {
  const { rig } = modelOf(state);
  const weapons = weaponRigs(modelOf(state));
  const animation = activeAnimationOf(state)!;
  const constraints = constraintsAt(animation, state.frame, weapons);
  const drag = dragInPose(rig, samplePose(rig, animation, state.frame, weapons).pose, constraints, { kind: "weapon-move", body: "spear" }, target);
  expect(drag.status, drag.message ?? "").toBe("ok");
  return run(state, { type: "setPose", pose: drag.pose, constraints: drag.constraints });
}

function author(): LibraryModel {
  // The spear class's attack starts from the unarmed attack, with the spear at its hold and both hands on it.
  const spear = LIBRARY.weapons.find((item) => item.name === "spear")!;
  const model = libraryModel(LIBRARY);
  const started = startClassAnimation(LIBRARY.rig, spear, "attack", model.animations.find((animation) => animation.name === "unarmed-attack")).animation;
  let state = run(initialState({ ...model, animations: [...model.animations, started] }), { type: "setMode", mode: "setup" });
  // Rig setup: lengthen both forearms from 11 to 14 units.
  state = run(state,
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-front", tip: [0, 14] } },
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-back", tip: [0, 14] } });
  // The attack has four keys, at 0, 8, 16 and 24 on Hexframe's clock, and every one holds the spear.
  state = run(state, { type: "activateAnimation", name: "spear-attack" }, { type: "setMode", mode: "animate" });
  // At each key: plant both feet, then drag the spear, level, by its grips' midpoint, so the front hand sits 8 units
  // ahead of the target. The keys are a wind-up with the elbows back, a transition with them centered, an extension with
  // the hands pushed forward, and the recovery.
  const windUp = { x: -1.5, y: -35 };
  for (const [frame, target] of [[0, windUp], [8, { x: 12.5, y: -37 }], [16, { x: 21.5, y: -41 }], [24, windUp]] as const) {
    state = pin(pin(run(state, { type: "setFrame", frame }), "leg-front"), "leg-back");
    state = thrust(state, target);
  }
  state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
  return modelOf(state);
}

const BONE_LENGTH_TOLERANCE = 1e-5;

/** World position of a point in a baked transform's frame. */
function pointIn([x, y, rotation]: Transform, local: readonly [number, number]) {
  const offset = rotate({ x: local[0], y: local[1] }, rotation);
  return { x: x + offset.x, y: y + offset.y };
}

/** World position of a baked bone's point, from its baked transform. */
const pointOf = (baked: RigLabBaked, frame: number, bone: string, local: readonly [number, number]) => pointIn(baked.frames[frame]![baked.bones.indexOf(bone)]!, local);

describe("spear-thrust acceptance", () => {
  it("authors and exports a spear thrust with every joint connected, every length kept and both hands on the spear", async () => {
    const model = author();
    const animation = model.animations.find((candidate) => candidate.name === "spear-attack")!;
    expect([animation.class, animation.kind, animation.fps, animation.length, animation.loop]).toEqual(["spear", "attack", 60, 24, false]);
    expect(animation.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "smoothstep"], [8, "linear"], [16, "smoothstep"], [24, "smoothstep"]]);
    expect(animation.keys.every((key) => key.pins?.length === 2 && key.bodies?.length === 1)).toBe(true);

    // The bundle's files are the model's own, and its baked frames are a fresh bake of them.
    const bundle = await written(await buildBundle(model, { baked: true, generator: "RigLab acceptance" }), model);
    const { rig, weapons } = bundle;
    const again = bundle.animations.find((candidate) => candidate.name === "spear-attack")!;
    const baked: RigLabBaked = bundle.baked.get("spear-attack")!;
    expect(rig.bones.find((bone) => bone.name === "forearm-front")!.tip).toEqual([0, 14]);
    expect(baked.frames).toHaveLength(25);
    const clip = toHexframeClip(rig, again, weapons);
    expect([clip.duration, clip.poses.length]).toEqual([24, 13]);
    const [engine, original] = [engineOf(rig, again, weapons), engineOf(model.rig, animation, weaponRigs(model))];
    const spear = weapons.find((weapon) => weapon.name === "spear")!.bodies[0]!;

    for (let frame = 0; frame < baked.frames.length; frame += 1) {
      expect(playAt(engine, frame)).toEqual(playAt(original, frame));
      // Hexframe's own sampler on the exported clip lands every bone where RigLab baked it.
      const hexframe = place(rig, sampleClip(clip, frame));
      baked.bones.forEach((bone, index) => {
        const [x, y, rotation] = baked.frames[frame]![index]!;
        const at = hexframe.get(bone)!;
        expect(Math.abs(x - at.x) + Math.abs(y - at.y) + Math.abs(rotation - (at.rotation * 180) / Math.PI), `${bone} at frame ${frame}`).toBeLessThan(BONE_LENGTH_TOLERANCE);
      });
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
      for (const pin of constraintsAt(again, frame, weapons).pins) {
        const shin = pin.chain === "leg-front" ? "shin-front" : "shin-back";
        const foot = pointOf(baked, frame, shin, rig.bones.find((bone) => bone.name === shin)!.tip!);
        expect(Math.hypot(foot.x - pin.x, foot.y - pin.y), `${pin.chain} planted at frame ${frame}`).toBeLessThan(BONE_LENGTH_TOLERANCE);
      }
      // Both hands hold the spear's grips on each of Hexframe's 13 poses; between them Hexframe lerps angles, not grips.
      expect(baked.weapons![frame]!.name).toBe("spear");
      if ((frame * 12) % again.length !== 0) continue;
      for (const grip of spear.grips) {
        const forearm = grip.chain === "arm-front" ? "forearm-front" : "forearm-back";
        const hand = pointOf(baked, frame, forearm, [0, 14]);
        const at = pointIn(baked.weapons![frame]!.bodies.spear!, grip.at);
        expect(Math.hypot(hand.x - at.x, hand.y - at.y), `${grip.name} grip at frame ${frame}`).toBeLessThan(BONE_LENGTH_TOLERANCE);
      }
    }

    const shoulder = (frame: number) => pointOf(baked, frame, "arm-front", [0, 0]);
    const elbow = (frame: number) => pointOf(baked, frame, "forearm-front", [0, 0]);
    const hand = (frame: number) => pointOf(baked, frame, "forearm-front", [0, 14]);
    expect(elbow(0).x).toBeLessThan(shoulder(0).x - 5);
    expect(Math.abs(elbow(8).x - shoulder(8).x)).toBeLessThan(4);
    expect(hand(16).x).toBeGreaterThan(shoulder(16).x + 17);
    expect(elbow(16).x).toBeGreaterThan(shoulder(16).x);
    expect(elbow(24).x).toBeLessThan(shoulder(24).x - 5);
  });
});
