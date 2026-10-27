// `npm run convert:parts -- <library-folder>`: rewrite every pixel set's SVG cell art as riglab.part grids, losslessly.
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTE_FILE } from "../format/palette";
import { PART_EXTENSION, serializePart } from "../format/part";
import { parsePart } from "../hexframe/parts";
import { CONFIG_FILE, parseConfig } from "./config";
import { listDirectory } from "./files";
import type { LibraryFiles } from "./files";
import { readLibraryFolder } from "./folder";
import { cellsToGrid } from "./pixel";

export interface Conversion {
  /** Folder-relative path to the grid text to write. */
  readonly writes: Readonly<Record<string, string>>;
  /** Folder-relative SVG files the grids replace. */
  readonly removes: readonly string[];
  readonly errors: readonly string[];
}

/** The grids for every SVG part in a skin or weapon directory whose palette is a pixel palette; nothing else changes. */
export function convertPixelParts(files: LibraryFiles): Conversion {
  const writes: Record<string, string> = {};
  const removes: string[] = [];
  const errors: string[] = [];
  const config = files[CONFIG_FILE] === undefined ? null : parseConfig(files[CONFIG_FILE]);
  if (!config?.ok) return { writes, removes, errors: [`${CONFIG_FILE}: is missing or does not parse; run npm run check:library`] };
  for (const entry of config.value) {
    if (entry.kind !== "skin" && entry.kind !== "weapon") continue;
    let pixel = false;
    try {
      pixel = JSON.parse(files[`${entry.path}/${PALETTE_FILE}`] ?? "{}").pixel === true;
    } catch {
      errors.push(`${entry.path}/${PALETTE_FILE}: is not valid JSON`);
    }
    if (!pixel) continue;
    const present = listDirectory(files, entry.path);
    for (const file of present.filter((name) => name.endsWith(".svg"))) {
      const path = `${entry.path}/${file}`;
      const target = `${entry.path}/${file.slice(0, -4)}${PART_EXTENSION}`;
      if (files[target] !== undefined) {
        errors.push(`${target}: already exists; remove it or ${path} before converting`);
        continue;
      }
      try {
        writes[target] = serializePart(cellsToGrid(parsePart(files[path]!, entry.name)));
        removes.push(path);
      } catch (error) {
        errors.push(`${path}: ${(error as Error).message}`);
      }
    }
  }
  return { writes, removes, errors };
}

/** Convert `dir` in place, or change nothing when any part fails, so a folder is never left half converted. */
export function convertLibraryFolder(dir: string): { readonly ok: boolean; readonly lines: readonly string[] } {
  const read = readLibraryFolder(dir);
  if (read.errors.length) return { ok: false, lines: [`${dir} could not be read:`, ...read.errors] };
  const conversion = convertPixelParts(read.files);
  if (conversion.errors.length) return { ok: false, lines: [`${dir}: nothing was converted:`, ...conversion.errors] };
  for (const [path, text] of Object.entries(conversion.writes)) writeFileSync(join(dir, path), text);
  for (const path of conversion.removes) unlinkSync(join(dir, path));
  const count = conversion.removes.length;
  return { ok: true, lines: [count ? `${dir}: converted ${count} SVG part${count === 1 ? "" : "s"} to riglab.part grids.` : `${dir}: no pixel SVG parts to convert.`] };
}
