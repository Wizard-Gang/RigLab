// The RigLab recommendation's first acceptance test, run through the editor's own reducer and export path:
// start the chibi, lengthen its forearms, author a spear-thrust attack (keys at 0, 8, 16 and 24) with planted feet
// and both hands on the library's spear, export the bundle, reload it, and prove connectivity, lengths, grips and
// playback, and that Hexframe plays the exported clip exactly as RigLab baked it.
import { describe, expect, it } from "vitest";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { bakeAnimation } from "../../src/export/bake";
import type { RigLabBaked, Transform } from "../../src/export/bake";
import { buildBundle, EXPORT_ROOT, readBundle } from "../../src/export/bundle";
import { unzip, zip } from "../../src/export/zip";
import type { RigLabDocument } from "../../src/format";
import { toHexframeClip } from "../../src/hexframe/adapter";
import { constraintsAt, dragInPose, engineOf, place, playAt, rotate, samplePose, togglePin } from "../../src/solve";

const run = (state: EditorState, ...actions: Action[]): EditorState => {
  const next = actions.reduce(editorReducer, state);
  expect(next.status?.tone, next.status?.text).not.toBe("error");
  return next;
};

/** Plant a foot where it stands at the current frame, the way Pin end does. */
function pin(state: EditorState, chain: string): EditorState {
  const { rig, weapons } = documentOf(state);
  const animation = activeAnimationOf(state)!;
  const pose = samplePose(rig, animation, state.frame, weapons).pose;
  const result = togglePin(rig, pose, constraintsAt(animation, state.frame, weapons), chain);
  if (!result.ok) throw new Error(result.error);
  return run(state, { type: "setPose", pose, constraints: result.constraints, note: result.message });
}

/** Drag the spear's move handle to put the midpoint of its grips at `target`, keying the current frame. */
function thrust(state: EditorState, target: { x: number; y: number }): EditorState {
  const { rig, weapons } = documentOf(state);
  const animation = activeAnimationOf(state)!;
  const constraints = constraintsAt(animation, state.frame, weapons);
  const drag = dragInPose(rig, samplePose(rig, animation, state.frame, weapons).pose, constraints, { kind: "weapon-move", body: "spear" }, target);
  expect(drag.status, drag.message ?? "").toBe("ok");
  return run(state, { type: "setPose", pose: drag.pose, constraints: drag.constraints });
}

function author(): RigLabDocument {
  let state = run(initialState(), { type: "setMode", mode: "setup" });
  // Rig setup: lengthen both forearms from 11 to 14 units.
  state = run(state,
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-front", tip: [0, 14] } },
    { type: "rigEdit", edit: { kind: "setTip", bone: "forearm-back", tip: [0, 14] } });
  // The seeded attack has four keys, at 0, 8, 16 and 24 on Hexframe's clock.
  state = run(state, { type: "activateAnimation", name: "attack" }, { type: "renameAnimation", from: "attack", to: "spear-thrust" });
  state = run(state, { type: "setMode", mode: "pose" });
  // At each key: plant both feet, take the spear at its ready hold, then drag it, level, by its grips' midpoint, so
  // the front hand sits 8 units ahead of the target. The keys are a wind-up with the elbows back, a transition with
  // them centered, an extension with the hands pushed forward, and the recovery.
  const windUp = { x: -1.5, y: -35 };
  for (const [frame, target] of [[0, windUp], [8, { x: 12.5, y: -37 }], [16, { x: 21.5, y: -41 }], [24, windUp]] as const) {
    state = pin(pin(run(state, { type: "setFrame", frame }), "leg-front"), "leg-back");
    state = thrust(run(state, { type: "holdWeapon", name: "spear" }), target);
  }
  state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
  return documentOf(state);
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
  it("authors, exports and reloads a spear thrust with every joint connected, every length kept and both hands on the spear", async () => {
    const document = author();
    const animation = document.animations.find((candidate) => candidate.name === "spear-thrust")!;
    expect([animation.kind, animation.fps, animation.length, animation.loop]).toEqual(["attack", 60, 24, false]);
    expect(animation.keys.map((key) => [key.frame, key.interpolation])).toEqual([[0, "smoothstep"], [8, "linear"], [16, "smoothstep"], [24, "smoothstep"]]);
    expect(animation.keys.every((key) => key.pins?.length === 2 && key.weapon?.name === "spear")).toBe(true);

    const files = await buildBundle(document, { baked: true, generator: "RigLab acceptance" });
    const archive = zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])));
    const reloaded = await readBundle(await unzip(archive));
    if (!reloaded.ok) throw new Error(reloaded.errors.join("\n"));
    expect(reloaded.value).toEqual(document);

    const { rig, weapons } = reloaded.value;
    const again = reloaded.value.animations.find((candidate) => candidate.name === "spear-thrust")!;
    const baked: RigLabBaked = JSON.parse(new TextDecoder().decode(files.get("baked/spear-thrust.baked.json")!));
    expect(bakeAnimation(rig, again, weapons)).toEqual(baked);
    expect(rig.bones.find((bone) => bone.name === "forearm-front")!.tip).toEqual([0, 14]);
    expect(baked.frames).toHaveLength(25);
    const clip = toHexframeClip(rig, again, weapons);
    expect([clip.duration, clip.poses.length]).toEqual([24, 13]);
    const [engine, original] = [engineOf(rig, again, weapons), engineOf(document.rig, animation, document.weapons)];
    const spear = weapons!.find((weapon) => weapon.name === "spear")!.bodies[0]!;

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
