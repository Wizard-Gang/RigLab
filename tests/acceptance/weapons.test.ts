// One acceptance run per weapon, through the editor's own reducer and export path: the chibi plants both feet, picks
// the weapon at each of an attack's four keys and swings it, then the bundle is exported with baked frames and what it
// wrote is checked. Every frame must keep the skeleton connected, the feet planted and the weapon in hand, and Hexframe
// must play the exported clip exactly as RigLab baked it.
import { describe, expect, it } from "vitest";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { weaponRigs } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { activeAnimationOf, editorReducer, initialState, modelOf } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import type { RigLabBaked } from "../../src/export/bake";
import { buildBundle } from "../../src/export/bundle";
import { toHexframeClip } from "../../src/hexframe/adapter";
import { constraintsAt, dragInPose, engineOf, gripCenter, place, playAt, rotate, samplePose, togglePin } from "../../src/solve";
import type { DragHandle } from "../../src/solve";
import { LIBRARY } from "../../src/library/active";
import { written } from "../export/written";

const TOLERANCE = 1e-5;
/** Hexframe interpolates joint angles between its 13 poses, not grips, so a free body's grips may drift this far there. */
const BETWEEN_POSES = 0.5;

const run = (state: EditorState, ...actions: Action[]): EditorState => {
  const next = actions.reduce(editorReducer, state);
  expect(next.status?.tone, next.status?.text).not.toBe("error");
  return next;
};

/**
 * Drag a handle at the current frame as the canvas does, keying the solved pose and holds. A drag on the way to a
 * key's swing may pass out of reach, as on the canvas; only the finished key must hold.
 */
function drag(state: EditorState, handle: DragHandle, target: { x: number; y: number }): EditorState {
  const model = modelOf(state);
  const animation = activeAnimationOf(state)!;
  const constraints = constraintsAt(animation, state.frame, weaponRigs(model));
  const solved = dragInPose(model.rig, samplePose(model.rig, animation, state.frame, weaponRigs(model)).pose, constraints, handle, target);
  return actions(state, { type: "setPose", pose: solved.pose, constraints: solved.constraints, warning: solved.message });
}

/** Apply actions that may report a warning, such as a drag passing out of reach. */
const actions = (state: EditorState, ...list: Action[]): EditorState => list.reduce(editorReducer, state);

/** The key at the current frame holds every pin and grip. */
function holds(state: EditorState): EditorState {
  const model = modelOf(state);
  expect(samplePose(model.rig, activeAnimationOf(state)!, state.frame, weaponRigs(model)).violations, `frame ${state.frame}`).toEqual([]);
  return state;
}

/** Plant a foot where it stands at the current frame, the way Pin end does. */
function pin(state: EditorState, chain: string): EditorState {
  const model = modelOf(state);
  const animation = activeAnimationOf(state)!;
  const pose = samplePose(model.rig, animation, state.frame, weaponRigs(model)).pose;
  const result = togglePin(model.rig, pose, constraintsAt(animation, state.frame, weaponRigs(model)), chain);
  if (!result.ok) throw new Error(result.error);
  return run(state, { type: "setPose", pose, constraints: result.constraints, note: result.message });
}

/** A free body's swing at one key: where its grips' midpoint goes and its rotation. */
interface Swing { readonly at: { x: number; y: number }; readonly rotation: number }
/** For the daggers: where each hand goes. */
interface Hands { readonly front: { x: number; y: number }; readonly back: { x: number; y: number } }

const SWINGS: Record<string, readonly (Swing | Hands)[]> = {
  sword: [{ at: { x: 1, y: -35 }, rotation: 20 }, { at: { x: 6, y: -33 }, rotation: 80 }, { at: { x: 5, y: -30 }, rotation: 100 }, { at: { x: 3, y: -30 }, rotation: 55 }],
  spear: [{ at: { x: -3, y: -34 }, rotation: -10 }, { at: { x: 5, y: -33 }, rotation: 0 }, { at: { x: 8, y: -31 }, rotation: 10 }, { at: { x: 0, y: -32 }, rotation: 0 }],
  axe: [{ at: { x: 0, y: -36 }, rotation: -10 }, { at: { x: 6, y: -34 }, rotation: 60 }, { at: { x: 6, y: -30 }, rotation: 95 }, { at: { x: 3, y: -32 }, rotation: 35 }],
  daggers: [
    { front: { x: 16, y: -48 }, back: { x: -2, y: -47 } },
    { front: { x: 24, y: -40 }, back: { x: 4, y: -44 } },
    { front: { x: 22, y: -30 }, back: { x: 10, y: -40 } },
    { front: { x: 16, y: -48 }, back: { x: -2, y: -47 } },
  ],
};

function author(name: string): LibraryModel {
  let state = run(initialState(), { type: "activateAnimation", name: "attack" }, { type: "renameAnimation", from: "attack", to: `${name}-attack` }, { type: "setMode", mode: "pose" });
  const weapon = LIBRARY.weapons.find((item) => item.name === name)!.weapon;
  for (const [index, frame] of [0, 8, 16, 24].entries()) {
    state = run(state, { type: "setFrame", frame });
    state = pin(pin(state, "leg-front"), "leg-back");
    state = run(state, { type: "holdWeapon", name });
    const swing = SWINGS[name]![index]!;
    if ("front" in swing) {
      state = drag(state, { kind: "tip", bone: "forearm-front" }, swing.front);
      state = holds(drag(state, { kind: "tip", bone: "forearm-back" }, swing.back));
      continue;
    }
    const body = weapon.bodies[0]!;
    state = drag(state, { kind: "weapon-move", body: body.name }, swing.at);
    // Turn about the grips' midpoint until the body's rotation is the swing's.
    const center = gripCenter(body);
    const toward = rotate({ x: body.axis[1][0] - center[0], y: body.axis[1][1] - center[1] }, swing.rotation);
    state = holds(drag(state, { kind: "weapon-turn", body: body.name }, { x: swing.at.x + toward.x, y: swing.at.y + toward.y }));
    expect(activeAnimationOf(state)!.keys.find((key) => key.frame === frame)!.weapon!.bodies[0]!.rotation).toBeCloseTo(swing.rotation, 5);
  }
  state = run(state, { type: "timeline", edit: { kind: "setInterpolation", frame: 8, interpolation: "linear" } });
  return modelOf(state);
}

