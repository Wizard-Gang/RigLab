// The chibi: Hexframe's 11-bone rig at about two heads tall, from the library folder, drawn in the library's first skin.
import { LIBRARY } from "../library/active";
import type { LibrarySkin } from "../library/load";
import type { RigLabRig } from "../format/rig";
import type { Part } from "../hexframe/parts";

export const CHIBI_RIG: RigLabRig = LIBRARY.rig;

/** The skin the editor draws with: the first `skin` line in the library's `config.txt`. */
export const CHIBI_SKIN: LibrarySkin = LIBRARY.skins[0]!;

/** Chibi art, keyed by the chibi bones' own `chibi_*` slots so it never lands on another rig. */
export const CHIBI_PARTS: Readonly<Record<string, Part>> = CHIBI_SKIN.parts;
