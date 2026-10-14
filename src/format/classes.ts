// Animation classes: `unarmed`, or the name of the library weapon an animation holds on every key.
import type { AnimationKind } from "./timing";

/** The class whose animations hold no weapon. No weapon may take its name. */
export const UNARMED = "unarmed";

/** An animation's name: its class and kind, such as `unarmed-idle` or `sword-attack`, so each pair is one animation. */
export const animationName = (animationClass: string, kind: AnimationKind): string => `${animationClass}-${kind}`;
