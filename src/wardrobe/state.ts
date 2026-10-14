// The wardrobe's pure state: which skin each slot wears, the selected slot, the class shown and its motion.
import type { RigLabAnimation } from "../format/animation";
import { UNARMED } from "../format/classes";
import { ANIMATION_KINDS } from "../format/timing";
import type { AnimationKind } from "../format/timing";
import type { Part } from "../hexframe/parts";
import type { Library, LibraryWeapon } from "../library/load";

export interface WardrobeState {
  /** The skin last put on every slot, as an index into the library's skins. */
  readonly skin: number;
  /** Per rig slot, in bone order: the index of the skin whose part it wears. */
  readonly outfit: readonly number[];
  /** The selected slot, as an index into the rig's bones. */
  readonly slot: number;
  /** 0 is unarmed; `n` is the class of the library's `n`th weapon. */
  readonly class: number;
  /** 0 is the rest pose; `n` plays the class's animation of the `n`th kind. */
  readonly motion: number;
}

export type Step = -1 | 1;

export type WardrobeAction =
  | { readonly type: "skin"; readonly step: Step }
  | { readonly type: "slot"; readonly step: Step }
  | { readonly type: "selectSlot"; readonly slot: number }
  | { readonly type: "part"; readonly step: Step; readonly slot?: number }
  | { readonly type: "class"; readonly step: Step }
  | { readonly type: "motion"; readonly step: Step }
  | { readonly type: "reset" };

const wrap = (value: number, count: number): number => (count ? ((value % count) + count) % count : 0);

export function initialWardrobe(library: Library): WardrobeState {
  return { skin: 0, outfit: library.rig.bones.map(() => 0), slot: 0, class: 0, motion: 0 };
}

/** Steps wrap around in both directions, and every slot always wears one of the library's skins. */
export function wardrobeReducer(library: Library, state: WardrobeState, action: WardrobeAction): WardrobeState {
  const skins = library.skins.length;
  switch (action.type) {
    case "skin": {
      const skin = wrap(state.skin + action.step, skins);
      return { ...state, skin, outfit: state.outfit.map(() => skin) };
    }
    case "slot":
      return { ...state, slot: wrap(state.slot + action.step, state.outfit.length) };
    case "selectSlot":
      return action.slot >= 0 && action.slot < state.outfit.length ? { ...state, slot: action.slot } : state;
    case "part": {
      const slot = action.slot ?? state.slot;
      if (slot < 0 || slot >= state.outfit.length) return state;
      return { ...state, slot, outfit: state.outfit.map((worn, index) => (index === slot ? wrap(worn + action.step, skins) : worn)) };
    }
    case "class":
      return { ...state, class: wrap(state.class + action.step, library.weapons.length + 1) };
    case "motion":
      return { ...state, motion: wrap(state.motion + action.step, ANIMATION_KINDS.length + 1) };
    case "reset":
      return { ...state, outfit: state.outfit.map(() => state.skin) };
  }
}

/** The weapon the class holds, or null when unarmed. */
export function heldWeapon(library: Library, state: WardrobeState): LibraryWeapon | null {
  return state.class ? library.weapons[state.class - 1] ?? null : null;
}

/** The class shown: `unarmed`, or a weapon's name. */
export const shownClass = (library: Library, state: WardrobeState): string => heldWeapon(library, state)?.name ?? UNARMED;

/** The kind the motion plays, or null at rest. */
export const shownKind = (state: WardrobeState): AnimationKind | null => (state.motion ? ANIMATION_KINDS[state.motion - 1] ?? null : null);

/** The class's animation of the shown kind; null at rest, or when the library lacks it. */
export function shownMotion(library: Library, state: WardrobeState): RigLabAnimation | null {
  const kind = shownKind(state);
  const animationClass = shownClass(library, state);
  return kind ? library.animations.find((animation) => animation.class === animationClass && animation.kind === kind) ?? null : null;
}

/** The parts the outfit wears, by slot, plus the class weapon's parts. */
export function wornParts(library: Library, state: WardrobeState): Readonly<Record<string, Part>> {
  const parts: Record<string, Part> = {};
  library.rig.bones.forEach((bone, index) => {
    const part = library.skins[state.outfit[index] ?? 0]?.parts[bone.slot];
    if (part) parts[bone.slot] = part;
  });
  return { ...parts, ...(heldWeapon(library, state)?.parts ?? {}) };
}