/** World position of a point in a baked transform's frame. */
const pointIn = ([x, y, rotation]: readonly [number, number, number], local: readonly [number, number]) => {
  const offset = rotate({ x: local[0], y: local[1] }, rotation);
  return { x: x + offset.x, y: y + offset.y };
};
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("weapon acceptance", () => {
  for (const name of ["sword", "spear", "axe", "daggers"]) {
    it(`authors and exports a ${name} attack with the skeleton connected, the feet planted and the ${name} in hand`, async () => {
      const model = author(name);
      const named = (animations: LibraryModel["animations"]) => animations.find((item) => item.name === `${name}-attack`)!;
      const animation = named(model.animations);
      expect(animation.keys.map((key) => [key.frame, key.weapon?.name, key.pins?.length])).toEqual([0, 8, 16, 24].map((frame) => [frame, name, 2]));
      // The bundle's files are the model's own, and its baked frames are a fresh bake of them.
      const bundle = await written(await buildBundle(model, { baked: true, generator: "RigLab acceptance" }), model);
      const { rig, weapons } = bundle;
      const again = named(bundle.animations);
      const baked: RigLabBaked = bundle.baked.get(again.name)!;
      const clip = toHexframeClip(rig, again, weapons);
      const [engine, original] = [engineOf(rig, again, weapons), engineOf(model.rig, animation, weaponRigs(model))];
      const weapon = weapons.find((candidate) => candidate.name === name)!;
      const transformOf = (frame: number, bone: string) => baked.frames[frame]![baked.bones.indexOf(bone)]!;
      let drift = 0;

      for (let frame = 0; frame < baked.frames.length; frame += 1) {
        expect(playAt(engine, frame)).toEqual(playAt(original, frame));
        const hexframe = place(rig, sampleClip(clip, frame));
        baked.bones.forEach((bone, index) => {
          const [x, y, rotation] = baked.frames[frame]![index]!;
          const at = hexframe.get(bone)!;
          expect(Math.abs(x - at.x) + Math.abs(y - at.y) + Math.abs(rotation - (at.rotation * 180) / Math.PI), `${bone} at frame ${frame}`).toBeLessThan(TOLERANCE);
        });
        for (const bone of rig.bones) {
          if (bone.parent !== null) expect(gap(pointIn(transformOf(frame, bone.name), [0, 0]), pointIn(transformOf(frame, bone.parent), bone.offset))).toBeLessThan(TOLERANCE);
          if (bone.tip) expect(gap(pointIn(transformOf(frame, bone.name), [0, 0]), pointIn(transformOf(frame, bone.name), bone.tip))).toBeCloseTo(Math.hypot(...bone.tip), 5);
        }
        for (const foot of constraintsAt(again, frame, weapons).pins) {
          const shin = rig.chains.find((chain) => chain.name === foot.chain)!.lower;
          expect(gap(pointIn(transformOf(frame, shin), rig.bones.find((bone) => bone.name === shin)!.tip!), foot), `${foot.chain} at frame ${frame}`).toBeLessThan(TOLERANCE);
        }
        const held = baked.weapons![frame]!;
        expect(held.name).toBe(name);
        const onPose = (frame * 12) % again.length === 0;
        for (const body of weapon.bodies) {
          for (const grip of body.grips) {
            const lower = rig.chains.find((chain) => chain.name === grip.chain)!.lower;
            const hand = pointIn(transformOf(frame, lower), rig.bones.find((bone) => bone.name === lower)!.tip!);
            const miss = gap(pointIn(held.bodies[body.name]!, grip.at), hand);
            if (body.grips.length === 1 || onPose) expect(miss, `${body.name} grip '${grip.name}' at frame ${frame}`).toBeLessThan(TOLERANCE);
            else drift = Math.max(drift, miss);
            if (body.grips.length === 1) {
              const turn = held.bodies[body.name]![2] - transformOf(frame, lower)[2] - grip.angle!;
              expect(Math.abs((((turn % 360) + 540) % 360) - 180), `${body.name} along its forearm at frame ${frame}`).toBeLessThan(TOLERANCE);
            }
          }
        }
      }
      expect(drift).toBeLessThan(BETWEEN_POSES);
      // The swing really moves: across its keys the first body travels at least 4 units or turns at least 20°.
      const keyed = [0, 8, 16, 24].map((frame) => baked.weapons![frame]!.bodies[weapon.bodies[0]!.name]!);
      const travel = Math.max(...keyed.flatMap((a) => keyed.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
      const turn = Math.max(...keyed.map((transform) => transform[2])) - Math.min(...keyed.map((transform) => transform[2]));
      expect(travel >= 4 || turn >= 20, `travel ${travel.toFixed(2)}, turn ${turn.toFixed(2)}`).toBe(true);
    });
  }
});
