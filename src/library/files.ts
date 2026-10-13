// Reading a library's files: text by folder-relative path, with every failure named by the file it is about.
import type { Validation } from "../format/validate";

/** Folder-relative path (`skins/chibi/head.svg`) to the file's text. */
export type LibraryFiles = Readonly<Record<string, string>>;

export class LibraryErrors {
  readonly errors: string[] = [];

  add(file: string, message: string): void {
    this.errors.push(`${file}: ${message}`);
  }

  /** A format validator's `$`-path errors, under the file they came from. */
  nested(file: string, result: Validation<unknown>): void {
    if (!result.ok) for (const error of result.errors) this.add(file, error);
  }
}

/** A file's parsed JSON, or undefined after recording why it could not be read. */
export function readJson(files: LibraryFiles, path: string, errors: LibraryErrors): unknown {
  const text = files[path];
  if (text === undefined) {
    errors.add(path, "is missing");
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.add(path, `is not valid JSON (${(error as Error).message})`);
    return undefined;
  }
}

/** The names of the files directly inside `dir`. */
export function listDirectory(files: LibraryFiles, dir: string): readonly string[] {
  const prefix = `${dir}/`;
  return Object.keys(files).filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/")).map((path) => path.slice(prefix.length));
}

/** A part file is named after its slot without the slot's first `_`-separated prefix: `chibi_arm_lower_l` → `arm_lower_l`. */
export function slotStem(slot: string): string {
  return slot.slice(slot.indexOf("_") + 1);
}
