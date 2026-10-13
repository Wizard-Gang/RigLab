// One acceptance run per weapon, through the editor's own reducer and export path: the chibi plants both feet, picks
// the weapon at each of an attack's four keys and swings it, then the bundle is exported with baked frames, zipped,
// unzipped and reloaded. Every frame must keep the skeleton connected, the feet planted and the weapon in hand, and
// Hexframe must play the exported clip exactly as RigLab baked it.
import { describe, expect, it } from "vitest";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { activeAnimationOf, documentOf, editorReducer, initialState } from "../../src/editor/state";
import type { Action, EditorState } from "../../src/editor/state";
import { bakeAnimation } from "../../src/export/bake";
import type { RigLabBaked } from "../../src/export/bake";
import { buildBundle, EXPORT_ROOT, readBundle } from "../../src/export/bundle";
import { unzip, zip } from "../../src/export/zip";
import type { RigLabDocument } from "../../src/format";
import { toHexframeClip } from "../../src/hexframe/adapter";
import { constraintsAt, dragInPose, engineOf, gripCenter, place, playAt, rotate, samplePose, togglePin } from "../../src/solve";
import type { DragHandle } from "../../src/solve";
import { weaponNamed } from "../../src/weapons/weapons";

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
  const document = documentOf(state);
  const animation = activeAnimationOf(state)!;
  const constraints = constraintsAt(animation, state.frame, document.weapons);
  const solved = dragInPose(document.rig, samplePose(document.rig, animation, state.frame, document.weapons).pose, constraints, handle, target);
  return actions(state, { type: "setPose", pose: solved.pose, constraints: solved.constraints, warning: solved.message });
}

/** Apply actions that may report a warning, such as a drag passing out of reach. */
const actions = (state: EditorState, ...list: Action[]): EditorState => list.reduce(editorReducer, state);

/** The key at the current frame holds every pin and grip. */
function holds(state: EditorState): EditorState {
  const document = documentOf(state);
  expect(samplePose(document.rig, activeAnimationOf(state)!, state.frame, document.weapons).violations, `frame ${state.frame}`).toEqual([]);
  return state;
}

/** Plant a foot where it stands at the current frame, the way Pin end does. */
function pin(state: EditorState, chain: string): EditorState {
  const document = documentOf(state);
  const animation = activeAnimationOf(state)!;
  const pose = samplePose(document.rig, animation, state.frame, document.weapons).pose;
  const result = togglePin(document.rig, pose, constraintsAt(animation, state.frame, document.weapons), chain);
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

function author(name: string): RigLabDocument {
  let state = run(initialState(), { type: "addAnimation", kind: "attack" }, { type: "renameAnimation", from: "attack", to: `${name}-attack` }, { type: "setMode", mode: "pose" });
  const weapon = weaponNamed(name)!;
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
  return documentOf(state);
}

/** World position of a point in a baked transform's frame. */
const pointIn = ([x, y, rotation]: readonly [number, number, number], local: readonly [number, number]) => {
  const offset = rotate({ x: local[0], y: local[1] }, rotation);
  return { x: x + offset.x, y: y + offset.y };
};
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("weapon acceptance", () => {
  for (const name of ["sword", "spear", "axe", "daggers"]) {
    it(`authors, exports and reloads a ${name} attack with the skeleton connected, the feet planted and the ${name} in hand`, async () => {
      const document = author(name);
      const animation = document.animations[0]!;
      expect(animation.keys.map((key) => [key.frame, key.weapon?.name, key.pins?.length])).toEqual([0, 8, 16, 24].map((frame) => [frame, name, 2]));
      const files = await buildBundle(document, { baked: true, generator: "RigLab acceptance" });
      const reloaded = await readBundle(await unzip(zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])))));
      if (!reloaded.ok) throw new Error(reloaded.errors.join("\n"));
      expect(reloaded.value).toEqual(document);

      const { rig, weapons } = reloaded.value;
      const again = reloaded.value.animations[0]!;
      const baked: RigLabBaked = JSON.parse(new TextDecoder().decode(files.get(`baked/${again.name}.baked.json`)!));
      expect(bakeAnimation(rig, again, weapons)).toEqual(baked);
      const clip = toHexframeClip(rig, again, weapons);
      const [engine, original] = [engineOf(rig, again, weapons), engineOf(document.rig, animation, document.weapons)];
      const weapon = weapons!.find((candidate) => candidate.name === name)!;
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
