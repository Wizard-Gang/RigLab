// Node only: `npm run check:library [folder]` reads a library folder as the dev server does and reports what loaded.
import { homedir } from "node:os";
import { chooseLibraryFolder, readLibraryFolder } from "./folder";
import { loadLibrary } from "./load";

export interface FolderReport {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/** `folder`, or the folder `npm start` would choose, read and loaded; the report lists every problem or every set. */
export function checkLibraryFolder(root: string, folder?: string): FolderReport {
  const chosen = chooseLibraryFolder({ root, home: homedir(), env: folder ?? process.env.RIGLAB_LIBRARY });
  const read = readLibraryFolder(chosen.dir);
  const loaded = read.errors.length ? null : loadLibrary(read.files);
  const head = `RigLab library ${chosen.label} (${chosen.dir})`;
  if (!loaded?.ok) return { ok: false, lines: [`${head} did not load:`, ...(loaded && !loaded.ok ? loaded.errors : read.errors)] };
  const { rig, skins, weapons, animations } = loaded.value;
  const list = (items: readonly { readonly name: string }[]) => items.map((item) => item.name).join(", ") || "none";
  return { ok: true, lines: [
    `${head} loaded ${Object.keys(read.files).length} files.`,
    `rig: ${rig.name} (${rig.bones.length} bones)`,
    `skins: ${list(skins)}`,
    `weapons: ${list(weapons)}`,
    `animations: ${list(animations)}`,
  ] };
}
