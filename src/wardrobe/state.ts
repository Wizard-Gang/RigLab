// The wardrobe's pure state: which skin each slot wears, the selected slot, the weapon held and the motion shown.
import type { Part } from "../hexframe/parts";
import type { Library, LibraryWeapon } from "../library/load";
import type { RigLabAnimation } from "../format/animation";

export interface WardrobeState {
  /** The skin last put on every slot, as an index into the library's skins. */
  readonly skin: number;
  /** Per rig slot, in bone order: the index of the skin whose part it wears. */
  readonly outfit: readonly number[];
  /** The selected slot, as an index into the rig's bones. */
  readonly slot: number;
  /** 0 holds nothing; `n` holds the library's `n`th weapon. */
  readonly weapon: number;
  /** 0 is the rest pose; `n` plays the library's `n`th animation. */
  readonly motion: number;
}

export type Step = -1 | 1;

export type WardrobeAction =
  | { readonly type: "skin"; readonly step: Step }
  | { readonly type: "slot"; readonly step: Step }
  | { readonly type: "selectSlot"; readonly slot: number }
  | { readonly type: "part"; readonly step: Step; readonly slot?: number }
  | { readonly type: "weapon"; readonly step: Step }
  | { readonly type: "motion"; readonly step: Step }
  | { readonly type: "reset" };

const wrap = (value: number, count: number): number => (count ? ((value % count) + count) % count : 0);

export function initialWardrobe(library: Library): WardrobeState {
  return { skin: 0, outfit: library.rig.bones.map(() => 0), slot: 0, weapon: 0, motion: 0 };
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
    case "weapon":
      return { ...state, weapon: wrap(state.weapon + action.step, library.weapons.length + 1) };
    case "motion":
      return { ...state, motion: wrap(state.motion + action.step, library.animations.length + 1) };
    case "reset":
      return { ...state, outfit: state.outfit.map(() => state.skin) };
  }
}

/** The parts the outfit wears, by slot, plus the held weapon's parts. */
export function wornParts(library: Library, state: WardrobeState): Readonly<Record<string, Part>> {
  const parts: Record<string, Part> = {};
  library.rig.bones.forEach((bone, index) => {
    const part = library.skins[state.outfit[index] ?? 0]?.parts[bone.slot];
    if (part) parts[bone.slot] = part;
  });
  return { ...parts, ...(heldWeapon(library, state)?.parts ?? {}) };
}

export function heldWeapon(library: Library, state: WardrobeState): LibraryWeapon | null {
  return state.weapon ? library.weapons[state.weapon - 1] ?? null : null;
}

export function shownMotion(library: Library, state: WardrobeState): RigLabAnimation | null {
  return state.motion ? library.animations[state.motion - 1] ?? null : null;
}
