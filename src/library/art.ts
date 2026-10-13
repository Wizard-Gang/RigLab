// A skin's or a weapon's directory: one part SVG per slot it draws, and the palette its class tokens come from.
import { PALETTE_FILE, validatePalette } from "../format/palette";
import type { RigLabPalette } from "../format/palette";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";
import { listDirectory, readJson, slotStem } from "./files";
import { pixelProblems } from "./pixel";
import type { LibraryErrors, LibraryFiles } from "./files";

/** An art set from the library: its parts by slot, all drawn in its own palette. */
export interface ArtSet {
  /** The config name, which is also the art set the parts draw in. */
  readonly name: string;
  readonly parts: Readonly<Record<string, Part>>;
  readonly palette: RigLabPalette;
}

/** A slot the directory must draw, and the `data-bone` its part has to name. */
export interface SlotArt {
  readonly slot: string;
  readonly bone: string;
}

export function readPalette(files: LibraryFiles, dir: string, errors: LibraryErrors): RigLabPalette | null {
  const path = `${dir}/${PALETTE_FILE}`;
  const value = readJson(files, path, errors);
  if (value === undefined) return null;
  const result = validatePalette(value);
  errors.nested(path, result);
  return result.ok ? result.value : null;
}

/**
 * Read a directory's parts: exactly one `<stem>.svg` per slot, each through the strict part parser, naming the bone
 * it was drawn for and using only class tokens its palette defines. A `pixel` palette's parts must also keep the pixel
 * contract. `data` lists the other files it may hold.
 */
export function readArtSet(
  files: LibraryFiles,
  name: string,
  dir: string,
  slots: readonly SlotArt[],
  data: readonly string[],
  errors: LibraryErrors,
): ArtSet | null {
  const before = errors.errors.length;
  const palette = readPalette(files, dir, errors);
  const byStem = new Map(slots.map((slot) => [slotStem(slot.slot), slot]));
  const present = listDirectory(files, dir);
  for (const file of present) {
    if (file.endsWith(".svg") && !byStem.has(file.slice(0, -4))) errors.add(`${dir}/${file}`, "draws none of the slots this directory is for");
    if (file.endsWith(".json") && file !== PALETTE_FILE && !data.includes(file)) errors.add(`${dir}/${file}`, "is not a file this directory takes");
  }
  const parts: Record<string, Part> = {};
  for (const [stem, { slot, bone }] of byStem) {
    const path = `${dir}/${stem}.svg`;
    const markup = files[path];
    if (markup === undefined) {
      errors.add(path, `is missing; it draws slot '${slot}'`);
      continue;
    }
    let part: Part;
    try {
      part = parsePart(markup, name);
    } catch (error) {
      errors.add(path, (error as Error).message);
      continue;
    }
    if (part.bone !== bone) errors.add(path, `data-bone '${part.bone}' must be '${bone}'`);
    if (palette?.pixel) for (const problem of pixelProblems(part)) errors.add(path, problem);
    const tokens = new Set(part.paths.flatMap((item) => item.className.split(" ")));
    for (const token of tokens) {
      if (palette && !Object.hasOwn(palette.classes, token)) errors.add(path, `class '${token}' is not defined in ${dir}/${PALETTE_FILE}`);
    }
    parts[slot] = part;
  }
  return errors.errors.length === before && palette ? { name, parts: Object.freeze(parts), palette } : null;
}
