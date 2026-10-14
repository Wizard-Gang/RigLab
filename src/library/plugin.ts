// Node only: the Vite plugin that serves the chosen library folder to the editor as `virtual:riglab-library`. On the
// dev server it also writes the editor's saves back into the folder, and restarts when the plugin's own code changes.
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { handleSave } from "./endpoint";
import { chooseLibraryFolder, PLACEHOLDER_LIBRARY, readLibraryFolder } from "./folder";
import type { LibraryFolder } from "./folder";
import { loadLibrary } from "./load";
import { SAVE_ROUTE, SAVED_EVENT } from "./save";
import type { SavedEvent } from "./save";
import { RecentWrites } from "./write";

export const LIBRARY_MODULE = "virtual:riglab-library";
const RESOLVED = `\0${LIBRARY_MODULE}`;
/** How long the plugin's code must stay unchanged before the dev server restarts, so a burst restarts it once. */
export const RESTART_DELAY_MS = 100;

export interface LibraryPluginOptions {
  readonly root: string;
  /** Read the repository's placeholder whatever `RIGLAB_LIBRARY` or the home folder say: for tests and checks. */
  readonly placeholder?: boolean;
  /** The files the plugin's code was loaded from. On the dev server, a change to one restarts the server. */
  readonly sources?: readonly string[];
}

/** The module's source: the folder's label and files, after the loader has accepted them. */
export function libraryModule(folder: LibraryFolder): { readonly source: string; readonly watched: readonly string[] } {
  const read = readLibraryFolder(folder.dir);
  const loaded = read.errors.length ? null : loadLibrary(read.files);
  const errors = loaded && !loaded.ok ? loaded.errors : read.errors;
  if (errors.length) throw new Error(`RigLab library ${folder.label} (${folder.dir}) did not load:\n${errors.join("\n")}`);
  return { source: `export default ${JSON.stringify({ label: folder.label, files: read.files })};\n`, watched: read.watched };
}

/** A path under `dir`'s real path, also as it reads under `dir` itself, which the watcher reports. */
function bothForms(dir: string, paths: readonly string[]): readonly string[] {
  let base: string;
  try {
    base = realpathSync(dir);
  } catch {
    return paths;
  }
  const own = resolve(dir);
  return paths.flatMap((path) => (path.startsWith(base + sep) ? [path, join(own, path.slice(base.length + 1))] : [path]));
}

/**
 * Vite loads this plugin once, with its config, and restarts only for files its config loader read. So once a burst of
 * changes to the plugin's sources settles, restart the server, which imports the plugin afresh. When the new code
 * fails to load, Vite logs why and keeps the running server, and with it this watch, so the next change tries again.
 */
function restartOnChange(server: ViteDevServer, sources: readonly string[]): void {
  const { root, logger } = server.config;
  const watched = new Set(bothForms(root, sources));
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restart = (): void => {
    logger.info(`RigLab library plugin: ${[...changed].join(", ")} changed, restarting server...`, { timestamp: true });
    changed.clear();
    server.restart().catch((error: unknown) => logger.error(`RigLab library plugin: restart failed: ${String(error)}`, { timestamp: true }));
  };
  server.watcher.on("all", (_event, path) => {
    if (!watched.has(path)) return;
    changed.add(relative(root, path));
    clearTimeout(timer);
    timer = setTimeout(restart, RESTART_DELAY_MS);
  });
}

export function riglabLibrary({ root, placeholder = false, sources = [] }: LibraryPluginOptions): Plugin {
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
      // Vitest runs Vite in middleware mode and reruns its own tests, so only the dev server restarts.
      if (sources.length && !server.config.server.middlewareMode) restartOnChange(server, sources);
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
            recent.add(bothForms(folder.dir, touched));
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
