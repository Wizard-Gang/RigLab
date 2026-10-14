// How the app names classes and kinds to people.
import { KINDS } from "../format/timing";
import type { AnimationKind } from "../format/timing";

/** A class as people read it: `unarmed` is Unarmed, `sword` is Sword. */
export const classLabel = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/** An animation as people read it, by class and kind: Sword attack. */
export const animationLabel = (animationClass: string, kind: AnimationKind): string => `${classLabel(animationClass)} ${KINDS[kind].label.toLowerCase()}`;
