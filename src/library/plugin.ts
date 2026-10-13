// Node only: the Vite plugin that serves the chosen library folder to the editor as `virtual:riglab-library`, and on
// the dev server writes the editor's saves back into it.
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { handleSave } from "./endpoint";
import { chooseLibraryFolder, PLACEHOLDER_LIBRARY, readLibraryFolder } from "./folder";
import type { LibraryFolder } from "./folder";
import { loadLibrary } from "./load";
import { SAVE_ROUTE, SAVED_EVENT } from "./save";
import type { SavedEvent } from "./save";
import { RecentWrites } from "./write";

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

/** A path under the folder's real path, also as it reads under the folder's own path, which the watcher reports. */
function bothForms(folder: LibraryFolder, paths: readonly string[]): readonly string[] {
  let base: string;
  try {
    base = realpathSync(folder.dir);
  } catch {
    return paths;
  }
  const dir = resolve(folder.dir);
  return paths.flatMap((path) => (path.startsWith(base + sep) ? [path, join(dir, path.slice(base.length + 1))] : [path]));
}

export function riglabLibrary({ root, placeholder = false }: LibraryPluginOptions): Plugin {
  const folder = chooseLibraryFolder({ root, home: homedir(), env: process.env.RIGLAB_LIBRARY, placeholder });
  // The repository's placeholder is never written: tests and checks read it, and a save belongs in a real library.
  const readOnly = resolve(folder.dir) === resolve(root, PLACEHOLDER_LIBRARY);
  const recent = new RecentWrites();
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
      server.config.logger.info(`RigLab library: ${folder.label}${readOnly ? " (read-only)" : ""}`);
      server.watcher.add(folder.dir);
      const invalidate = (): void => {
        const module = server.environments.client.moduleGraph.getModuleById(RESOLVED);
        if (module) server.environments.client.moduleGraph.invalidateModule(module);
      };
      // An outside edit reloads every page. RigLab's own save has already told every page through SAVED_EVENT.
      const changed = (path: string): void => {
        if (path !== folder.dir && !path.startsWith(folder.dir + sep) && !watched.includes(path)) return;
        if (recent.owns(path)) return;
        invalidate();
        server.environments.client.hot.send({ type: "full-reload" });
      };
      server.watcher.on("all", (_event, path) => changed(path));
      server.middlewares.use(SAVE_ROUTE, (request, response) => {
        void handleSave(request, folder, readOnly).then((outcome) => {
          if (outcome.result) {
            const { saveId, written, removed, touched } = outcome.result;
            recent.add(bothForms(folder, touched));
            invalidate();
            const data: SavedEvent = { saveId, written, removed };
            server.environments.client.hot.send({ type: "custom", event: SAVED_EVENT, data });
            server.config.logger.info(`RigLab library: saved ${written.length + removed.length} file(s) to ${folder.label}`);
          }
          response.statusCode = outcome.status;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(outcome.body));
        });
      });
    },
  };
}
