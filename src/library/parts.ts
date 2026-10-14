// Art by slot: what the editor draws on the rig's slots and on the weapons' bodies.
import type { Part } from "../hexframe/parts";
import type { Library, LibrarySkin } from "./load";

/** A skin's parts on the rig's slots, the first `skin` line's by default, and every weapon's parts on its slots. */
export function partsBySlot(library: Library, skin: LibrarySkin = library.skins[0]!): Readonly<Record<string, Part>> {
  return Object.freeze(Object.assign({}, skin.parts, ...library.weapons.map((item) => item.parts)));
}
