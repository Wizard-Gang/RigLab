// The library this build of RigLab reads: the folder the Vite plugin chose, loaded once.
import source from "virtual:riglab-library";
import { loadLibrary } from "./load";
import type { Library } from "./load";

function load(): Library {
  const result = loadLibrary(source.files);
  if (!result.ok) throw new Error(`RigLab library ${source.label} did not load:\n${result.errors.join("\n")}`);
  return result.value;
}

export const LIBRARY: Library = load();

/** Where the library came from, home-relative, or "placeholder library". */
export const LIBRARY_LABEL: string = source.label;
