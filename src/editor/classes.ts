// Each class's animations start from the unarmed ones: the same motion, with the class weapon in hand.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { Key, RigLabAnimation } from "../format/animation";
import { animationName, UNARMED } from "../format/classes";
import type { HeldWeapon } from "../format/constraints";
import type { RigLabRig } from "../format/rig";
import { ANIMATION_KINDS } from "../format/timing";
import type { AnimationKind } from "../format/timing";
import { freeBodies, weaponChains } from "../format/weapon";
import type { RigLabWeapon } from "../format/weapon";
import { rotate, tidy } from "../solve/angles";
import { holdConstraints } from "../solve/constraints";
import { place } from "../solve/pose";
import { blankAnimation } from "./animations";
import type { LibraryModel, ModelWeapon } from "./model";

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

export interface Started {
  readonly animation: RigLabAnimation;
  /** Each grip a hand could not reach, by key; the arm stays at its closest reach, never stretched. */
  readonly misses: readonly string[];
}

/**
 * The class's animation of `kind`, started from `unarmed` (the rest pose when there is none). Every key keeps its frame,
 * interpolation and pose, and its pins on chains the weapon does not grip. A free body sits at the weapon's hold carried
 * with the torso, and both arms re-solve to its grips; a weapon whose bodies ride the hands keeps the unarmed arms.
 */
export function startClassAnimation(rig: RigLabRig, held: ModelWeapon, kind: AnimationKind, unarmed?: RigLabAnimation): Started {
  const source = unarmed ?? blankAnimation(rig, kind);
  const { weapon, hold } = held;
  const name = animationName(weapon.name, kind);
  const gripped = new Set(weaponChains(weapon));
  const free = freeBodies(weapon).length > 0;
  const misses: string[] = [];
  const keys = source.keys.map((key): Key => {
    const pins = (key.pins ?? []).filter((pin) => !gripped.has(pin.chain));
    if (!free) return { frame: key.frame, interpolation: key.interpolation, pose: key.pose, ...(pins.length ? { pins } : {}) };
    const bodies = carryReady(rig, key.pose, hold, weapon).bodies;
    const solved = holdConstraints(rig, key.pose, { pins: [], weapon: { weapon, bodies } });
    misses.push(...solved.violations.map((violation) => `${name} at frame ${key.frame}: ${violation}`));
    return { frame: key.frame, interpolation: key.interpolation, pose: solved.pose, ...(pins.length ? { pins } : {}), bodies };
  });
  return { animation: { ...source, name, class: weapon.name, keys }, misses };
}

export interface Filled {
  readonly model: LibraryModel;
  /** The animations started, in the order they were added. */
  readonly started: readonly string[];
  readonly misses: readonly string[];
}

/**
 * Start every class and kind the model lacks, after the animations it has, in config and kind order: a missing unarmed
 * kind at the rest pose, and each armed one from the unarmed animation of its kind. An existing animation never changes.
 */
export function fillClasses(model: LibraryModel): Filled {
  const animations = [...model.animations];
  const named = (name: string) => animations.find((animation) => animation.name === name);
  const started: string[] = [];
  const misses: string[] = [];
  for (const kind of ANIMATION_KINDS) {
    if (named(animationName(UNARMED, kind))) continue;
    animations.push(blankAnimation(model.rig, kind));
    started.push(animationName(UNARMED, kind));
  }
  for (const held of model.weapons) {
    for (const kind of ANIMATION_KINDS) {
      if (named(animationName(held.weapon.name, kind))) continue;
      const result = startClassAnimation(model.rig, held, kind, named(animationName(UNARMED, kind)));
      animations.push(result.animation);
      started.push(result.animation.name);
      misses.push(...result.misses);
    }
  }
  return { model: started.length ? { ...model, animations } : model, started, misses };
}
