// The repository's placeholder library, read as the loader takes it: folder-relative paths to file text.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { LibraryFiles } from "../../src/library/files";

export const PLACEHOLDER = join(import.meta.dirname, "../../placeholder-library");

export function readFolder(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(txt|json|svg)$/.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(root, path).split(sep).join("/")] = readFileSync(path, "utf8");
  }
  return files;
}

export const placeholderFiles = (): Record<string, string> => readFolder(PLACEHOLDER);

/** A copy of the placeholder with `changes` applied: text replaces a file, null removes it. */
export function withChanges(changes: Readonly<Record<string, string | null>>): LibraryFiles {
  const files = placeholderFiles();
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return files;
}
