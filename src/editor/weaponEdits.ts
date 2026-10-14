// Pose-mode weapon picks: a key takes one of the library's weapons at its hold, or lets go.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { HeldWeapon } from "../format/constraints";
import type { RigLabRig } from "../format/rig";
import { frameList } from "../format/timing";
import { weaponChains } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import { rotate, tidy } from "../solve/angles";
import { constraintsOf, holdConstraints } from "../solve/constraints";
import { place } from "../solve/pose";
import { edit } from "./core";
import { weaponRigs } from "./model";
import { setKeyPose } from "./poseEdits";
import { activeAnimationOf, error, info, modelOf } from "./types";
import type { EditorState } from "./types";

/** A weapon's hold for the chibi at rest, carried to where the body stands: the frame the gripping arms hang from. */
export function carryReady(rig: RigLabRig, pose: Pose, held: HeldWeapon, weapon: RigLabWeapon): HeldWeapon {
  const chain = rig.chains.find((candidate) => candidate.name === weaponChains(weapon)[0]);
  const anchor = rig.bones.find((bone) => bone.name === chain?.upper)?.parent;
  if (!anchor) return held;
  const rest = place(rig, {}).get(anchor)!;
  const now = place(rig, pose).get(anchor)!;
  const turn = ((now.rotation - rest.rotation) * 180) / Math.PI;
  return {
    ...held,
    bodies: held.bodies.map((placement) => {
      const offset = rotate({ x: placement.x - rest.x, y: placement.y - rest.y }, turn);
      return { body: placement.body, x: tidy(now.x + offset.x), y: tidy(now.y + offset.y), rotation: tidy(placement.rotation + turn) };
    }),
  };
}

/** Pick a weapon for the key at the current frame, or let go of it with `null`, as one undo step. */
export function weaponEdit(state: EditorState, name: string | null): EditorState {
  if (state.mode !== "pose") return { ...state, status: error("Switch to Pose to hold a weapon") };
  const model = modelOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation to hold a weapon") };
  const key = animation.keys.find((candidate) => candidate.frame === state.frame);
  if (!key) {
    const frames = frameList(animation.keys.map((candidate) => candidate.frame));
    return { ...state, status: error(`Frame ${state.frame} is between keys: ${animation.name} poses at frames ${frames}`) };
  }
  const weapons = weaponRigs(model);
  const current = constraintsOf(key, weapons);
  const rig = model.rig;
  if (name === null && !current.weapon) return { ...state, status: error(`The key at frame ${state.frame} holds no weapon`) };
  if (name !== null && current.weapon?.weapon.name === name) return { ...state, status: error(`The key at frame ${state.frame} already holds the ${name}`) };
  const picked = name === null ? null : model.weapons.find((candidate) => candidate.weapon.name === name);
  if (picked === undefined) return { ...state, status: error(`There is no weapon named '${name}'`) };
  const weapon = picked?.weapon ?? null;
  const chains = weapon ? weaponChains(weapon) : [];
  const ready = picked ? carryReady(rig, key.pose, picked.hold, picked.weapon) : null;
  const constraints = {
    pins: current.pins.filter((pin) => !chains.includes(pin.chain)),
    weapon: weapon && ready ? { weapon, bodies: ready.bodies } : null,
  };
  const solved = holdConstraints(rig, key.pose, constraints);
  const result = setKeyPose(rig, animation, state.frame, solved.pose, constraints, weapons);
  if (!result.ok) return { ...state, status: error(result.error) };
  const animations = model.animations.map((candidate) => (candidate === animation ? result.animation : candidate));
  const released = current.pins.filter((pin) => chains.includes(pin.chain)).map((pin) => `unpinned ${pin.chain}`);
  const notes = [
    weapon ? `${animation.name} holds the ${weapon.name} at frame ${state.frame}` : `${animation.name} let go of the ${current.weapon!.weapon.name} at frame ${state.frame}`,
    ...released,
    ...solved.violations,
  ];
  return edit(state, { ...model, animations }, { status: solved.violations.length ? error(notes.join("; ")) : info(notes.join("; ")) });
}
