// The library's palettes as one stylesheet: each skin's and weapon's palette.json, scoped to its own art set.
import { paletteCss } from "../format/palette";
import type { Library } from "./load";

export function libraryCss(library: Library): string {
  return [...library.skins, ...library.weapons].map((set) => paletteCss(set.name, set.palette)).join("\n");
}
