// Pose-mode weapon picks: a key takes a weapon at its ready hold or lets go, and the document keeps only the weapons
// its keys hold.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { HeldWeapon } from "../format/constraints";
import type { RigLabDocument } from "../format/document";
import type { RigLabRig } from "../format/rig";
import { frameList } from "../format/timing";
import { weaponChains } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import { rotate, tidy } from "../solve/angles";
import { constraintsOf, holdConstraints } from "../solve/constraints";
import { place } from "../solve/pose";
import { readyHold, weaponNamed } from "../weapons/weapons";
import { edit } from "./core";
import { setKeyPose } from "./poseEdits";
import { activeAnimationOf, documentOf, error, info } from "./types";
import type { EditorState } from "./types";

/** Keep only the weapon copies some key holds, and no `weapons` field at all when none is held. */
export function pruneWeapons(document: RigLabDocument): RigLabDocument {
  const held = new Set(document.animations.flatMap((animation) => animation.keys.flatMap((key) => (key.weapon ? [key.weapon.name] : []))));
  const { weapons, ...rest } = document;
  const kept = (weapons ?? []).filter((weapon) => held.has(weapon.name));
  return kept.length ? { ...rest, weapons: kept } : rest;
}

/** A ready hold for the chibi at rest, carried to where the body stands: the frame the gripping arms hang from. */
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
  const document = documentOf(state);
  const animation = activeAnimationOf(state);
  if (!animation) return { ...state, status: error("Add an animation to hold a weapon") };
  const key = animation.keys.find((candidate) => candidate.frame === state.frame);
  if (!key) {
    const frames = frameList(animation.keys.map((candidate) => candidate.frame));
    return { ...state, status: error(`Frame ${state.frame} is between keys: ${animation.name} poses at frames ${frames}`) };
  }
  const weapons = document.weapons ?? [];
  const current = constraintsOf(key, weapons);
  const rig = document.rig;
  if (name === null && !current.weapon) return { ...state, status: error(`The key at frame ${state.frame} holds no weapon`) };
  if (name !== null && current.weapon?.weapon.name === name) return { ...state, status: error(`The key at frame ${state.frame} already holds the ${name}`) };
  const weapon = name === null ? null : weapons.find((candidate) => candidate.name === name) ?? weaponNamed(name);
  if (name !== null && !weapon) return { ...state, status: error(`There is no weapon named '${name}'`) };
  const chains = weapon ? weaponChains(weapon) : [];
  const ready = weapon ? carryReady(rig, key.pose, readyHold(weapon), weapon) : null;
  const constraints = {
    pins: current.pins.filter((pin) => !chains.includes(pin.chain)),
    weapon: weapon && ready ? { weapon, bodies: ready.bodies } : null,
  };
  const solved = holdConstraints(rig, key.pose, constraints);
  const available = weapon && !weapons.some((candidate) => candidate.name === weapon.name) ? [...weapons, weapon] : weapons;
  const result = setKeyPose(rig, animation, state.frame, solved.pose, constraints, available);
  if (!result.ok) return { ...state, status: error(result.error) };
  const animations = document.animations.map((candidate) => (candidate === animation ? result.animation : candidate));
  const next = pruneWeapons({ ...document, animations, weapons: available });
  const released = current.pins.filter((pin) => chains.includes(pin.chain)).map((pin) => `unpinned ${pin.chain}`);
  const notes = [
    weapon ? `${animation.name} holds the ${weapon.name} at frame ${state.frame}` : `${animation.name} let go of the ${current.weapon!.weapon.name} at frame ${state.frame}`,
    ...released,
    ...solved.violations,
  ];
  return edit(state, next, { status: solved.violations.length ? error(notes.join("; ")) : info(notes.join("; ")) });
}
