// A skin's or a weapon's directory: one part per slot it draws, and the palette its class tokens come from.
import { PALETTE_FILE, validatePalette } from "../format/palette";
import { PART_EXTENSION, validatePart } from "../format/part";
import type { RigLabPalette } from "../format/palette";
import { parsePart } from "../hexframe/parts";
import type { Part } from "../hexframe/parts";
import { listDirectory, readJson, slotStem } from "./files";
import { gridPart } from "./pixel";
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

/** The file that draws `stem`: a riglab.part grid in a pixel set, else a part SVG. */
export const partFile = (stem: string, pixel: boolean): string => `${stem}${pixel ? PART_EXTENSION : ".svg"}`;

/** The part in `path`, through the strict part parser or the grid validator, or null after recording why not. */
function readPart(files: LibraryFiles, path: string, set: string, pixel: boolean, errors: LibraryErrors): Part | null {
  if (pixel) {
    const value = readJson(files, path, errors);
    if (value === undefined) return null;
    const result = validatePart(value);
    errors.nested(path, result);
    return result.ok ? gridPart(result.value, set) : null;
  }
  try {
    return parsePart(files[path]!, set);
  } catch (error) {
    errors.add(path, (error as Error).message);
    return null;
  }
}

/**
 * Read a directory's parts: exactly one part per slot, naming the bone it was drawn for and using only class tokens
 * its palette defines. A `pixel` palette's parts are `<stem>.part.json` grids; any other palette's are `<stem>.svg`
 * files through the strict part parser. `data` lists the other files it may hold.
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
  const pixel = palette ? palette.pixel === true : present.some((file) => file.endsWith(PART_EXTENSION));
  for (const file of present) {
    const at = `${dir}/${file}`;
    if (file.endsWith(PART_EXTENSION)) {
      if (!pixel) errors.add(at, `is a pixel part, but ${dir}/${PALETTE_FILE} is not a pixel palette`);
      else if (!byStem.has(file.slice(0, -PART_EXTENSION.length))) errors.add(at, "draws none of the slots this directory is for");
    } else if (file.endsWith(".svg")) {
      if (pixel) errors.add(at, `is SVG cell art, but a pixel set's parts are riglab.part grids; convert it with 'npm run convert:parts -- <library-folder>'`);
      else if (!byStem.has(file.slice(0, -4))) errors.add(at, "draws none of the slots this directory is for");
    } else if (file.endsWith(".json") && file !== PALETTE_FILE && !data.includes(file)) errors.add(at, "is not a file this directory takes");
  }
  const parts: Record<string, Part> = {};
  for (const [stem, { slot, bone }] of byStem) {
    const path = `${dir}/${partFile(stem, pixel)}`;
    if (files[path] === undefined) {
      // An unconverted pixel part is already reported, with the converter that fixes it.
      if (!(pixel && files[`${dir}/${stem}.svg`] !== undefined)) errors.add(path, `is missing; it draws slot '${slot}'`);
      continue;
    }
    const part = readPart(files, path, name, pixel, errors);
    if (!part) continue;
    if (part.bone !== bone) errors.add(path, `${pixel ? "bone" : "data-bone"} '${part.bone}' must be '${bone}'`);
    const tokens = new Set(part.paths.flatMap((item) => item.className.split(" ")));
    for (const token of tokens) {
      if (palette && !Object.hasOwn(palette.classes, token)) errors.add(path, `class '${token}' is not defined in ${dir}/${PALETTE_FILE}`);
    }
    parts[slot] = part;
  }
  return errors.errors.length === before && palette ? { name, parts: Object.freeze(parts), palette } : null;
}
