// Node only: the Vite plugin that serves the chosen library folder to the editor as `virtual:riglab-library`.
import { homedir } from "node:os";
import { sep } from "node:path";
import type { Plugin } from "vite";
import { chooseLibraryFolder, readLibraryFolder } from "./folder";
import type { LibraryFolder } from "./folder";
import { loadLibrary } from "./load";

export const LIBRARY_MODULE = "virtual:riglab-library";
const RESOLVED = `\0${LIBRARY_MODULE}`;

export interface LibraryPluginOptions {
  readonly root: string;
  /** Read the repository's placeholder whatever `RIGLAB_LIBRARY` or the home folder say: for tests and checks. */
  readonly placeholder?: boolean;
}

/** The module's source: the folder's label and files, after the loader has accepted them. */
export function libraryModule(folder: LibraryFolder): { readonly source: string; readonly watched: readonly string[] } {
  const read = readLibraryFolder(folder.dir);
  const loaded = read.errors.length ? null : loadLibrary(read.files);
  const errors = loaded && !loaded.ok ? loaded.errors : read.errors;
  if (errors.length) throw new Error(`RigLab library ${folder.label} (${folder.dir}) did not load:\n${errors.join("\n")}`);
  return { source: `export default ${JSON.stringify({ label: folder.label, files: read.files })};\n`, watched: read.watched };
}

export function riglabLibrary({ root, placeholder = false }: LibraryPluginOptions): Plugin {
  const folder = chooseLibraryFolder({ root, home: homedir(), env: process.env.RIGLAB_LIBRARY, placeholder });
  let watched: readonly string[] = [];
  return {
    name: "riglab-library",
    resolveId: (id) => (id === LIBRARY_MODULE ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      const module = libraryModule(folder);
      watched = module.watched;
      return module.source;
    },
    configureServer(server) {
      server.config.logger.info(`RigLab library: ${folder.label}`);
      server.watcher.add(folder.dir);
      const changed = (path: string): void => {
        if (path !== folder.dir && !path.startsWith(folder.dir + sep) && !watched.includes(path)) return;
        const module = server.environments.client.moduleGraph.getModuleById(RESOLVED);
        if (module) server.environments.client.moduleGraph.invalidateModule(module);
        server.environments.client.hot.send({ type: "full-reload" });
      };
      server.watcher.on("all", (_event, path) => changed(path));
    },
  };
}
