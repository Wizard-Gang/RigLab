// Node only: which library folder RigLab reads, and reading exactly the files its config.txt maps, inside the folder.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { CONFIG_FILE, parseConfig } from "./config";
import type { LibraryFiles } from "./files";

/** The owner's library, when no `RIGLAB_LIBRARY` names another. */
export const HOME_LIBRARY = join("Documents", "RigLab");
export const PLACEHOLDER_LIBRARY = "placeholder-library";
export const READ_TYPES = /\.(?:txt|json|svg)$/;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface LibraryFolder {
  readonly dir: string;
  /** For the status bar: home-relative, or "placeholder library". */
  readonly label: string;
}

export interface FolderChoice {
  /** The repository root, where the placeholder lives and `RIGLAB_LIBRARY` resolves from. */
  readonly root: string;
  readonly home: string;
  readonly env?: string | undefined;
  /** Checks and tests always read the placeholder, whatever folders exist on the machine. */
  readonly placeholder?: boolean;
}

function labelOf(dir: string, home: string): string {
  return dir === home || dir.startsWith(home + sep) ? `~${dir.slice(home.length)}` : dir;
}

/** `RIGLAB_LIBRARY`, else `~/Documents/RigLab/` when it holds a `config.txt`, else the repository's placeholder. */
export function chooseLibraryFolder({ root, home, env, placeholder = false }: FolderChoice): LibraryFolder {
  if (!placeholder && env) {
    const dir = isAbsolute(env) ? env : resolve(root, env);
    return { dir, label: labelOf(dir, home) };
  }
  const own = join(home, HOME_LIBRARY);
  if (!placeholder && existsSync(join(own, CONFIG_FILE))) return { dir: own, label: labelOf(own, home) };
  return { dir: join(root, PLACEHOLDER_LIBRARY), label: "placeholder library" };
}

export interface FolderRead {
  readonly files: LibraryFiles;
  /** Problems reading, as opposed to problems in what was read, which the loader reports. */
  readonly errors: readonly string[];
  /** Every real path read or listed, for the dev server to watch. */
  readonly watched: readonly string[];
}

/**
 * Read `config.txt` and only what it maps: a rig or animation file, or the `.txt`, `.json` and `.svg` files directly
 * inside a skin or weapon directory. Anything that resolves outside the folder (through `..` or a symlink), a mapped
 * file of another type, and any file over 2 MiB are refused. A missing file is left for the loader to name.
 */
export function readLibraryFolder(dir: string): FolderRead {
  const errors: string[] = [];
  const files: Record<string, string> = {};
  const watched: string[] = [];
  let base: string;
  try {
    base = realpathSync(dir);
  } catch {
    return { files, errors: [`${dir}: the library folder does not exist`], watched };
  }
  const inside = (path: string): string | null => {
    let real: string;
    try {
      real = realpathSync(path);
    } catch {
      return null;
    }
    return real === base || real.startsWith(base + sep) ? real : "";
  };
  const read = (relative: string): void => {
    const real = inside(join(base, relative));
    if (real === null) return;
    if (!real) errors.push(`${relative}: resolves outside the library folder`);
    else if (!READ_TYPES.test(relative)) errors.push(`${relative}: only .txt, .json and .svg files are read`);
    else if (!statSync(real).isFile()) errors.push(`${relative}: is not a file`);
    else if (statSync(real).size > MAX_FILE_BYTES) errors.push(`${relative}: is larger than ${MAX_FILE_BYTES} bytes`);
    else {
      files[relative] = readFileSync(real, "utf8");
      watched.push(real);
    }
  };
  read(CONFIG_FILE);
  const config = files[CONFIG_FILE] === undefined ? null : parseConfig(files[CONFIG_FILE]);
  if (!config?.ok) return { files, errors, watched };
  for (const entry of config.value) {
    if (entry.kind === "rig" || entry.kind === "animation") {
      read(entry.path);
      continue;
    }
    const real = inside(join(base, entry.path));
    if (real === null) continue;
    if (!real) errors.push(`${entry.path}: resolves outside the library folder`);
    else if (!statSync(real).isDirectory()) errors.push(`${entry.path}: must be a directory`);
    else {
      watched.push(real);
      for (const item of readdirSync(real, { withFileTypes: true })) {
        if (READ_TYPES.test(item.name) && !item.isDirectory()) read(`${entry.path}/${item.name}`);
      }
    }
  }
  return { files, errors, watched };
}
